import { Router } from "express"
import { prisma } from "../lib/prisma"
import { validateJWT } from "../middleware/auth"
import { canWrite } from "../lib/roles"

const router = Router()

// Resolve card → list → board → workspace membership
async function resolveCardAccess(
  res: Parameters<Parameters<typeof router.get>[1]>[1],
  cardId: string,
  userId: string,
  requireWrite = false,
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
    select: { boardId: true, deletedAt: true },
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
    const bm = await prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId: board.id, userId } },
    })
    if (!bm) {
      res.status(404).json({ error: { message: "Card not found", status: 404 } })
      return null
    }
  }
  if (requireWrite && !canWrite(membership.role)) {
    res.status(403).json({ error: { message: "Viewers cannot modify checklists", status: 403 } })
    return null
  }
  return { card, board }
}

// GET /api/checklists?cardId=xxx
router.get("/", validateJWT, async (req, res) => {
  const cardId = req.query.cardId as string | undefined
  if (!cardId) {
    res.status(400).json({ error: { message: "cardId is required", status: 400 } })
    return
  }
  try {
    const access = await resolveCardAccess(res, cardId, req.user!.id, false)
    if (!access) return

    const checklists = await prisma.checklist.findMany({
      where: { cardId },
      orderBy: { position: "asc" },
      include: {
        items: { orderBy: { position: "asc" } },
      },
    })
    res.json({ checklists })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch checklists", status: 500 } })
  }
})

// POST /api/checklists — create checklist on a card
router.post("/", validateJWT, async (req, res) => {
  const { cardId, title } = req.body as { cardId?: string; title?: string }
  if (!cardId || typeof cardId !== "string") {
    res.status(400).json({ error: { message: "cardId is required", status: 400 } })
    return
  }
  if (!title || typeof title !== "string" || title.trim().length === 0) {
    res.status(400).json({ error: { message: "title is required", status: 400 } })
    return
  }
  try {
    const access = await resolveCardAccess(res, cardId, req.user!.id, true)
    if (!access) return

    const last = await prisma.checklist.findFirst({ where: { cardId }, orderBy: { position: "desc" }, select: { position: true } })
    const position = last ? String(Number(last.position) + 1).padStart(8, "0") : "00000001"

    const checklist = await prisma.checklist.create({
      data: { cardId, title: title.trim(), position },
      include: { items: true },
    })
    res.status(201).json({ checklist })
  } catch {
    res.status(500).json({ error: { message: "Failed to create checklist", status: 500 } })
  }
})

// POST /api/checklists/update?id=xxx
router.post("/update", validateJWT, async (req, res) => {
  const id = req.query.id as string | undefined
  const { title } = req.body as { title?: string }
  if (!id) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }
  if (!title || typeof title !== "string" || title.trim().length === 0) {
    res.status(400).json({ error: { message: "title is required", status: 400 } })
    return
  }
  try {
    const checklist = await prisma.checklist.findUnique({ where: { id } })
    if (!checklist) {
      res.status(404).json({ error: { message: "Checklist not found", status: 404 } })
      return
    }
    const access = await resolveCardAccess(res, checklist.cardId, req.user!.id, true)
    if (!access) return

    const updated = await prisma.checklist.update({ where: { id }, data: { title: title.trim() }, include: { items: true } })
    res.json({ checklist: updated })
  } catch {
    res.status(500).json({ error: { message: "Failed to update checklist", status: 500 } })
  }
})

// POST /api/checklists/delete?id=xxx
router.post("/delete", validateJWT, async (req, res) => {
  const id = req.query.id as string | undefined
  if (!id) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }
  try {
    const checklist = await prisma.checklist.findUnique({ where: { id } })
    if (!checklist) {
      res.status(404).json({ error: { message: "Checklist not found", status: 404 } })
      return
    }
    const access = await resolveCardAccess(res, checklist.cardId, req.user!.id, true)
    if (!access) return

    await prisma.checklist.delete({ where: { id } })
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: { message: "Failed to delete checklist", status: 500 } })
  }
})

// POST /api/checklists/items — add item to checklist
router.post("/items", validateJWT, async (req, res) => {
  const { checklistId, text } = req.body as { checklistId?: string; text?: string }
  if (!checklistId || typeof checklistId !== "string") {
    res.status(400).json({ error: { message: "checklistId is required", status: 400 } })
    return
  }
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    res.status(400).json({ error: { message: "text is required", status: 400 } })
    return
  }
  try {
    const checklist = await prisma.checklist.findUnique({ where: { id: checklistId } })
    if (!checklist) {
      res.status(404).json({ error: { message: "Checklist not found", status: 404 } })
      return
    }
    const access = await resolveCardAccess(res, checklist.cardId, req.user!.id, true)
    if (!access) return

    const last = await prisma.checklistItem.findFirst({ where: { checklistId }, orderBy: { position: "desc" }, select: { position: true } })
    const position = last ? String(Number(last.position) + 1).padStart(8, "0") : "00000001"

    const item = await prisma.checklistItem.create({ data: { checklistId, text: text.trim(), position } })
    res.status(201).json({ item })
  } catch {
    res.status(500).json({ error: { message: "Failed to add checklist item", status: 500 } })
  }
})

// POST /api/checklists/items/update?id=xxx
router.post("/items/update", validateJWT, async (req, res) => {
  const id = req.query.id as string | undefined
  const { text, checked } = req.body as { text?: string; checked?: boolean }
  if (!id) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }
  try {
    const item = await prisma.checklistItem.findUnique({ where: { id }, include: { checklist: true } })
    if (!item) {
      res.status(404).json({ error: { message: "Item not found", status: 404 } })
      return
    }
    const access = await resolveCardAccess(res, item.checklist.cardId, req.user!.id, true)
    if (!access) return

    const data: Record<string, unknown> = {}
    if (text !== undefined) data.text = text.trim()
    if (checked !== undefined) data.checked = checked

    const updated = await prisma.checklistItem.update({ where: { id }, data })
    res.json({ item: updated })
  } catch {
    res.status(500).json({ error: { message: "Failed to update checklist item", status: 500 } })
  }
})

// POST /api/checklists/items/delete?id=xxx
router.post("/items/delete", validateJWT, async (req, res) => {
  const id = req.query.id as string | undefined
  if (!id) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }
  try {
    const item = await prisma.checklistItem.findUnique({ where: { id }, include: { checklist: true } })
    if (!item) {
      res.status(404).json({ error: { message: "Item not found", status: 404 } })
      return
    }
    const access = await resolveCardAccess(res, item.checklist.cardId, req.user!.id, true)
    if (!access) return

    await prisma.checklistItem.delete({ where: { id } })
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: { message: "Failed to delete checklist item", status: 500 } })
  }
})

export { router as checklistsRouter }
