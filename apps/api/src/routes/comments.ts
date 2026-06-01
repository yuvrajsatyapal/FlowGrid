import { Router } from "express"
import sanitizeHtml from "sanitize-html"
import { prisma } from "../lib/prisma"
import { validateJWT } from "../middleware/auth"
import { logActivity } from "../lib/activity"
import { createNotification } from "../lib/notifications"
import { canWrite } from "../lib/roles"
import { emitBoardEvent } from "../lib/socket"

const router = Router()

const MAX_COMMENT_LENGTH = 10_000

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "strong", "em", "ul", "ol", "li", "blockquote", "br", "a"],
  allowedAttributes: { a: ["href"] },
  disallowedTagsMode: "discard",
}

type CommentAuthor = { id: string; name: string | null; avatarUrl: string | null }

function formatComment(comment: {
  id: string
  cardId: string
  content: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  user: CommentAuthor | null
}) {
  return {
    id: comment.id,
    cardId: comment.cardId,
    author: comment.user,
    content: comment.content,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    deletedAt: comment.deletedAt,
  }
}

// Resolve card → list → board → workspace access.
// Returns { card, board, membership } or writes 404/403 and returns null.
async function resolveCardAccess(
  res: Parameters<Parameters<typeof router.get>[1]>[1],
  cardId: string,
  userId: string,
  requireWriteRole = false,
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

  if (requireWriteRole && !canWrite(membership.role)) {
    res.status(403).json({ error: { message: "Viewers cannot perform this action", status: 403 } })
    return null
  }

  return { card, board, membership }
}

// GET /api/comments?cardId=&offset=&limit= — paginated comment list
router.get("/", validateJWT, async (req, res) => {
  const cardId = req.query.cardId as string | undefined
  if (!cardId) {
    res.status(400).json({ error: { message: "cardId is required", status: 400 } })
    return
  }

  const offset = Math.max(0, parseInt((req.query.offset as string) ?? "0", 10) || 0)
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? "50", 10) || 50))

  try {
    const access = await resolveCardAccess(res, cardId, req.user!.id)
    if (!access) return

    const [items, total] = await prisma.$transaction([
      prisma.comment.findMany({
        where: { cardId, deletedAt: null },
        orderBy: { createdAt: "asc" },
        skip: offset,
        take: limit,
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      }),
      prisma.comment.count({ where: { cardId, deletedAt: null } }),
    ])

    res.json({ items: items.map(formatComment), total, offset, limit })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch comments", status: 500 } })
  }
})

// POST /api/comments — create a comment (any workspace member)
router.post("/", validateJWT, async (req, res) => {
  const { cardId, content } = req.body as { cardId?: string; content?: string }

  if (!cardId || typeof cardId !== "string") {
    res.status(400).json({ error: { message: "cardId is required", status: 400 } })
    return
  }
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    res.status(400).json({ error: { message: "content is required", status: 400 } })
    return
  }
  if (content.length > MAX_COMMENT_LENGTH) {
    res.status(400).json({ error: { message: `content must be ${MAX_COMMENT_LENGTH} characters or fewer`, status: 400 } })
    return
  }

  try {
    const access = await resolveCardAccess(res, cardId, req.user!.id, true)
    if (!access) return

    const sanitized = sanitizeHtml(content, SANITIZE_OPTIONS)
    const textOnly = sanitizeHtml(sanitized, { allowedTags: [], allowedAttributes: {} }).trim()
    if (textOnly.length === 0) {
      res.status(400).json({ error: { message: "content cannot be empty", status: 400 } })
      return
    }

    const comment = await prisma.comment.create({
      data: { cardId, userId: req.user!.id, content: sanitized },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    })

    void logActivity({ cardId, userId: req.user!.id, action: "comment_added", metadata: { commentId: comment.id } })

    // Notify card assignee (if different from commenter)
    const cardForNotify = await prisma.card.findUnique({
      where: { id: cardId },
      select: { assigneeId: true, title: true },
    })
    if (cardForNotify?.assigneeId && cardForNotify.assigneeId !== req.user!.id) {
      const snippet = textOnly.slice(0, 80)
      void createNotification({
        userId: cardForNotify.assigneeId,
        type: "COMMENT_ADDED",
        title: `New comment on "${cardForNotify.title}"`,
        body: snippet || undefined,
        data: { cardId, boardId: access.board.id, workspaceId: access.board.workspaceId },
      })
    }

    emitBoardEvent(access.board.id, "comment:created", formatComment(comment))
    res.status(201).json({ comment: formatComment(comment) })
  } catch {
    res.status(500).json({ error: { message: "Failed to create comment", status: 500 } })
  }
})

