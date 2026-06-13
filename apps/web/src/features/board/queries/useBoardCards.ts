import { useQuery } from "@tanstack/react-query"
import { cardsApi, type CardSummary } from "../../../api/cards"
import { boardKeys } from "./keys"

/** Fetches all cards for the board's lists and groups them by listId, matching
 *  the existing `Record<listId, CardSummary[]>` shape. Keyed on boardId (not
 *  listIds) so later list create/delete is handled by direct cache writes, not
 *  a refetch. Enabled once the lists query has produced at least one listId. */
export function useBoardCards(boardId: string | undefined, listIds: string[]) {
  return useQuery({
    queryKey: boardKeys.cards(boardId ?? ""),
    queryFn: async () => {
      const results = await Promise.allSettled(
        listIds.map((id) => cardsApi.list(id).then((cards) => ({ id, cards }))),
      )
      const record: Record<string, CardSummary[]> = {}
      for (const r of results) {
        if (r.status === "fulfilled") record[r.value.id] = r.value.cards
      }
      return record
    },
    enabled: !!boardId && listIds.length > 0,
    staleTime: Infinity,
  })
}
