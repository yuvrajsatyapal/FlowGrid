import type http from "http"
import { Server } from "socket.io"
import { env } from "../config/env"
import { verifyAccessToken } from "./jwt"
import { redis, redisKeys } from "./redis"
import { prisma } from "./prisma"
import type { PresenceUser } from "@flowgrid/types"

let io: Server

export function initSocket(httpServer: http.Server): Server {
  io = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
  })

  // No sockets are connected yet on boot — drop any presence left over from a prior crash.
  void resetGlobalPresence()

  // Reject connections with missing or invalid JWT
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined
    if (!token) return next(new Error("AUTH_REQUIRED"))
    try {
      const payload = verifyAccessToken(token)
      socket.data.user = { id: payload.sub, email: payload.email }
      next()
    } catch {
      next(new Error("AUTH_INVALID"))
    }
  })

  io.on("connection", (socket) => {
    const userId = socket.data.user?.id as string | undefined
    if (!userId) return

    // Per-user room for notification:new events
    socket.join(userId)

    // Global online presence (any active socket connection marks the user online).
    // Presence is connection-driven (not tied to workspace:join), so a user shows
    // online the moment they open any page that holds a socket — including board pages.
    void (async () => {
      const nowOnline = await markUserOnline(userId)
      if (nowOnline) await broadcastUserPresence(userId, true)
    })()

    socket.on("board:join", async ({ boardId }: { boardId: string }) => {
      if (!boardId || typeof boardId !== "string") return

      // Two-layer board access check (mirrors resolveCardAccess in cards.ts)
      const board = await prisma.board.findUnique({
        where: { id: boardId },
        select: { id: true, workspaceId: true, visibility: true, deletedAt: true },
      })
      if (!board || board.deletedAt) {
        socket.emit("board:error", { code: "NOT_FOUND", message: "Board not found" })
        return
      }
      const member = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: board.workspaceId, userId } },
      })
      if (!member) {
        socket.emit("board:error", { code: "ACCESS_DENIED", message: "Access denied" })
        return
      }
      if (board.visibility === "PRIVATE") {
        const boardMember = await prisma.boardMember.findUnique({
          where: { boardId_userId: { boardId: board.id, userId } },
        })
        if (!boardMember) {
          socket.emit("board:error", { code: "ACCESS_DENIED", message: "Access denied" })
          return
        }
      }

      socket.join(boardId)

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, avatarUrl: true },
      })
      if (user) {
        const users = await addPresence(boardId, board.workspaceId, {
          userId: user.id,
          name: user.name,
          avatarUrl: user.avatarUrl,
          memberSince: member.createdAt.toISOString(),
        })
        io.to(boardId).emit("board:presence", { boardId, users })
      }
    })

    socket.on("board:leave", async ({ boardId }: { boardId: string }) => {
      if (!boardId || typeof boardId !== "string") return
      socket.leave(boardId)
      const users = await removePresence(boardId, userId)
      io.to(boardId).emit("board:presence", { boardId, users })
    })

    socket.on("workspace:join", async ({ workspaceId }: { workspaceId: string }) => {
      if (!workspaceId || typeof workspaceId !== "string") return
      const member = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
      })
      if (!member) return
      socket.join(`ws:${workspaceId}`)
      // Online/offline is broadcast from the connection/disconnection lifecycle (see
      // broadcastUserPresence) — NOT here — so navigating between pages within the
      // workspace never flips a still-connected user offline.
    })

    socket.on("workspace:leave", ({ workspaceId }: { workspaceId: string }) => {
      if (!workspaceId || typeof workspaceId !== "string") return
      socket.leave(`ws:${workspaceId}`)
    })

    // MUST be "disconnecting", not "disconnect": in socket.io v4 `socket.rooms` is
    // already cleared by the time the "disconnect" event fires, so room-based cleanup
    // (board presence + workspace offline broadcast) would silently no-op — leaving
    // users stuck "online" after logout/tab-close. In "disconnecting" the rooms are
    // still populated.
    socket.on("disconnecting", async () => {
      // Exclude socket.id (auto room) and userId (notification room).
      const allRooms = [...socket.rooms]
      const boardIds = allRooms.filter((r) => r !== socket.id && r !== userId && !r.startsWith("ws:"))

      for (const boardId of boardIds) {
        const users = await removePresence(boardId, userId)
        io.to(boardId).emit("board:presence", { boardId, users })
      }

      // Only flip the user offline once their LAST socket is gone (multiple tabs/pages
      // each hold a connection). Broadcast to every workspace they belong to — not just
      // this socket's rooms — because the last socket to close might not be in a ws room
      // (e.g. a board-only socket).
      const nowOffline = await markUserOffline(userId)
      if (nowOffline) await broadcastUserPresence(userId, false)
    })
  })

  return io
}