// POST /api/comments/update?id= — edit own comment (author or board OWNER/ADMIN)
router.post("/update", validateJWT, async (req, res) => {
  const commentId = req.query.id as string | undefined
  if (!commentId) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }

  const { content } = req.body as { content?: string }
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    res.status(400).json({ error: { message: "content is required", status: 400 } })
    return
  }
  if (content.length > MAX_COMMENT_LENGTH) {
    res.status(400).json({ error: { message: `content must be ${MAX_COMMENT_LENGTH} characters or fewer`, status: 400 } })
    return
  }

  try {
    const comment = await prisma.comment.findUnique({ where: { id: commentId } })
    if (!comment || comment.deletedAt !== null) {
      res.status(404).json({ error: { message: "Comment not found", status: 404 } })
      return
    }

    const access = await resolveCardAccess(res, comment.cardId, req.user!.id)
    if (!access) return

    // VIEWERs cannot edit any comments, including their own
    if (!canWrite(access.membership.role)) {
      res.status(403).json({ error: { message: "Viewers cannot edit comments", status: 403 } })
      return
    }
    // Author can edit their own comment; OWNER/ADMIN can edit anyone's
    if (comment.userId !== req.user!.id && access.membership.role !== "OWNER" && access.membership.role !== "ADMIN") {
      res.status(403).json({ error: { message: "You can only edit your own comments", status: 403 } })
      return
    }

    const sanitized = sanitizeHtml(content, SANITIZE_OPTIONS)
    const textOnly = sanitizeHtml(sanitized, { allowedTags: [], allowedAttributes: {} }).trim()
    if (textOnly.length === 0) {
      res.status(400).json({ error: { message: "content cannot be empty", status: 400 } })
      return
    }

    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: { content: sanitized },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    })

    void logActivity({ cardId: comment.cardId, userId: req.user!.id, action: "comment_edited", metadata: { commentId } })
    emitBoardEvent(access.board.id, "comment:updated", formatComment(updated))
    res.json({ comment: formatComment(updated) })
  } catch {
    res.status(500).json({ error: { message: "Failed to update comment", status: 500 } })
  }
})

// POST /api/comments/delete?id= — soft delete (author or board OWNER/ADMIN)
router.post("/delete", validateJWT, async (req, res) => {
  const commentId = req.query.id as string | undefined
  if (!commentId) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }

  try {
    const comment = await prisma.comment.findUnique({ where: { id: commentId } })
    if (!comment || comment.deletedAt !== null) {
      res.status(404).json({ error: { message: "Comment not found", status: 404 } })
      return
    }

    const access = await resolveCardAccess(res, comment.cardId, req.user!.id)
    if (!access) return

    // VIEWERs cannot delete any comments, including their own
    if (!canWrite(access.membership.role)) {
      res.status(403).json({ error: { message: "Viewers cannot delete comments", status: 403 } })
      return
    }
    // Author can delete their own comment; OWNER/ADMIN can delete anyone's
    if (comment.userId !== req.user!.id && access.membership.role !== "OWNER" && access.membership.role !== "ADMIN") {
      res.status(403).json({ error: { message: "You can only delete your own comments", status: 403 } })
      return
    }

    await prisma.comment.update({ where: { id: commentId }, data: { deletedAt: new Date() } })
    void logActivity({ cardId: comment.cardId, userId: req.user!.id, action: "comment_deleted", metadata: { commentId } })
    emitBoardEvent(access.board.id, "comment:deleted", { id: commentId, cardId: comment.cardId })
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: { message: "Failed to delete comment", status: 500 } })
  }
})

export { router as commentsRouter }
