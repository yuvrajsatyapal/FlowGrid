import { Router } from "express"
import { Prisma } from "../../generated/prisma"
import { prisma } from "../lib/prisma"
import { validateJWT } from "../middleware/auth"
import { canWrite } from "../lib/roles"
import { emitBoardEvent } from "../lib/socket"

const router = Router()

// Shared helper: resolve workspace membership + optional PRIVATE board check.
// Returns { workspaceMembership } or sends a 404/403 response and returns null.
async function resolveBoardAccess(
  res: Parameters<Parameters<typeof router.get>[1]>[1],
  boardId: string,
  userId: string,
  requireWriteRole = false,
) {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { id: true, workspaceId: true, visibility: true, deletedAt: true },
  })
  if (!board || board.deletedAt !== null) {
    res.status(404).json({ error: { message: "Board not found", status: 404 } })
    return null
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: board.workspaceId, userId } },
  })
  if (!membership) {
    res.status(404).json({ error: { message: "Board not found", status: 404 } })
    return null
  }

  if (board.visibility === "PRIVATE") {
    const boardMember = await prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId: board.id, userId } },
    })
    if (!boardMember) {
      res.status(404).json({ error: { message: "Board not found", status: 404 } })
      return null
    }
  }

  if (requireWriteRole && !canWrite(membership.role)) {
    res.status(403).json({ error: { message: "Viewers cannot modify lists", status: 403 } })
    return null
  }

  return { board, membership }
}

// Fetch a list with its live card count for socket broadcasts
async function fetchListWithCount(listId: string) {
  const list = await prisma.list.findUnique({
    where: { id: listId },
    select: {
      id: true, boardId: true, name: true, position: true,
      createdAt: true, updatedAt: true, deletedAt: true,
      _count: { select: { cards: { where: { deletedAt: null } } } },
    },
  })
  if (!list) return null
  return {
    id: list.id, boardId: list.boardId, name: list.name, position: list.position,
    cardCount: list._count.cards,
    createdAt: list.createdAt, updatedAt: list.updatedAt, deletedAt: list.deletedAt,
  }
}

// Fetch all non-deleted lists for a board with card counts (used by list:reordered)
async function fetchBoardLists(boardId: string) {
  const lists = await prisma.list.findMany({
    where: { boardId, deletedAt: null },
    orderBy: { position: "asc" },
    select: {
      id: true, boardId: true, name: true, position: true,
      createdAt: true, updatedAt: true, deletedAt: true,
      _count: { select: { cards: { where: { deletedAt: null } } } },
    },
  })
  return lists.map((l) => ({
    id: l.id, boardId: l.boardId, name: l.name, position: l.position,
    cardCount: l._count.cards,
    createdAt: l.createdAt, updatedAt: l.updatedAt, deletedAt: l.deletedAt,
  }))
}

