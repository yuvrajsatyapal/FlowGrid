import { useMutation, useQueryClient } from "@tanstack/react-query"
import { cardsApi, type CardSummary } from "../../../api/cards"
import { boardKeys } from "../queries/keys"
import { upsertCardInBoard, type CardsByList } from "../cache/cardCache"

type UpdateFields = Parameters<typeof cardsApi.update>[1]

/** Pessimistic update (matches existing modal behavior): await the server, then
 *  upsert the returned card into the board cache and recompute the dependency
 *  graph (completion may change blocked badges). Returns the updated card so the
 *  caller can sync its local view. */
export function useUpdateCard(boardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cardId, fields }: { cardId: string; fields: UpdateFields }) => cardsApi.update(cardId, fields),
    onSuccess: (updated: CardSummary) => {
      qc.setQueryData<CardsByList>(boardKeys.cards(boardId), (prev) => (prev ? upsertCardInBoard(prev, updated) : prev))
      void qc.invalidateQueries({ queryKey: boardKeys.depGraph(boardId) })
    },
  })
}
