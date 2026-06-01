import { Router } from "express"
import { prisma } from "../lib/prisma"
import { validateJWT } from "../middleware/auth"

export const notificationsRouter = Router()

const MAX_LIMIT = 50
const DEFAULT_LIMIT = 20

// GET /api/notifications?offset=&limit= — paginated list for current user
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

    res.json({
      notifications: notifications.map((n) => ({
        ...n,
        createdAt: n.createdAt.toISOString(),
      })),
      total,
      unreadCount,
    })
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
