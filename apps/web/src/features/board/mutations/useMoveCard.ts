import { useMutation, useQueryClient } from "@tanstack/react-query"
import { cardsApi, type CardSummary } from "../../../api/cards"
import { boardKeys } from "../queries/keys"
import { optimisticListUpdate } from "../../../lib/cache/optimistic"

type CardsByList = Record<string, CardSummary[]>

interface MoveVars {
  cardId: string
  sourceListId: string
  destListId: string
  newSourceCards: CardSummary[]
  newDestCards: CardSummary[]
}

/** Cross-list move. The caller computes the new source/dest arrays from the
 *  drop target (drag-UX logic stays in the component); this hook applies them
 *  optimistically, snapshots the whole cards record, and restores it on
 *  failure. No invalidate: the backend reassigns positions in the client-sent
 *  order, so the optimistic ordering is canonical (position audit). */
export function useMoveCard(boardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cardId, destListId, newDestCards }: MoveVars) =>
      cardsApi.move(cardId, destListId, newDestCards.map((c) => c.id)),
    ...optimisticListUpdate<CardsByList, MoveVars>(
      qc,
      boardKeys.cards(boardId),
      (prev, { sourceListId, destListId, newSourceCards, newDestCards }) => ({
        ...(prev ?? {}),
        [sourceListId]: newSourceCards,
        [destListId]: newDestCards,
      }),
    ),
  })
}
