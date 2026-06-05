import { Router } from "express"
import { Prisma } from "../../generated/prisma"
import { prisma } from "../lib/prisma"
import { validateJWT } from "../middleware/auth"
import { logActivity } from "../lib/activity"
import { createNotification, getCardRecipients } from "../lib/notifications"
import { canWrite } from "../lib/roles"
import { emitBoardEvent } from "../lib/socket"
import { storage, keyFromUrl } from "../lib/storage"
import logger from "../lib/logger"
import { MAX_CARDS_PER_LIST } from "@flowgrid/types"

const router = Router()

// Thrown inside the create transaction when a list is already at MAX_CARDS_PER_LIST,
// so the surrounding catch can map it to a 409 instead of a generic 500.
class ListFullError extends Error {}

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

  if (requireWriteRole && !canWrite(membership.role)) {
    res.status(403).json({ error: { message: "Viewers cannot modify cards", status: 403 } })
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
    startDate: Date | null
    dueDate: Date | null
    assigneeId: string | null
    coverColor: string | null
    completedAt?: Date | null
    createdAt: Date
    updatedAt: Date
    deletedAt: Date | null
  },
  assignee?: CardAssignee | null,
  labels?: CardLabelItem[],
  commentCount = 0,
  attachmentCount = 0,
  checklistTotal = 0,
  checklistDone = 0,
) {
  return {
    id: card.id,
    listId: card.listId,
    title: card.title,
    description: card.description,
    position: card.position,
    priority: card.priority,
    startDate: card.startDate,
    dueDate: card.dueDate,
    assigneeId: card.assigneeId,
    assignee: assignee ?? null,
    labels: labels ?? [],
    coverColor: card.coverColor,
    completedAt: card.completedAt ?? null,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    deletedAt: card.deletedAt,
    commentCount,
    attachmentCount,
    checklistTotal,
    checklistDone,
  }
}

