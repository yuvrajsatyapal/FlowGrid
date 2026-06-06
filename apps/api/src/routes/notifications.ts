import { Router } from "express"
import { prisma } from "../lib/prisma"
import { validateJWT } from "../middleware/auth"

export const notificationsRouter = Router()

const MAX_LIMIT = 50
const DEFAULT_LIMIT = 20

// GET /api/notifications?offset=&limit= — paginated list for current user
// Invite notifications (BOARD_INVITE, WORKSPACE_INVITE) are enriched with a
// live `inviteStatus` field derived from the invite record — never stored in
// the notification row. This means accept/decline on any surface is reflected
// immediately on the next fetch without any stale state.
// Query pattern: 1 (notifications) + 1 (counts) + 0–2 (invite status lookups).
notificationsRouter.get("/", validateJWT, async (req, res) => {
  const userId = req.user!.id
  const offset = Math.max(0, parseInt((req.query.offset as string) ?? "0", 10) || 0)
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt((req.query.limit as string) ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT))

  try {
    const [notifications, total, unreadCount] = await prisma.$transaction([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      prisma.notification.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, read: false } }),
    ])

    // ── Batch enrich invite notifications ─────────────────────────────────────
    // Collect invite IDs from this page only — never N+1.
    const workspaceInviteIds: string[] = []
    const boardInviteIds: string[] = []

    for (const n of notifications) {
      const data = (n.data ?? {}) as Record<string, unknown>
      if (n.type === "WORKSPACE_INVITE" && typeof data.workspaceInviteId === "string") {
        workspaceInviteIds.push(data.workspaceInviteId)
      }
      if (n.type === "BOARD_INVITE" && typeof data.boardInviteId === "string") {
        boardInviteIds.push(data.boardInviteId)
      }
    }

    // At most 2 extra queries regardless of page size
    const [wsInvites, boardInvites] = await Promise.all([
      workspaceInviteIds.length > 0
        ? prisma.workspaceInvite.findMany({
            where: { id: { in: workspaceInviteIds } },
            select: { id: true, status: true },
          })
        : Promise.resolve([]),
      boardInviteIds.length > 0
        ? prisma.boardInvite.findMany({
            where: { id: { in: boardInviteIds } },
            select: { id: true, status: true },
          })
        : Promise.resolve([]),
    ])

    const wsStatusMap = new Map(wsInvites.map((i) => [i.id, i.status]))
    const boardStatusMap = new Map(boardInvites.map((i) => [i.id, i.status]))

    const enriched = notifications.map((n) => {
      const base = { ...n, createdAt: n.createdAt.toISOString() }
      const data = (n.data ?? {}) as Record<string, unknown>

      if (n.type === "WORKSPACE_INVITE" && typeof data.workspaceInviteId === "string") {
        const status = wsStatusMap.get(data.workspaceInviteId) ?? null
        // null means the record was deleted — treat as INVALID
        return { ...base, inviteStatus: status ?? "INVALID" }
      }
      if (n.type === "BOARD_INVITE" && typeof data.boardInviteId === "string") {
        const status = boardStatusMap.get(data.boardInviteId) ?? null
        return { ...base, inviteStatus: status ?? "INVALID" }
      }

      return base
    })

    res.json({ notifications: enriched, total, unreadCount })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch notifications", status: 500 } })
  }
})

// POST /api/notifications/read?id= — mark one notification as read
notificationsRouter.post("/read", validateJWT, async (req, res) => {
  const userId = req.user!.id
  const id = req.query.id as string | undefined

  if (!id) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }

  try {
    const notification = await prisma.notification.findUnique({ where: { id } })
    if (!notification || notification.userId !== userId) {
      res.status(404).json({ error: { message: "Notification not found", status: 404 } })
      return
    }

    await prisma.notification.update({ where: { id }, data: { read: true } })
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: { message: "Failed to mark notification as read", status: 500 } })
  }
})

// POST /api/notifications/read-all — mark all unread for current user as read
notificationsRouter.post("/read-all", validateJWT, async (req, res) => {
  const userId = req.user!.id

  try {
    const result = await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    })
    res.json({ updated: result.count })
  } catch {
    res.status(500).json({ error: { message: "Failed to mark all notifications as read", status: 500 } })
  }
})
