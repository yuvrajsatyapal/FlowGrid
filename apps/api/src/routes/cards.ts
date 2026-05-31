import { Router } from "express"
import { Prisma } from "../../generated/prisma"
import { prisma } from "../lib/prisma"
import { validateJWT } from "../middleware/auth"

const router = Router()

const VALID_PRIORITIES = ["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"] as const
type CardPriority = (typeof VALID_PRIORITIES)[number]

type CardAssignee = { id: string; name: string | null; avatarUrl: string | null }
type CardLabelItem = { id: string; name: string; color: string }

// Resolve list → board → workspace membership, checking PRIVATE board access.
// Returns { list, board, membership } or writes a 404/403 and returns null.
async function resolveListAccess(
  res: Parameters<Parameters<typeof router.get>[1]>[1],
  listId: string,
  userId: string,
  requireWriteRole = false,
) {
  const list = await prisma.list.findUnique({
    where: { id: listId },
    select: { id: true, boardId: true, deletedAt: true },
  })
  if (!list || list.deletedAt !== null) {
    res.status(404).json({ error: { message: "List not found", status: 404 } })
    return null
  }

  const board = await prisma.board.findUnique({
    where: { id: list.boardId },
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

  if (requireWriteRole && membership.role !== "OWNER" && membership.role !== "ADMIN") {
    res.status(403).json({ error: { message: "Only workspace owners and admins can modify cards", status: 403 } })
    return null
  }

  return { list, board, membership }
}

function formatCard(
  card: {
    id: string
    listId: string
    title: string
    description: string | null
    position: string
    priority: CardPriority
    dueDate: Date | null
    assigneeId: string | null
    coverColor: string | null
    createdAt: Date
    updatedAt: Date
    deletedAt: Date | null
  },
  assignee?: CardAssignee | null,
  labels?: CardLabelItem[],
) {
  return {
    id: card.id,
    listId: card.listId,
    title: card.title,
    description: card.description,
    position: card.position,
    priority: card.priority,
    dueDate: card.dueDate,
    assigneeId: card.assigneeId,
    assignee: assignee ?? null,
    labels: labels ?? [],
    coverColor: card.coverColor,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    deletedAt: card.deletedAt,
  }
}

// POST /api/cards — create a card in a list (OWNER | ADMIN)
router.post("/", validateJWT, async (req, res) => {
  const { listId, title } = req.body as { listId?: string; title?: string }

  if (!listId || typeof listId !== "string") {
    res.status(400).json({ error: { message: "listId is required", status: 400 } })
    return
  }
  if (!title || typeof title !== "string" || title.trim().length === 0) {
    res.status(400).json({ error: { message: "title is required", status: 400 } })
    return
  }
  if (title.trim().length > 255) {
    res.status(400).json({ error: { message: "title must be 255 characters or fewer", status: 400 } })
    return
  }

  try {
    const access = await resolveListAccess(res, listId, req.user!.id, true)
    if (!access) return

    // SERIALIZABLE to prevent two concurrent creates computing the same position
    const card = await prisma.$transaction(async (tx) => {
      const last = await tx.card.findFirst({
        where: { listId, deletedAt: null },
        orderBy: { position: "desc" },
        select: { position: true },
      })
      const nextPos = last ? String(Number(last.position) + 1).padStart(8, "0") : "00000001"
      return tx.card.create({
        data: { listId, title: title.trim(), position: nextPos },
      })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    res.status(201).json({ card: formatCard(card) })
  } catch {
    res.status(500).json({ error: { message: "Failed to create card", status: 500 } })
  }
})

// GET /api/cards?listId=xxx — non-deleted cards ordered by position (any board member)
// Response includes nested assignee and labels for the card face redesign.
router.get("/", validateJWT, async (req, res) => {
  const listId = req.query.listId as string | undefined
  if (!listId) {
    res.status(400).json({ error: { message: "listId is required", status: 400 } })
    return
  }

  try {
    const access = await resolveListAccess(res, listId, req.user!.id, false)
    if (!access) return

    const cards = await prisma.card.findMany({
      where: { listId, deletedAt: null },
      orderBy: { position: "asc" },
      include: {
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        labels: { include: { label: true } },
      },
    })

    const formatted = cards.map((card) => {
      const assignee: CardAssignee | null = card.assignee
        ? { id: card.assignee.id, name: card.assignee.name, avatarUrl: card.assignee.avatarUrl }
        : null
      const labels: CardLabelItem[] = card.labels.map((cl) => ({
        id: cl.label.id,
        name: cl.label.name,
        color: cl.label.color,
      }))
      return formatCard(card, assignee, labels)
    })

    res.json({ cards: formatted })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch cards", status: 500 } })
  }
})

// POST /api/cards/update?id=xxx — update title, description, priority (OWNER | ADMIN)
router.post("/update", validateJWT, async (req, res) => {
  const cardId = req.query.id as string | undefined
  if (!cardId) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }

  const { title, description, priority } = req.body as {
    title?: string
    description?: string | null
    priority?: string
  }

  if (title === undefined && description === undefined && priority === undefined) {
    res.status(400).json({ error: { message: "At least one of title, description, or priority is required", status: 400 } })
    return
  }
  if (title !== undefined) {
    if (typeof title !== "string" || title.trim().length === 0) {
      res.status(400).json({ error: { message: "title must be a non-empty string", status: 400 } })
      return
    }
    if (title.trim().length > 255) {
      res.status(400).json({ error: { message: "title must be 255 characters or fewer", status: 400 } })
      return
    }
  }
  if (priority !== undefined && !VALID_PRIORITIES.includes(priority as CardPriority)) {
    res.status(400).json({ error: { message: "priority must be NONE, LOW, MEDIUM, HIGH, or URGENT", status: 400 } })
    return
  }

  try {
    const card = await prisma.card.findUnique({ where: { id: cardId } })
    if (!card || card.deletedAt !== null) {
      res.status(404).json({ error: { message: "Card not found", status: 404 } })
      return
    }

    const access = await resolveListAccess(res, card.listId, req.user!.id, true)
    if (!access) return

    const updateData: Record<string, unknown> = {}
    if (title !== undefined) updateData.title = title.trim()
    if (description !== undefined) updateData.description = description === null ? null : description.trim() || null
    if (priority !== undefined) updateData.priority = priority

    const updated = await prisma.card.update({ where: { id: cardId }, data: updateData })
    res.json({ card: formatCard(updated) })
  } catch {
    res.status(500).json({ error: { message: "Failed to update card", status: 500 } })
  }
})

// POST /api/cards/reorder — batch reassign positions for cards in a list after DnD
// Body: { listId: string, cardIds: string[] } — complete ordered list after drop
router.post("/reorder", validateJWT, async (req, res) => {
  const { listId, cardIds } = req.body as { listId?: string; cardIds?: string[] }

  if (!listId || typeof listId !== "string") {
    res.status(400).json({ error: { message: "listId is required", status: 400 } })
    return
  }
  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    res.status(400).json({ error: { message: "cardIds must be a non-empty array", status: 400 } })
    return
  }
  for (const id of cardIds) {
    if (!id || typeof id !== "string") {
      res.status(400).json({ error: { message: "Each cardId must be a non-empty string", status: 400 } })
      return
    }
  }
  if (new Set(cardIds).size !== cardIds.length) {
    res.status(400).json({ error: { message: "cardIds must not contain duplicates", status: 400 } })
    return
  }

  try {
    const access = await resolveListAccess(res, listId, req.user!.id, true)
    if (!access) return

    // Validate that all cardIds belong to this list
    const existing = await prisma.card.findMany({
      where: { listId, deletedAt: null },
      select: { id: true },
    })
    const existingSet = new Set(existing.map((c) => c.id))
    const invalid = cardIds.filter((id) => !existingSet.has(id))
    if (invalid.length > 0) {
      res.status(400).json({ error: { message: `cardIds contains unknown cards: ${invalid.join(", ")}`, status: 400 } })
      return
    }

    // SERIALIZABLE: assign fresh sequential positions to prevent overlap with concurrent creates
    await prisma.$transaction(
      cardIds.map((id, index) =>
        prisma.card.update({
          where: { id, listId },
          data: { position: String(index + 1).padStart(8, "0") },
        }),
      ),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )

    res.json({ success: true })
  } catch {
    res.status(500).json({ error: { message: "Failed to reorder cards", status: 500 } })
  }
})

// POST /api/cards/move — move a card to a different list (OWNER | ADMIN)
// Body: { cardId, targetListId, cardIds } where cardIds is the full new order of the target list
router.post("/move", validateJWT, async (req, res) => {
  const { cardId, targetListId, cardIds } = req.body as {
    cardId?: string
    targetListId?: string
    cardIds?: string[]
  }

  if (!cardId || typeof cardId !== "string") {
    res.status(400).json({ error: { message: "cardId is required", status: 400 } })
    return
  }
  if (!targetListId || typeof targetListId !== "string") {
    res.status(400).json({ error: { message: "targetListId is required", status: 400 } })
    return
  }
  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    res.status(400).json({ error: { message: "cardIds (new order for target list) must be a non-empty array", status: 400 } })
    return
  }
  if (new Set(cardIds).size !== cardIds.length) {
    res.status(400).json({ error: { message: "cardIds must not contain duplicates", status: 400 } })
    return
  }

  try {
    const card = await prisma.card.findUnique({ where: { id: cardId } })
    if (!card || card.deletedAt !== null) {
      res.status(404).json({ error: { message: "Card not found", status: 404 } })
      return
    }

    // Verify access on both source and target lists (same board check suffices)
    const access = await resolveListAccess(res, card.listId, req.user!.id, true)
    if (!access) return

    const targetAccess = await resolveListAccess(res, targetListId, req.user!.id, true)
    if (!targetAccess) return

    // Ensure both lists belong to the same board
    if (access.list.boardId !== targetAccess.list.boardId) {
      res.status(400).json({ error: { message: "Cannot move cards between boards", status: 400 } })
      return
    }

    // Validate that all cardIds are either the moved card or belong to the target list
    const targetExisting = await prisma.card.findMany({
      where: { listId: targetListId, deletedAt: null },
      select: { id: true },
    })
    const targetSet = new Set([cardId, ...targetExisting.map((c) => c.id)])
    const invalid = cardIds.filter((id) => !targetSet.has(id))
    if (invalid.length > 0) {
      res.status(400).json({ error: { message: `cardIds contains unknown cards: ${invalid.join(", ")}`, status: 400 } })
      return
    }

    // Interactive transaction: await the listId update before position updates so
    // the WHERE listId = targetListId predicate is satisfied for the moved card.
    const updated = await prisma.$transaction(async (tx) => {
      await tx.card.update({ where: { id: cardId }, data: { listId: targetListId } })
      for (const [index, id] of cardIds.entries()) {
        await tx.card.update({
          where: { id, listId: targetListId },
          data: { position: String(index + 1).padStart(8, "0") },
        })
      }
      return tx.card.findUnique({ where: { id: cardId } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    if (!updated) {
      res.status(404).json({ error: { message: "Card not found after move", status: 404 } })
      return
    }
    res.json({ card: formatCard(updated) })
  } catch {
    res.status(500).json({ error: { message: "Failed to move card", status: 500 } })
  }
})

// POST /api/cards/delete?id=xxx — soft delete (OWNER | ADMIN)
router.post("/delete", validateJWT, async (req, res) => {
  const cardId = req.query.id as string | undefined
  if (!cardId) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }

  try {
    const card = await prisma.card.findUnique({ where: { id: cardId } })
    if (!card || card.deletedAt !== null) {
      res.status(404).json({ error: { message: "Card not found", status: 404 } })
      return
    }

    const access = await resolveListAccess(res, card.listId, req.user!.id, true)
    if (!access) return

    await prisma.card.update({ where: { id: cardId }, data: { deletedAt: new Date() } })
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: { message: "Failed to delete card", status: 500 } })
  }
})

export { router as cardsRouter }
