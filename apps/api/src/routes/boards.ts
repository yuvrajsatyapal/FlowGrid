import { Router } from "express"
import { prisma } from "../lib/prisma"
import { validateJWT } from "../middleware/auth"
import { canWrite } from "../lib/roles"

const router = Router()

const VALID_VISIBILITIES = ["WORKSPACE", "PRIVATE", "PUBLIC"] as const
type BoardVisibility = (typeof VALID_VISIBILITIES)[number]

// POST /api/boards — create board in workspace (OWNER | ADMIN)
router.post("/", validateJWT, async (req, res) => {
  const { workspaceId, name, visibility, coverColor } = req.body as {
    workspaceId?: string
    name?: string
    visibility?: string
    coverColor?: string
  }

  if (!workspaceId || typeof workspaceId !== "string") {
    res.status(400).json({ error: { message: "workspaceId is required", status: 400 } })
    return
  }
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: { message: "name is required", status: 400 } })
    return
  }
  if (name.trim().length > 100) {
    res.status(400).json({ error: { message: "name must be 100 characters or fewer", status: 400 } })
    return
  }

  const boardVisibility: BoardVisibility = (visibility as BoardVisibility) ?? "WORKSPACE"
  if (!VALID_VISIBILITIES.includes(boardVisibility)) {
    res.status(400).json({ error: { message: "visibility must be WORKSPACE, PRIVATE, or PUBLIC", status: 400 } })
    return
  }

  if (coverColor !== undefined && coverColor !== null) {
    if (typeof coverColor !== "string" || coverColor.trim().length > 50) {
      res.status(400).json({ error: { message: "coverColor must be 50 characters or fewer", status: 400 } })
      return
    }
  }

  try {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: req.user!.id } },
    })
    if (!membership) {
      res.status(404).json({ error: { message: "Workspace not found", status: 404 } })
      return
    }
    if (!canWrite(membership.role)) {
      res.status(403).json({ error: { message: "Viewers cannot create boards", status: 403 } })
      return
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { deletedAt: true } })
    if (!workspace || workspace.deletedAt !== null) {
      res.status(404).json({ error: { message: "Workspace not found", status: 404 } })
      return
    }

    const board = await prisma.board.create({
      data: {
        workspaceId,
        name: name.trim(),
        visibility: boardVisibility,
        coverColor: coverColor?.trim() || null,
      },
    })

    res.status(201).json({
      board: {
        id: board.id,
        workspaceId: board.workspaceId,
        name: board.name,
        description: board.description,
        visibility: board.visibility,
        coverColor: board.coverColor,
        createdAt: board.createdAt,
        updatedAt: board.updatedAt,
        deletedAt: board.deletedAt,
      },
    })
  } catch {
    res.status(500).json({ error: { message: "Failed to create board", status: 500 } })
  }
})

// GET /api/boards?workspaceId=xxx — list boards (any workspace member)
// PRIVATE boards are only visible to users with a BoardMember row for that board.
router.get("/", validateJWT, async (req, res) => {
  const workspaceId = req.query.workspaceId as string | undefined
  if (!workspaceId) {
    res.status(400).json({ error: { message: "workspaceId is required", status: 400 } })
    return
  }

  try {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: req.user!.id } },
    })
    if (!membership) {
      res.status(404).json({ error: { message: "Workspace not found", status: 404 } })
      return
    }

    const [boards, wsMembersRaw, memberCount] = await Promise.all([
      prisma.board.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          OR: [
            { visibility: { not: "PRIVATE" } },
            { members: { some: { userId: req.user!.id } } },
          ],
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          workspaceId: true,
          name: true,
          description: true,
          visibility: true,
          coverColor: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          lists: {
            where: { deletedAt: null },
            select: {
              _count: { select: { cards: { where: { deletedAt: null } } } },
            },
          },
        },
      }),
      // Fetch only the 2 oldest members for display (oldest first)
      prisma.workspaceMember.findMany({
        where: { workspaceId },
        take: 2,
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      }),
      prisma.workspaceMember.count({ where: { workspaceId } }),
    ])

    const wsMembers = wsMembersRaw.map((m) => ({ id: m.user.id, name: m.user.name, avatarUrl: m.user.avatarUrl }))

    res.json({
      boards: boards.map((b) => ({
        id: b.id,
        workspaceId: b.workspaceId,
        name: b.name,
        description: b.description,
        visibility: b.visibility,
        coverColor: b.coverColor,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        deletedAt: b.deletedAt,
        listCount: b.lists.length,
        cardCount: b.lists.reduce((acc, l) => acc + l._count.cards, 0),
        members: wsMembers,
        memberCount,
      })),
    })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch boards", status: 500 } })
  }
})

