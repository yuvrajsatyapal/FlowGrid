import { Router } from "express"
import { prisma } from "../lib/prisma"
import { validateJWT } from "../middleware/auth"
import { canWrite } from "../lib/roles"

const router = Router()

async function resolveBoardForCard(cardId: string, userId: string) {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: { id: true, listId: true, title: true, deletedAt: true },
  })
  if (!card || card.deletedAt !== null) return null

  const list = await prisma.list.findUnique({
    where: { id: card.listId },
    select: { boardId: true, deletedAt: true },
  })
  if (!list || list.deletedAt !== null) return null

  const board = await prisma.board.findUnique({
    where: { id: list.boardId },
    select: { id: true, workspaceId: true, visibility: true, deletedAt: true },
  })
  if (!board || board.deletedAt !== null) return null

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: board.workspaceId, userId } },
  })
  if (!membership) return null

  if (board.visibility === "PRIVATE") {
    const bm = await prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId: board.id, userId } },
    })
    if (!bm) return null
  }
  return { card, board, membership }
}

// GET /api/card-dependencies?cardId=xxx — list blocking + blocked-by for a card
router.get("/", validateJWT, async (req, res) => {
  const cardId = req.query.cardId as string | undefined
  if (!cardId) {
    res.status(400).json({ error: { message: "cardId is required", status: 400 } })
    return
  }
  try {
    const access = await resolveBoardForCard(cardId, req.user!.id)
    if (!access) {
      res.status(404).json({ error: { message: "Card not found", status: 404 } })
      return
    }

    const [blocking, blockedBy] = await Promise.all([
      prisma.cardDependency.findMany({
        where: { blockerId: cardId },
        select: { id: true, blocked: { select: { id: true, title: true } } },
      }),
      prisma.cardDependency.findMany({
        where: { blockedId: cardId },
        select: { id: true, blocker: { select: { id: true, title: true } } },
      }),
    ])

    res.json({
      blocking: blocking.map((d) => ({ depId: d.id, card: d.blocked })),
      blockedBy: blockedBy.map((d) => ({ depId: d.id, card: d.blocker })),
    })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch dependencies", status: 500 } })
  }
})

// POST /api/card-dependencies/add — { blockerId, blockedId }
router.post("/add", validateJWT, async (req, res) => {
  const { blockerId, blockedId } = req.body as { blockerId?: string; blockedId?: string }
  if (!blockerId || !blockedId) {
    res.status(400).json({ error: { message: "blockerId and blockedId are required", status: 400 } })
    return
  }
  if (blockerId === blockedId) {
    res.status(400).json({ error: { message: "A card cannot depend on itself", status: 400 } })
    return
  }
  try {
    const access = await resolveBoardForCard(blockerId, req.user!.id)
    if (!access) {
      res.status(404).json({ error: { message: "Card not found", status: 404 } })
      return
    }
    if (!canWrite(access.membership.role)) {
      res.status(403).json({ error: { message: "Viewers cannot modify dependencies", status: 403 } })
      return
    }

    // Verify blockedId is on same board
    const blockedAccess = await resolveBoardForCard(blockedId, req.user!.id)
    if (!blockedAccess || blockedAccess.board.id !== access.board.id) {
      res.status(400).json({ error: { message: "Both cards must be on the same board", status: 400 } })
      return
    }

    const dep = await prisma.cardDependency.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { id: require("crypto").randomBytes(12).toString("base64url"), blockerId, blockedId },
      update: {},
    })
    res.status(201).json({ dependency: dep })
  } catch {
    res.status(500).json({ error: { message: "Failed to add dependency", status: 500 } })
  }
})

// POST /api/card-dependencies/remove?id=xxx
router.post("/remove", validateJWT, async (req, res) => {
  const id = req.query.id as string | undefined
  if (!id) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }
  try {
    const dep = await prisma.cardDependency.findUnique({ where: { id } })
    if (!dep) {
      res.status(404).json({ error: { message: "Dependency not found", status: 404 } })
      return
    }
    const access = await resolveBoardForCard(dep.blockerId, req.user!.id)
    if (!access) {
      res.status(404).json({ error: { message: "Card not found", status: 404 } })
      return
    }
    if (!canWrite(access.membership.role)) {
      res.status(403).json({ error: { message: "Viewers cannot modify dependencies", status: 403 } })
      return
    }
    await prisma.cardDependency.delete({ where: { id } })
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: { message: "Failed to remove dependency", status: 500 } })
  }
})

// GET /api/card-dependencies/board-cards?boardId=xxx — list cards on board for picker
router.get("/board-cards", validateJWT, async (req, res) => {
  const boardId = req.query.boardId as string | undefined
  if (!boardId) {
    res.status(400).json({ error: { message: "boardId is required", status: 400 } })
    return
  }
  try {
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { workspaceId: true, visibility: true, deletedAt: true },
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

    const cards = await prisma.card.findMany({
      where: { deletedAt: null, list: { boardId, deletedAt: null } },
      orderBy: { title: "asc" },
      select: { id: true, title: true, list: { select: { name: true } } },
    })
    res.json({ cards: cards.map((c) => ({ id: c.id, title: c.title, listName: c.list.name })) })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch board cards", status: 500 } })
  }
})

export { router as cardDependenciesRouter }