// Fetch a card with enriched assignee + labels shape for socket broadcasts
async function fetchEnrichedCard(cardId: string) {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: {
      assignee: { select: { id: true, name: true, avatarUrl: true } },
      labels: { include: { label: true } },
    },
  })
  if (!card) return null
  const assignee: CardAssignee | null = card.assignee
    ? { id: card.assignee.id, name: card.assignee.name, avatarUrl: card.assignee.avatarUrl }
    : null
  const labels: CardLabelItem[] = card.labels.map((cl) => ({
    id: cl.label.id,
    name: cl.label.name,
    color: cl.label.color,
  }))
  return formatCard(card, assignee, labels)
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
    // (and to make the MAX_CARDS_PER_LIST check race-free against concurrent creates)
    const card = await prisma.$transaction(async (tx) => {
      const count = await tx.card.count({ where: { listId, deletedAt: null } })
      if (count >= MAX_CARDS_PER_LIST) {
        throw new ListFullError()
      }
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

    void logActivity({ cardId: card.id, userId: req.user!.id, action: "card_created", metadata: {}, boardId: access.board.id })
    emitBoardEvent(access.board.id, "card:created", formatCard(card, null, []))
    res.status(201).json({ card: formatCard(card) })
  } catch (err) {
    if (err instanceof ListFullError) {
      res.status(409).json({ error: { message: `A list can hold at most ${MAX_CARDS_PER_LIST} cards. Delete a card before adding a new one.`, status: 409 } })
      return
    }
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
        _count: { select: { comments: true, attachments: true } },
        checklists: {
          select: {
            _count: { select: { items: true } },
            items: { where: { checked: true }, select: { id: true } },
          },
        },
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
      const checklistTotal = card.checklists.reduce((s, c) => s + c._count.items, 0)
      const checklistDone = card.checklists.reduce((s, c) => s + c.items.length, 0)
      return formatCard(card, assignee, labels, card._count.comments, card._count.attachments, checklistTotal, checklistDone)
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

  const { title, description, priority, startDate, dueDate, assigneeId, completed } = req.body as {
    title?: string
    description?: string | null
    priority?: string
    startDate?: string | null
    dueDate?: string | null
    assigneeId?: string | null
    completed?: boolean
  }

  if (title === undefined && description === undefined && priority === undefined && startDate === undefined && dueDate === undefined && assigneeId === undefined && completed === undefined) {
    res.status(400).json({ error: { message: "At least one field is required", status: 400 } })
    return
  }
  if (completed !== undefined && typeof completed !== "boolean") {
    res.status(400).json({ error: { message: "completed must be a boolean", status: 400 } })
    return
  }
  if (assigneeId !== undefined && assigneeId !== null && (typeof assigneeId !== "string" || assigneeId.trim() === "")) {
    res.status(400).json({ error: { message: "assigneeId must be a non-empty string or null", status: 400 } })
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
  if (startDate !== undefined && startDate !== null) {
    if (typeof startDate !== "string" || isNaN(Date.parse(startDate))) {
      res.status(400).json({ error: { message: "startDate must be a valid ISO date string", status: 400 } })
      return
    }
  }
  if (dueDate !== undefined && dueDate !== null) {
    if (typeof dueDate !== "string" || isNaN(Date.parse(dueDate))) {
      res.status(400).json({ error: { message: "dueDate must be a valid ISO date string", status: 400 } })
      return
    }
  }

  try {
    const card = await prisma.card.findUnique({ where: { id: cardId } })
    if (!card || card.deletedAt !== null) {
      res.status(404).json({ error: { message: "Card not found", status: 404 } })
      return
    }

    const access = await resolveListAccess(res, card.listId, req.user!.id, true)
    if (!access) return

    if (assigneeId !== undefined && assigneeId !== null) {
      const member = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: access.board.workspaceId, userId: assigneeId } },
      })
      if (!member) {
        res.status(400).json({ error: { message: "assigneeId must be a workspace member", status: 400 } })
        return
      }
    }

    const updateData: Record<string, unknown> = {}
    if (title !== undefined) updateData.title = title.trim()
    if (description !== undefined) updateData.description = description === null ? null : description.trim() || null
    if (priority !== undefined) updateData.priority = priority
    if (startDate !== undefined) updateData.startDate = startDate === null ? null : new Date(startDate)
    if (dueDate !== undefined) updateData.dueDate = dueDate === null ? null : new Date(dueDate)
    if (assigneeId !== undefined) updateData.assigneeId = assigneeId
    if (completed !== undefined) updateData.completedAt = completed ? new Date() : null

    const updated = await prisma.card.update({
      where: { id: cardId },
      data: updateData,
      include: {
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        labels: { include: { label: true } },
      },
    })
    const updatedAssignee: CardAssignee | null = updated.assignee
      ? { id: updated.assignee.id, name: updated.assignee.name, avatarUrl: updated.assignee.avatarUrl }
      : null
    const updatedLabels: CardLabelItem[] = updated.labels.map((cl) => ({
      id: cl.label.id,
      name: cl.label.name,
      color: cl.label.color,
    }))

    // Activity + notifications — fire-and-forget, never block the response
    const actorId = req.user!.id
    const notifyData = { cardId: card.id, cardTitle: updated.title, boardId: access.board.id, workspaceId: access.board.workspaceId }

    void (async () => {
      try {
        // Activity log (per changed field)
        if (title !== undefined && title.trim() !== card.title) {
          void logActivity({ cardId, userId: actorId, action: "title_changed", metadata: { from: card.title, to: title.trim() }, boardId: access.board.id })
        }
        if (priority !== undefined && priority !== card.priority) {
          void logActivity({ cardId, userId: actorId, action: "priority_changed", metadata: { from: card.priority, to: priority }, boardId: access.board.id })
        }
        if (completed !== undefined && completed !== (card.completedAt !== null)) {
          void logActivity({ cardId, userId: actorId, action: completed ? "card_completed" : "card_reopened", metadata: {}, boardId: access.board.id })
        }
        if (dueDate !== undefined) {
          const oldDate = card.dueDate ? card.dueDate.toISOString() : null
          const newDate = dueDate === null ? null : new Date(dueDate).toISOString()
          if (oldDate !== newDate) {
            void logActivity({ cardId, userId: actorId, action: "due_date_changed", metadata: { from: oldDate, to: newDate }, boardId: access.board.id })
          }
        }
        if (assigneeId !== undefined && assigneeId !== card.assigneeId) {
          void logActivity({ cardId, userId: actorId, action: "assignee_changed", metadata: { from: card.assigneeId, to: assigneeId }, boardId: access.board.id })
          if (assigneeId) {
            // Auto-watch: assignee is always a watcher for the card they're assigned to
            void prisma.cardWatcher.upsert({
              where: { cardId_userId: { cardId, userId: assigneeId } },
              create: { id: require("crypto").randomBytes(12).toString("base64url"), cardId, userId: assigneeId },
              update: {},
            })
            // New assignee gets a targeted CARD_ASSIGNED notification — source is always ASSIGNMENT
            if (assigneeId !== actorId) {
              void createNotification({
                userId: assigneeId,
                type: "CARD_ASSIGNED",
                source: "ASSIGNMENT",
                title: `You were assigned to "${updated.title}"`,
                data: notifyData,
              })
            }
          }
        }

        // Fetch recipients once — shared across all field notifications
        const recipients = await getCardRecipients(cardId, actorId)
        if (recipients.length === 0) return

        // Users who already received a targeted notification — exclude from CARD_UPDATED
        const excludeFromUpdate = new Set<string>()
        if (assigneeId !== undefined && assigneeId !== card.assigneeId && assigneeId) {
          excludeFromUpdate.add(assigneeId)
        }

        for (const { userId, source } of recipients) {
          if (excludeFromUpdate.has(userId)) continue

          if (title !== undefined && title.trim() !== card.title) {
            void createNotification({ userId, source, type: "CARD_UPDATED", title: `"${updated.title}" was renamed`, data: notifyData })
          }
          if (priority !== undefined && priority !== card.priority) {
            void createNotification({ userId, source, type: "CARD_UPDATED", title: `Priority changed on "${updated.title}"`, data: notifyData })
          }
          if (dueDate !== undefined) {
            const oldDate = card.dueDate ? card.dueDate.toISOString() : null
            const newDate = dueDate === null ? null : new Date(dueDate).toISOString()
            if (oldDate !== newDate) {
              void createNotification({ userId, source, type: "CARD_UPDATED", title: `Due date changed on "${updated.title}"`, data: notifyData })
            }
          }
          if (assigneeId !== undefined && assigneeId !== card.assigneeId) {
            void createNotification({ userId, source, type: "CARD_UPDATED", title: `Assignee changed on "${updated.title}"`, data: notifyData })
          }
        }
      } catch (err) {
        logger.error("Failed to send card update notifications", { cardId, error: err instanceof Error ? err.message : err })
      }
    })()

    const formatted = formatCard(updated, updatedAssignee, updatedLabels)
    emitBoardEvent(access.board.id, "card:updated", formatted)
    res.json({ card: formatted })
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

    emitBoardEvent(access.board.id, "card:reordered", { listId, cardIds })
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

    // Reject cross-list moves that would push the target list past the card cap.
    // (Same-list reorders don't change the count, so they're always allowed.)
    if (card.listId !== targetListId && targetExisting.length >= MAX_CARDS_PER_LIST) {
      res.status(409).json({ error: { message: `A list can hold at most ${MAX_CARDS_PER_LIST} cards. Delete a card in the target list first.`, status: 409 } })
      return
    }

    const targetSet = new Set([cardId, ...targetExisting.map((c) => c.id)])
    const invalid = cardIds.filter((id) => !targetSet.has(id))
    if (invalid.length > 0) {
      res.status(400).json({ error: { message: `cardIds contains unknown cards: ${invalid.join(", ")}`, status: 400 } })
      return
    }

    // Interactive transaction: await the listId update before position updates so
    // the WHERE listId = targetListId predicate is satisfied for the moved card.
    const moved = await prisma.$transaction(async (tx) => {
      await tx.card.update({ where: { id: cardId }, data: { listId: targetListId } })
      for (const [index, id] of cardIds.entries()) {
        await tx.card.update({
          where: { id, listId: targetListId },
          data: { position: String(index + 1).padStart(8, "0") },
        })
      }
      return tx.card.findUnique({
        where: { id: cardId },
        include: {
          assignee: { select: { id: true, name: true, avatarUrl: true } },
          labels: { include: { label: true } },
        },
      })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    if (!moved) {
      res.status(404).json({ error: { message: "Card not found after move", status: 404 } })
      return
    }
    const movedAssignee: CardAssignee | null = moved.assignee
      ? { id: moved.assignee.id, name: moved.assignee.name, avatarUrl: moved.assignee.avatarUrl }
      : null
    const movedLabels: CardLabelItem[] = moved.labels.map((cl) => ({
      id: cl.label.id,
      name: cl.label.name,
      color: cl.label.color,
    }))
    void logActivity({ cardId: cardId, userId: req.user!.id, action: "card_moved", metadata: { fromListId: card.listId, toListId: targetListId }, boardId: access.board.id })
    const movedFormatted = formatCard(moved, movedAssignee, movedLabels)
    emitBoardEvent(access.board.id, "card:moved", movedFormatted)
    res.json({ card: movedFormatted })
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

    // Clean up attachments before soft-deleting the card (Prisma cascade only fires on hard delete)
    const attachments = await prisma.attachment.findMany({ where: { cardId }, select: { id: true, url: true } })
    if (attachments.length > 0) {
      await Promise.allSettled(attachments.map((a) => storage.delete(keyFromUrl(a.url))))
      await prisma.attachment.deleteMany({ where: { cardId } })
    }

    // Remove all dependency links involving this card so they don't appear as stale entries
    await prisma.cardDependency.deleteMany({ where: { OR: [{ blockerId: cardId }, { blockedId: cardId }] } })

    await prisma.card.update({ where: { id: cardId }, data: { deletedAt: new Date() } })
    void logActivity({ cardId: cardId, userId: req.user!.id, action: "card_archived", metadata: {}, boardId: access.board.id })
    emitBoardEvent(access.board.id, "card:deleted", { id: cardId })
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: { message: "Failed to delete card", status: 500 } })
  }
})