// GET /api/boards/one?id=xxx — board detail (workspace member; BoardMember required for PRIVATE boards)
router.get("/one", validateJWT, async (req, res) => {
  const boardId = req.query.id as string | undefined
  if (!boardId) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }

  try {
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: { _count: { select: { lists: true } } },
    })
    if (!board || board.deletedAt !== null) {
      res.status(404).json({ error: { message: "Board not found", status: 404 } })
      return
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: board.workspaceId, userId: req.user!.id } },
    })
    if (!membership) {
      res.status(404).json({ error: { message: "Board not found", status: 404 } })
      return
    }

    if (board.visibility === "PRIVATE") {
      const boardMembership = await prisma.boardMember.findUnique({
        where: { boardId_userId: { boardId: board.id, userId: req.user!.id } },
      })
      if (!boardMembership) {
        res.status(404).json({ error: { message: "Board not found", status: 404 } })
        return
      }
    }

    res.json({
      board: {
        id: board.id,
        workspaceId: board.workspaceId,
        name: board.name,
        description: board.description,
        visibility: board.visibility,
        coverColor: board.coverColor,
        createdAt: board.createdAt,
        updatedAt: board.updatedAt,
        deletedAt: board.deletedAt,
        listCount: board._count.lists,
        role: membership.role,
      },
    })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch board", status: 500 } })
  }
})

// POST /api/boards/update?id=xxx — rename, visibility, coverColor (OWNER | ADMIN)
router.post("/update", validateJWT, async (req, res) => {
  const boardId = req.query.id as string | undefined
  if (!boardId) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }

  const { name, visibility, coverColor } = req.body as {
    name?: string
    visibility?: string
    coverColor?: string | null
  }

  if (name === undefined && visibility === undefined && coverColor === undefined) {
    res.status(400).json({ error: { message: "At least one of name, visibility, or coverColor is required", status: 400 } })
    return
  }
  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({ error: { message: "name must be a non-empty string", status: 400 } })
      return
    }
    if (name.trim().length > 100) {
      res.status(400).json({ error: { message: "name must be 100 characters or fewer", status: 400 } })
      return
    }
  }

  if (visibility !== undefined && !VALID_VISIBILITIES.includes(visibility as BoardVisibility)) {
    res.status(400).json({ error: { message: "visibility must be WORKSPACE, PRIVATE, or PUBLIC", status: 400 } })
    return
  }

  if (coverColor !== undefined && coverColor !== null) {
    if (typeof coverColor !== "string" || coverColor.trim().length > 50) {
      res.status(400).json({ error: { message: "coverColor must be 50 characters or fewer", status: 400 } })
      return
    }
  }

  try {
    const board = await prisma.board.findUnique({ where: { id: boardId } })
    if (!board || board.deletedAt !== null) {
      res.status(404).json({ error: { message: "Board not found", status: 404 } })
      return
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: board.workspaceId, userId: req.user!.id } },
    })
    if (!membership) {
      res.status(404).json({ error: { message: "Board not found", status: 404 } })
      return
    }
    if (!canWrite(membership.role)) {
      res.status(403).json({ error: { message: "Viewers cannot update boards", status: 403 } })
      return
    }

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name.trim()
    if (visibility !== undefined) updateData.visibility = visibility
    if (coverColor !== undefined) updateData.coverColor = coverColor === null ? null : coverColor.trim() || null

    const noChange =
      (name === undefined || name.trim() === board.name) &&
      (visibility === undefined || visibility === board.visibility) &&
      (coverColor === undefined || (coverColor === null ? board.coverColor === null : coverColor.trim() === board.coverColor))
    if (noChange) {
      res.json({
        board: {
          id: board.id,
          workspaceId: board.workspaceId,
          name: board.name,
          description: board.description,
          visibility: board.visibility,
          coverColor: board.coverColor,
          createdAt: board.createdAt,
          updatedAt: board.updatedAt,
          deletedAt: board.deletedAt,
        },
      })
      return
    }

    const updated = await prisma.board.update({ where: { id: boardId }, data: updateData })

    res.json({
      board: {
        id: updated.id,
        workspaceId: updated.workspaceId,
        name: updated.name,
        description: updated.description,
        visibility: updated.visibility,
        coverColor: updated.coverColor,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        deletedAt: updated.deletedAt,
      },
    })
  } catch {
    res.status(500).json({ error: { message: "Failed to update board", status: 500 } })
  }
})

