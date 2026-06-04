import { cardsApi, type CardSummary } from "../api/cards"
import type { DependencyEdge } from "../api/cardDependencies"

// ── Completion state ────────────────────────────────────────────────────────
// Completion is stored on the card as `completedAt` (null = incomplete).

export function isCardComplete(card: Pick<CardSummary, "completedAt"> | null | undefined): boolean {
  return !!card?.completedAt
}

// Source of truth for marking a card complete/incomplete. Returns the updated card.
export async function setCardComplete(cardId: string, complete: boolean): Promise<CardSummary> {
  return cardsApi.update(cardId, { completed: complete })
}

// ── Blocked-state evaluation ──────────────────────────────────────────────────
// A card is blocked when at least one of its "blocked by" dependencies (i.e. a
// card that blocks it) is not yet completed.

export interface DependencyGraph {
  edges: DependencyEdge[]
  completed: Set<string>
}

// Compute the set of blocked card ids for a whole board in one pass (O(edges)).
export function computeBlockedCardIds(edges: DependencyEdge[], completedCardIds: string[]): Set<string> {
  const completed = new Set(completedCardIds)
  const blocked = new Set<string>()
  for (const e of edges) {
    // `blocker` must finish before `blocked`; if the blocker isn't complete, `blocked` is blocked.
    if (!completed.has(e.blockerId)) blocked.add(e.blockedId)
  }
  return blocked
}

// Whether a single card is blocked, given a precomputed blocked set.
export function isCardBlocked(cardId: string, blockedCardIds: Set<string>): boolean {
  return blockedCardIds.has(cardId)
}
