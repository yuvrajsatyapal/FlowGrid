import { upsertById, removeById } from "../../../lib/cache/collection"
import type { CardSummary } from "../../../api/cards"

export type CardsByList = Record<string, CardSummary[]>

interface LabelPatch {
  id: string
  name: string
  color: string
}

/** Insert-or-update a card within its list (idempotent + version-guarded via
 *  upsertById). Replaces the inline handleCardCreated/.some() guard and
 *  handleCardUpdated map. */
export function upsertCardInBoard(record: CardsByList, card: CardSummary): CardsByList {
  const list = record[card.listId] ?? []
  return { ...record, [card.listId]: upsertById(list, card) }
}

const ms = (v: string | Date | undefined): number =>
  v == null ? NaN : typeof v === "string" ? Date.parse(v) : v.getTime()

/** Cross-list move reconciliation: remove the card from whichever list holds it
 *  and append it to its (new) listId. Version-guarded — a move whose card is
 *  strictly older than the one already cached is ignored (stale-event guard).
 *  Idempotent: re-applying the same move converges (remove-then-append). */
export function moveCardInBoard(record: CardsByList, card: CardSummary): CardsByList {
  for (const cards of Object.values(record)) {
    const current = cards.find((c) => c.id === card.id)
    if (current) {
      const tCur = ms(current.updatedAt)
      const tNew = ms(card.updatedAt)
      if (!Number.isNaN(tCur) && !Number.isNaN(tNew) && tNew < tCur) return record
      break
    }
  }
  const next: CardsByList = {}
  for (const [lid, cards] of Object.entries(record)) {
    next[lid] = cards.filter((c) => c.id !== card.id)
  }
  next[card.listId] = [...(next[card.listId] ?? []), card]
  return next
}

/** Remove a card from whichever list holds it (board-wide). */
export function removeCardFromBoard(record: CardsByList, id: string): CardsByList {
  const next: CardsByList = {}
  for (const [lid, cards] of Object.entries(record)) {
    next[lid] = removeById(cards, id)
  }
  return next
}

/** Label rename/recolor → patch that label on every card across the board. */
export function applyLabelUpdateToBoard(record: CardsByList, label: LabelPatch): CardsByList {
  const next: CardsByList = {}
  for (const [lid, cards] of Object.entries(record)) {
    next[lid] = cards.map((c) => ({
      ...c,
      labels: c.labels.map((l) => (l.id === label.id ? { ...l, name: label.name, color: label.color } : l)),
    }))
  }
  return next
}

/** Label deletion → strip that label from every card across the board. */
export function applyLabelDeleteFromBoard(record: CardsByList, labelId: string): CardsByList {
  const next: CardsByList = {}
  for (const [lid, cards] of Object.entries(record)) {
    next[lid] = cards.map((c) => ({ ...c, labels: c.labels.filter((l) => l.id !== labelId) }))
  }
  return next
}
