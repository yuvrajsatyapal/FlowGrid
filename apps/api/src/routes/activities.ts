import { Router } from "express"
import { prisma } from "../lib/prisma"
import { validateJWT } from "../middleware/auth"

const router = Router()

type ActivityUser = { id: string; name: string | null; avatarUrl: string | null }

function formatActivity(activity: {
  id: string
  cardId: string | null
  action: string
  metadata: unknown
  createdAt: Date
  user: ActivityUser | null
  card?: { title: string } | null
}) {
  return {
    id: activity.id,
    cardId: activity.cardId,
    cardTitle: activity.card?.title ?? null,
    user: activity.user,
    action: activity.action,
    metadata: activity.metadata as Record<string, unknown>,
    createdAt: activity.createdAt,
  }
}

// Resolve card → list → board → workspace access (read-only).
// Returns { card, board, membership } or writes 404 and returns null.
async function resolveCardAccess(
  res: Parameters<Parameters<typeof router.get>[1]>[1],
  cardId: string,
  userId: string,
) {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: { id: true, listId: true, deletedAt: true },
  })
  if (!card || card.deletedAt !== null) {
    res.status(404).json({ error: { message: "Card not found", status: 404 } })
    return null
  }

  const list = await prisma.list.findUnique({
    where: { id: card.listId },
    select: { id: true, boardId: true, deletedAt: true },
  })
  if (!list || list.deletedAt !== null) {
    res.status(404).json({ error: { message: "Card not found", status: 404 } })
    return null
  }

  const board = await prisma.board.findUnique({
    where: { id: list.boardId },
    select: { id: true, workspaceId: true, visibility: true, deletedAt: true },
  })
  if (!board || board.deletedAt !== null) {
    res.status(404).json({ error: { message: "Card not found", status: 404 } })
    return null
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: board.workspaceId, userId } },
  })
  if (!membership) {
    res.status(404).json({ error: { message: "Card not found", status: 404 } })
    return null
  }

  if (board.visibility === "PRIVATE") {
    const boardMember = await prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId: board.id, userId } },
    })
    if (!boardMember) {
      res.status(404).json({ error: { message: "Card not found", status: 404 } })
      return null
    }
  }

  return { card, board, membership }
}

// GET /api/activities/workspace?workspaceId=&limit=&days=&offset= — recent activities across a workspace
router.get("/workspace", validateJWT, async (req, res) => {
  const workspaceId = req.query.workspaceId as string | undefined
  if (!workspaceId) {
    res.status(400).json({ error: { message: "workspaceId is required", status: 400 } })
    return
  }

  const limit = Math.min(200, Math.max(1, parseInt((req.query.limit as string) ?? "10", 10) || 10))
  const offset = Math.max(0, parseInt((req.query.offset as string) ?? "0", 10) || 0)
  const days = req.query.days ? Math.min(30, Math.max(1, parseInt(req.query.days as string, 10) || 7)) : null

  try {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: req.user!.id } },
    })
    if (!membership) {
      res.status(404).json({ error: { message: "Workspace not found", status: 404 } })
      return
    }

    const dateFilter = days
      ? { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) }
      : undefined

    // Private boards: only visible to workspace OWNER/ADMIN or users with a BoardMember row.
    const isPrivileged = membership.role === "OWNER" || membership.role === "ADMIN"
    const boardVisibilityFilter = isPrivileged
      ? { workspaceId, deletedAt: null }
      : {
          workspaceId,
          deletedAt: null,
          OR: [
            { visibility: { not: "PRIVATE" as const } },
            { visibility: "PRIVATE" as const, members: { some: { userId: req.user!.id } } },
          ],
        }

    const where = {
      ...(dateFilter ? { createdAt: dateFilter } : {}),
      card: {
        deletedAt: null,
        list: { deletedAt: null, board: boardVisibilityFilter },
      },
    }

    const [items, total] = await prisma.$transaction([
      prisma.activity.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
          card: { select: { title: true } },
        },
      }),
      prisma.activity.count({ where }),
    ])

    res.json({ items: items.map(formatActivity), total, offset, limit })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch activities", status: 500 } })
  }
})

// GET /api/activities?cardId=&offset=&limit= — paginated activity feed for a card
router.get("/", validateJWT, async (req, res) => {
  const cardId = req.query.cardId as string | undefined
  if (!cardId) {
    res.status(400).json({ error: { message: "cardId is required", status: 400 } })
    return
  }

  const offset = Math.max(0, parseInt((req.query.offset as string) ?? "0", 10) || 0)
  const limit = Math.min(200, Math.max(1, parseInt((req.query.limit as string) ?? "100", 10) || 100))

  try {
    const access = await resolveCardAccess(res, cardId, req.user!.id)
    if (!access) return

    const [items, total] = await prisma.$transaction([
      prisma.activity.findMany({
        where: { cardId },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
          card: { select: { title: true } },
        },
      }),
      prisma.activity.count({ where: { cardId } }),
    ])

    res.json({ items: items.map(formatActivity), total, offset, limit })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch activities", status: 500 } })
  }
})

export { router as activitiesRouter }
