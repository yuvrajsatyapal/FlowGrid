import { useMutation, useQueryClient } from "@tanstack/react-query"
import { cardsApi } from "../../../api/cards"
import { boardKeys } from "../queries/keys"
import { removeCardFromBoard, type CardsByList } from "../cache/cardCache"

/** Pessimistic delete: await the server, then remove the card from the board
 *  cache. Idempotent with the socket onCardDeleted handler (untouched, 3d), so
 *  no double-removal. Previously delete was socket-only; this makes the open
 *  card's removal deterministic on API success. */
export function useDeleteCard(boardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cardId }: { cardId: string }) => cardsApi.deleteCard(cardId),
    onSuccess: (_void, { cardId }) => {
      qc.setQueryData<CardsByList>(boardKeys.cards(boardId), (prev) => (prev ? removeCardFromBoard(prev, cardId) : prev))
      void qc.invalidateQueries({ queryKey: boardKeys.depGraph(boardId) })
    },
  })
}
