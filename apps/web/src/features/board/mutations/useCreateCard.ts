import { useMutation, useQueryClient } from "@tanstack/react-query"
import { cardsApi, type CardSummary } from "../../../api/cards"
import { boardKeys } from "../queries/keys"
import { upsertCardInBoard, type CardsByList } from "../cache/cardCache"

/** Pessimistic create (matches existing behavior): await the server, then
 *  idempotently insert the card into its list. upsertById dedup means the
 *  socket onCardCreated echo and this write converge — replacing the old inline
 *  `.some()` guard (the socket handler's own guard is untouched, reserved for 3d). */
export function useCreateCard(boardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ listId, title }: { listId: string; title: string }) => cardsApi.create(listId, title),
    onSuccess: (card: CardSummary) => {
      qc.setQueryData<CardsByList>(boardKeys.cards(boardId), (prev) => (prev ? upsertCardInBoard(prev, card) : prev))
    },
  })
}