// POST /api/cards/labels/add — assign a label to a card (OWNER | ADMIN)
// Body: { cardId, labelId } — idempotent (no-op if already assigned)
router.post("/labels/add", validateJWT, async (req, res) => {
  const { cardId, labelId } = req.body as { cardId?: string; labelId?: string }
  if (!cardId || typeof cardId !== "string") {
    res.status(400).json({ error: { message: "cardId is required", status: 400 } })
    return
  }
  if (!labelId || typeof labelId !== "string") {
    res.status(400).json({ error: { message: "labelId is required", status: 400 } })
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

    // Verify label belongs to the same board
    const label = await prisma.label.findUnique({ where: { id: labelId } })
    if (!label || label.boardId !== access.board.id) {
      res.status(400).json({ error: { message: "Label not found on this board", status: 400 } })
      return
    }

    await prisma.cardLabel.upsert({
      where: { cardId_labelId: { cardId, labelId } },
      create: { cardId, labelId },
      update: {},
    })
    void logActivity({ cardId: cardId, userId: req.user!.id, action: "label_added", metadata: { labelId: label.id, labelName: label.name }, boardId: access.board.id })
    const enriched = await fetchEnrichedCard(cardId)
    if (enriched) emitBoardEvent(access.board.id, "card:updated", enriched)
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: { message: "Failed to add label", status: 500 } })
  }
})