export function emitBoardEvent(boardId: string, event: string, payload: unknown): void {
  if (!io) return
  io.to(boardId).emit(event, payload)
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  if (!io) return
  io.to(userId).emit(event, payload)
}

export function emitWorkspaceEvent(workspaceId: string, event: string, payload: unknown): void {
  if (!io) return
  io.to(`ws:${workspaceId}`).emit(event, payload)
}

// ── Global user presence ───────────────────────────────────────────────────────
// A user is "online" while they hold at least one active socket connection.
// The counts hash handles multiple tabs/devices; the set gives O(1) membership lookups.
// Both keys are cleared on server boot (see resetGlobalPresence) so a hard crash can't
// leave a user stuck "online" forever.

// Returns true if this connection is the user's FIRST (they just came online).
async function markUserOnline(userId: string): Promise<boolean> {
  const count = await redis.hincrby(redisKeys.onlineCounts(), userId, 1)
  if (count === 1) {
    await redis.sadd(redisKeys.onlineUsers(), userId)
    return true
  }
  return false
}

// Returns true if this was the user's LAST connection (they just went offline).
async function markUserOffline(userId: string): Promise<boolean> {
  const count = await redis.hincrby(redisKeys.onlineCounts(), userId, -1)
  if (count <= 0) {
    await redis.hdel(redisKeys.onlineCounts(), userId)
    await redis.srem(redisKeys.onlineUsers(), userId)
    return true
  }
  return false
}

// Broadcast a user's online/offline transition to every workspace they belong to, so
// each workspace member viewing a members list / board header updates in real time.
async function broadcastUserPresence(userId: string, online: boolean): Promise<void> {
  if (!io) return
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true },
  })
  const event = online ? "workspace:member:online" : "workspace:member:offline"
  for (const m of memberships) {
    io.to(`ws:${m.workspaceId}`).emit(event, { userId })
  }
}

// Clear global presence state. Called once on boot — no sockets are connected yet,
// so any leftover entries are stale and must be dropped.
async function resetGlobalPresence(): Promise<void> {
  await redis.del(redisKeys.onlineUsers())
  await redis.del(redisKeys.onlineCounts())
}

// Returns the subset of `userIds` that are currently online.
export async function getOnlineUserIds(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return []
  const online = await redis.smembers(redisKeys.onlineUsers())
  const onlineSet = new Set(online)
  return userIds.filter((id) => onlineSet.has(id))
}

// ── Presence helpers ──────────────────────────────────────────────────────────

const PRESENCE_TTL_SECONDS = 86_400 // 24 h — cleaned up on disconnect; TTL is a safety net for crashes

async function addPresence(boardId: string, workspaceId: string, user: PresenceUser): Promise<PresenceUser[]> {
  const usersKey = redisKeys.boardPresenceUsers(boardId)
  const countsKey = redisKeys.boardPresenceCounts(boardId)
  await redis.hincrby(countsKey, user.userId, 1)
  await redis.hset(usersKey, { [user.userId]: user })
  await redis.expire(usersKey, PRESENCE_TTL_SECONDS)
  await redis.expire(countsKey, PRESENCE_TTL_SECONDS)
  return getPresence(boardId, workspaceId)
}

async function removePresence(boardId: string, userId: string): Promise<PresenceUser[]> {
  const usersKey = redisKeys.boardPresenceUsers(boardId)
  const countsKey = redisKeys.boardPresenceCounts(boardId)
  const newCount = await redis.hincrby(countsKey, userId, -1)
  if (newCount <= 0) {
    await redis.hdel(usersKey, userId)
    await redis.hdel(countsKey, userId)
  }
  return getPresence(boardId)
}

async function getPresence(boardId: string, workspaceId?: string): Promise<PresenceUser[]> {
  const usersKey = redisKeys.boardPresenceUsers(boardId)
  const raw = await redis.hgetall<Record<string, PresenceUser>>(usersKey)
  if (!raw) return []

  const users = Object.values(raw)

  // Backfill memberSince for stale entries that were stored before this field existed
  const missing = users.filter((u) => !u.memberSince)
  if (missing.length > 0 && workspaceId) {
    const memberships = await prisma.workspaceMember.findMany({
      where: { workspaceId, userId: { in: missing.map((u) => u.userId) } },
      select: { userId: true, createdAt: true },
    })
    const dateByUser = new Map(memberships.map((m) => [m.userId, m.createdAt.toISOString()]))
    const updates: Record<string, PresenceUser> = {}
    for (const u of missing) {
      const since = dateByUser.get(u.userId)
      if (since) {
        u.memberSince = since
        updates[u.userId] = u
      }
    }
    if (Object.keys(updates).length > 0) {
      await redis.hset(usersKey, updates)
    }
  }

  return users
}