// POST /api/boards/delete?id=xxx — soft delete (OWNER only)
router.post("/delete", validateJWT, async (req, res) => {
  const boardId = req.query.id as string | undefined
  if (!boardId) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }

  try {
    const board = await prisma.board.findUnique({ where: { id: boardId } })
    if (!board || board.deletedAt !== null) {
      res.status(404).json({ error: { message: "Board not found", status: 404 } })
      return
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: board.workspaceId, userId: req.user!.id } },
    })
    if (!membership) {
      res.status(404).json({ error: { message: "Board not found", status: 404 } })
      return
    }
    if (membership.role !== "OWNER") {
      res.status(403).json({ error: { message: "Only workspace owners can delete boards", status: 403 } })
      return
    }

    await prisma.board.update({ where: { id: boardId }, data: { deletedAt: new Date() } })

    res.json({ success: true })
  } catch {
    res.status(500).json({ error: { message: "Failed to delete board", status: 500 } })
  }
})

// GET /api/boards/calendar?boardId=xxx — all non-deleted cards with dates for calendar/timeline views
router.get("/calendar", validateJWT, async (req, res) => {
  const boardId = req.query.boardId as string | undefined
  if (!boardId) {
    res.status(400).json({ error: { message: "boardId is required", status: 400 } })
    return
  }

  try {
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { id: true, workspaceId: true, visibility: true, deletedAt: true },
    })
    if (!board || board.deletedAt !== null) {
      res.status(404).json({ error: { message: "Board not found", status: 404 } })
      return
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: board.workspaceId, userId: req.user!.id } },
    })
    if (!membership) {
      res.status(404).json({ error: { message: "Board not found", status: 404 } })
      return
    }

    if (board.visibility === "PRIVATE") {
      const boardMember = await prisma.boardMember.findUnique({
        where: { boardId_userId: { boardId: board.id, userId: req.user!.id } },
      })
      if (!boardMember) {
        res.status(404).json({ error: { message: "Board not found", status: 404 } })
        return
      }
    }

    const cards = await prisma.card.findMany({
      where: {
        deletedAt: null,
        list: { boardId, deletedAt: null },
      },
      orderBy: { dueDate: "asc" },
      select: {
        id: true,
        listId: true,
        title: true,
        priority: true,
        startDate: true,
        dueDate: true,
        assigneeId: true,
        coverColor: true,
        list: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        labels: { select: { label: { select: { id: true, name: true, color: true } } } },
      },
    })

    const formatted = cards.map((card) => ({
      id: card.id,
      listId: card.listId,
      listTitle: card.list.name,
      title: card.title,
      priority: card.priority,
      startDate: card.startDate,
      dueDate: card.dueDate,
      assigneeId: card.assigneeId,
      assignee: card.assignee ? { id: card.assignee.id, name: card.assignee.name, avatarUrl: card.assignee.avatarUrl } : null,
      labels: card.labels.map((cl) => ({ id: cl.label.id, name: cl.label.name, color: cl.label.color })),
      coverColor: card.coverColor,
    }))

    res.json({ cards: formatted })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch calendar cards", status: 500 } })
  }
})

export { router as boardsRouter }
