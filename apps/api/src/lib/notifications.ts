import { prisma } from "./prisma"
import { emitToUser } from "./socket"
import { Prisma } from "../../generated/prisma"
import logger from "./logger"
import type { NotificationSource, NotificationType } from "@flowgrid/types"

export type CardRecipient = {
  userId: string
  // SYSTEM is excluded — card recipients are always subscription-based (assignee or watcher)
  source: 'ASSIGNMENT' | 'WATCHER'
}

/**
 * Returns all notification recipients for a card: assignee + watchers, deduplicated,
 * with the actor excluded (no self-notifications).
 *
 * Dedup rule: ASSIGNMENT wins — if a user is both assignee and watcher they appear
 * once with source 'ASSIGNMENT'. Never cache the result; always re-fetches current state.
 *
 * Two parallel queries (card + watchers) — no sequential N+1.
 */
export async function getCardRecipients(cardId: string, actorId: string): Promise<CardRecipient[]> {
  const [card, watchers] = await Promise.all([
    prisma.card.findUnique({ where: { id: cardId }, select: { assigneeId: true } }),
    prisma.cardWatcher.findMany({ where: { cardId }, select: { userId: true } }),
  ])

  const result: CardRecipient[] = []
  const seen = new Set<string>()

  // Assignee first — ASSIGNMENT source takes priority
  if (card?.assigneeId && card.assigneeId !== actorId) {
    seen.add(card.assigneeId)
    result.push({ userId: card.assigneeId, source: 'ASSIGNMENT' })
  }

  // Watchers — skip actor and any user already added as assignee
  for (const w of watchers) {
    if (w.userId === actorId || seen.has(w.userId)) continue
    seen.add(w.userId)
    result.push({ userId: w.userId, source: 'WATCHER' })
  }

  return result
}

export async function createNotification(params: {
  userId: string
  type: NotificationType
  source: NotificationSource
  title: string
  body?: string
  data?: Record<string, unknown>
}): Promise<void> {
  try {
    const n = await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        source: params.source,
        title: params.title,
        body: params.body ?? null,
        // Cast is safe: callers pass JSON-serialisable values; TS can't unify Record<string,unknown> with InputJsonValue
        data: (params.data ?? Prisma.JsonNull) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
      },
    })
    emitToUser(params.userId, "notification:new", {
      id: n.id,
      userId: n.userId,
      type: n.type,
      source: n.source,
      title: n.title,
      body: n.body,
      data: n.data,
      read: n.read,
      createdAt: n.createdAt,
    })
  } catch (err) {
    logger.error("Failed to create notification", { type: params.type, source: params.source, error: err instanceof Error ? err.message : err })
  }
}