// POST /api/cards/labels/remove — unassign a label from a card (OWNER | ADMIN)
// Body: { cardId, labelId }
router.post("/labels/remove", validateJWT, async (req, res) => {
  const { cardId, labelId } = req.body as { cardId?: string; labelId?: string }
  if (!cardId || typeof cardId !== "string") {
    res.status(400).json({ error: { message: "cardId is required", status: 400 } })
    return
  }
  if (!labelId || typeof labelId !== "string") {
    res.status(400).json({ error: { message: "labelId is required", status: 400 } })
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

    const labelToRemove = await prisma.label.findUnique({ where: { id: labelId }, select: { id: true, name: true } })
    await prisma.cardLabel.deleteMany({ where: { cardId, labelId } })
    if (labelToRemove) {
      void logActivity({ cardId: cardId, userId: req.user!.id, action: "label_removed", metadata: { labelId: labelToRemove.id, labelName: labelToRemove.name }, boardId: access.board.id })
    }
    const enrichedAfterRemove = await fetchEnrichedCard(cardId)
    if (enrichedAfterRemove) emitBoardEvent(access.board.id, "card:updated", enrichedAfterRemove)
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: { message: "Failed to remove label", status: 500 } })
  }
})

// GET /api/cards/upcoming?workspaceId=&days= — cards with dueDate within N days across the workspace
router.get("/upcoming", validateJWT, async (req, res) => {
  const workspaceId = req.query.workspaceId as string | undefined
  if (!workspaceId) {
    res.status(400).json({ error: { message: "workspaceId is required", status: 400 } })
    return
  }

  const days = Math.min(90, Math.max(1, parseInt((req.query.days as string) ?? "14", 10) || 14))
  const now = new Date()
  const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

  try {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: req.user!.id } },
    })
    if (!membership) {
      res.status(404).json({ error: { message: "Workspace not found", status: 404 } })
      return
    }

    const cards = await prisma.card.findMany({
      where: {
        deletedAt: null,
        dueDate: { gte: now, lte: cutoff },
        list: { deletedAt: null, board: { workspaceId, deletedAt: null } },
      },
      orderBy: { dueDate: "asc" },
      take: 20,
      select: {
        id: true,
        title: true,
        dueDate: true,
        listId: true,
        list: { select: { boardId: true } },
      },
    })

    res.json({
      cards: cards.map((c) => ({
        id: c.id,
        title: c.title,
        dueDate: c.dueDate,
        listId: c.listId,
        boardId: c.list.boardId,
      })),
    })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch upcoming cards", status: 500 } })
  }
})

export { router as cardsRouter }
