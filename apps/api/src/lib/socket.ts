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
        const users = await addPresence(boardId, { userId: user.id, name: user.name, avatarUrl: user.avatarUrl })
        io.to(boardId).emit("board:presence", { boardId, users })
      }
    })

    socket.on("board:leave", async ({ boardId }: { boardId: string }) => {
      if (!boardId || typeof boardId !== "string") return
      socket.leave(boardId)
      const users = await removePresence(boardId, userId)
      io.to(boardId).emit("board:presence", { boardId, users })
    })

    socket.on("disconnect", async () => {
      // socket.rooms still contains joined rooms at disconnect time.
      // Exclude socket.id (default room) and userId (notification room — not a board).
      const boardIds = [...socket.rooms].filter((r) => r !== socket.id && r !== userId)
      for (const boardId of boardIds) {
        const users = await removePresence(boardId, userId)
        io.to(boardId).emit("board:presence", { boardId, users })
      }
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

// ── Presence helpers ──────────────────────────────────────────────────────────

const PRESENCE_TTL_SECONDS = 86_400 // 24 h — cleaned up on disconnect; TTL is a safety net for crashes

async function addPresence(boardId: string, user: PresenceUser): Promise<PresenceUser[]> {
  const usersKey = redisKeys.boardPresenceUsers(boardId)
  const countsKey = redisKeys.boardPresenceCounts(boardId)
  await redis.hincrby(countsKey, user.userId, 1)
  await redis.hset(usersKey, { [user.userId]: JSON.stringify(user) })
  // Refresh TTL so stale keys (from unclean server shutdown) expire automatically
  await redis.expire(usersKey, PRESENCE_TTL_SECONDS)
  await redis.expire(countsKey, PRESENCE_TTL_SECONDS)
  return getPresence(boardId)
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

async function getPresence(boardId: string): Promise<PresenceUser[]> {
  const usersKey = redisKeys.boardPresenceUsers(boardId)
  const raw = await redis.hgetall<Record<string, string>>(usersKey)
  if (!raw) return []
  return Object.values(raw).map((v) => JSON.parse(v) as PresenceUser)
}
