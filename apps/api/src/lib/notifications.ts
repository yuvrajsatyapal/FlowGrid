import { prisma } from "./prisma"
import { emitToUser } from "./socket"
import { Prisma } from "../../generated/prisma"
import logger from "./logger"

/**
 * Returns all notification recipients for a card: assignee + watchers, deduplicated,
 * with the actor excluded (no self-notifications).
 *
 * Two parallel queries (card + watchers) — no sequential N+1.
 */
export async function getCardRecipients(cardId: string, actorId: string): Promise<string[]> {
  const [card, watchers] = await Promise.all([
    prisma.card.findUnique({ where: { id: cardId }, select: { assigneeId: true } }),
    prisma.cardWatcher.findMany({ where: { cardId }, select: { userId: true } }),
  ])

  const ids = new Set<string>()
  if (card?.assigneeId) ids.add(card.assigneeId)
  for (const w of watchers) ids.add(w.userId)
  ids.delete(actorId)

  return Array.from(ids)
}

export async function createNotification(params: {
  userId: string
  type: string
  title: string
  body?: string
  data?: Record<string, unknown>
}): Promise<void> {
  try {
    const n = await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body ?? null,
        data: (params.data ?? Prisma.JsonNull) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
      },
    })
    emitToUser(params.userId, "notification:new", {
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data,
      read: n.read,
      createdAt: n.createdAt,
    })
  } catch (err) {
    // Notification creation must never block primary actions
    logger.error("Failed to create notification", { type: params.type, error: err instanceof Error ? err.message : err })
  }
}
