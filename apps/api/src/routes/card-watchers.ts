import { Router } from "express"
import { prisma } from "../lib/prisma"
import { validateJWT } from "../middleware/auth"

const router = Router()

async function resolveCardForWatcher(cardId: string, userId: string) {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: { id: true, listId: true, deletedAt: true },
  })
  if (!card || card.deletedAt !== null) return null

  const list = await prisma.list.findUnique({ where: { id: card.listId }, select: { boardId: true, deletedAt: true } })
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
    const bm = await prisma.boardMember.findUnique({ where: { boardId_userId: { boardId: board.id, userId } } })
    if (!bm) return null
  }
  return { card }
}

// GET /api/card-watchers?cardId=xxx
router.get("/", validateJWT, async (req, res) => {
  const cardId = req.query.cardId as string | undefined
  if (!cardId) {
    res.status(400).json({ error: { message: "cardId is required", status: 400 } })
    return
  }
  try {
    const access = await resolveCardForWatcher(cardId, req.user!.id)
    if (!access) {
      res.status(404).json({ error: { message: "Card not found", status: 404 } })
      return
    }
    const watchers = await prisma.cardWatcher.findMany({
      where: { cardId },
      select: { id: true, userId: true, user: { select: { id: true, name: true, avatarUrl: true } } },
    })
    const isWatching = watchers.some((w) => w.userId === req.user!.id)
    res.json({ watchers: watchers.map((w) => w.user), isWatching })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch watchers", status: 500 } })
  }
})

// POST /api/card-watchers/watch — { cardId }
router.post("/watch", validateJWT, async (req, res) => {
  const { cardId } = req.body as { cardId?: string }
  if (!cardId) {
    res.status(400).json({ error: { message: "cardId is required", status: 400 } })
    return
  }
  try {
    const access = await resolveCardForWatcher(cardId, req.user!.id)
    if (!access) {
      res.status(404).json({ error: { message: "Card not found", status: 404 } })
      return
    }
    await prisma.cardWatcher.upsert({
      where: { cardId_userId: { cardId, userId: req.user!.id } },
      create: { id: require("crypto").randomBytes(12).toString("base64url"), cardId, userId: req.user!.id },
      update: {},
    })
    res.json({ watching: true })
  } catch {
    res.status(500).json({ error: { message: "Failed to watch card", status: 500 } })
  }
})

// POST /api/card-watchers/unwatch — { cardId }
router.post("/unwatch", validateJWT, async (req, res) => {
  const { cardId } = req.body as { cardId?: string }
  if (!cardId) {
    res.status(400).json({ error: { message: "cardId is required", status: 400 } })
    return
  }
  try {
    await prisma.cardWatcher.deleteMany({ where: { cardId, userId: req.user!.id } })
    res.json({ watching: false })
  } catch {
    res.status(500).json({ error: { message: "Failed to unwatch card", status: 500 } })
  }
})

export { router as cardWatchersRouter }
