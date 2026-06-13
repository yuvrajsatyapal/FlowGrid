import { useMutation, useQueryClient } from "@tanstack/react-query"
import { listsApi, type ListSummary } from "../../../api/lists"
import type { CardSummary } from "../../../api/cards"
import { boardKeys } from "../queries/keys"

/** Pessimistic delete (matches existing behavior): await the server, then
 *  remove the list AND drop its cards entry from the cards cache — preserving
 *  the original handleDeleted two-cache cleanup. On failure nothing is written
 *  (caller surfaces the error). */
export function useDeleteList(boardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string }) => listsApi.deleteList(id),
    onSuccess: (_void, { id }) => {
      qc.setQueryData<ListSummary[]>(boardKeys.lists(boardId), (prev) => (prev ?? []).filter((l) => l.id !== id))
      qc.setQueryData<Record<string, CardSummary[]>>(boardKeys.cards(boardId), (prev) => {
        if (!prev || !prev[id]) return prev ?? {}
        const next = { ...prev }
        delete next[id]
        return next
      })
    },
  })
}
