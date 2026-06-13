import { useMutation, useQueryClient } from "@tanstack/react-query"
import { cardsApi, type CardSummary } from "../../../api/cards"
import { boardKeys } from "../queries/keys"
import { optimisticListUpdate } from "../../../lib/cache/optimistic"
import { reorderByIds } from "../../../lib/cache/collection"

type CardsByList = Record<string, CardSummary[]>

/** Same-list reorder. Optimistically reorders the list in the cache to match
 *  the dropped order, then awaits the server. On failure the whole cards
 *  snapshot is restored. No invalidate: the backend reassigns positions in the
 *  client-sent id order, so the optimistic order is canonical (position audit). */
export function useReorderCards(boardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ listId, orderedIds }: { listId: string; orderedIds: string[] }) =>
      cardsApi.reorder(listId, orderedIds),
    ...optimisticListUpdate<CardsByList, { listId: string; orderedIds: string[] }>(
      qc,
      boardKeys.cards(boardId),
      (prev, { listId, orderedIds }) => ({
        ...(prev ?? {}),
        [listId]: reorderByIds(prev?.[listId] ?? [], orderedIds),
      }),
    ),
  })
}