// POST /api/lists — create a list in a board (OWNER | ADMIN)
router.post("/", validateJWT, async (req, res) => {
  const { boardId, name } = req.body as { boardId?: string; name?: string }

  if (!boardId || typeof boardId !== "string") {
    res.status(400).json({ error: { message: "boardId is required", status: 400 } })
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

  try {
    const access = await resolveBoardAccess(res, boardId, req.user!.id, true)
    if (!access) return

    // SERIALIZABLE isolation ensures the findFirst→create pair is race-free:
    // two concurrent creates cannot both read the same last position before either commits.
    const list = await prisma.$transaction(async (tx) => {
      const last = await tx.list.findFirst({
        where: { boardId, deletedAt: null },
        orderBy: { position: "desc" },
        select: { position: true },
      })
      const nextPos = last ? String(Number(last.position) + 1).padStart(8, "0") : "00000001"
      return tx.list.create({
        data: { boardId, name: name.trim(), position: nextPos },
      })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    const listPayload = {
      id: list.id, boardId: list.boardId, name: list.name, position: list.position,
      cardCount: 0,
      createdAt: list.createdAt, updatedAt: list.updatedAt, deletedAt: list.deletedAt,
    }
    emitBoardEvent(boardId, "list:created", listPayload)
    res.status(201).json({ list: listPayload })
  } catch {
    res.status(500).json({ error: { message: "Failed to create list", status: 500 } })
  }
})

// GET /api/lists?boardId=xxx — all non-deleted lists ordered by position (any board member)
router.get("/", validateJWT, async (req, res) => {
  const boardId = req.query.boardId as string | undefined
  if (!boardId) {
    res.status(400).json({ error: { message: "boardId is required", status: 400 } })
    return
  }

  try {
    const access = await resolveBoardAccess(res, boardId, req.user!.id, false)
    if (!access) return

    const lists = await prisma.list.findMany({
      where: { boardId, deletedAt: null },
      orderBy: { position: "asc" },
      select: {
        id: true,
        boardId: true,
        name: true,
        position: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        _count: { select: { cards: { where: { deletedAt: null } } } },
      },
    })

    res.json({
      lists: lists.map((l) => ({
        id: l.id,
        boardId: l.boardId,
        name: l.name,
        position: l.position,
        cardCount: l._count.cards,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
        deletedAt: l.deletedAt,
      })),
    })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch lists", status: 500 } })
  }
})

// POST /api/lists/update?id=xxx — rename a list (OWNER | ADMIN)
router.post("/update", validateJWT, async (req, res) => {
  const listId = req.query.id as string | undefined
  if (!listId) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }

  const { name } = req.body as { name?: string }
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: { message: "name is required", status: 400 } })
    return
  }
  if (name.trim().length > 100) {
    res.status(400).json({ error: { message: "name must be 100 characters or fewer", status: 400 } })
    return
  }

  try {
    const list = await prisma.list.findUnique({ where: { id: listId } })
    if (!list || list.deletedAt !== null) {
      res.status(404).json({ error: { message: "List not found", status: 404 } })
      return
    }

    const access = await resolveBoardAccess(res, list.boardId, req.user!.id, true)
    if (!access) return

    if (name.trim() === list.name) {
      res.json({
        list: {
          id: list.id,
          boardId: list.boardId,
          name: list.name,
          position: list.position,
          createdAt: list.createdAt,
          updatedAt: list.updatedAt,
          deletedAt: list.deletedAt,
        },
      })
      return
    }

    const updated = await prisma.list.update({ where: { id: listId }, data: { name: name.trim() } })
    const updatedWithCount = await fetchListWithCount(updated.id)
    if (updatedWithCount) emitBoardEvent(updated.boardId, "list:updated", updatedWithCount)

    res.json({
      list: {
        id: updated.id,
        boardId: updated.boardId,
        name: updated.name,
        position: updated.position,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        deletedAt: updated.deletedAt,
      },
    })
  } catch {
    res.status(500).json({ error: { message: "Failed to update list", status: 500 } })
  }
})

// POST /api/lists/reorder — batch update positions (OWNER | ADMIN)
// Body: { boardId: string, positions: [{ id: string, position: string }] }
router.post("/reorder", validateJWT, async (req, res) => {
  const { boardId, positions } = req.body as {
    boardId?: string
    positions?: { id: string; position: string }[]
  }

  if (!boardId || typeof boardId !== "string") {
    res.status(400).json({ error: { message: "boardId is required", status: 400 } })
    return
  }
  if (!Array.isArray(positions) || positions.length === 0) {
    res.status(400).json({ error: { message: "positions must be a non-empty array", status: 400 } })
    return
  }
  for (const item of positions) {
    if (!item.id || typeof item.id !== "string" || !item.position || typeof item.position !== "string") {
      res.status(400).json({ error: { message: "Each position item must have id and position strings", status: 400 } })
      return
    }
  }

  try {
    const access = await resolveBoardAccess(res, boardId, req.user!.id, true)
    if (!access) return

    // Add boardId to the where clause so a position payload with foreign list IDs
    // is silently ignored (update matches nothing) rather than mutating unrelated lists.
    await prisma.$transaction(
      positions.map(({ id, position }) =>
        prisma.list.update({ where: { id, boardId }, data: { position } }),
      ),
    )

    const reorderedLists = await fetchBoardLists(boardId)
    emitBoardEvent(boardId, "list:reordered", { lists: reorderedLists })
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: { message: "Failed to reorder lists", status: 500 } })
  }
})

// POST /api/lists/delete?id=xxx — soft delete (OWNER | ADMIN)
router.post("/delete", validateJWT, async (req, res) => {
  const listId = req.query.id as string | undefined
  if (!listId) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }

  try {
    const list = await prisma.list.findUnique({ where: { id: listId } })
    if (!list || list.deletedAt !== null) {
      res.status(404).json({ error: { message: "List not found", status: 404 } })
      return
    }

    const access = await resolveBoardAccess(res, list.boardId, req.user!.id, true)
    if (!access) return

    await prisma.list.update({ where: { id: listId }, data: { deletedAt: new Date() } })
    emitBoardEvent(list.boardId, "list:deleted", { id: listId })
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: { message: "Failed to delete list", status: 500 } })
  }
})

export { router as listsRouter }
