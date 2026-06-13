import { useMutation, useQueryClient } from "@tanstack/react-query"
import { listsApi, type ListSummary } from "../../../api/lists"
import type { CardSummary } from "../../../api/cards"
import { boardKeys } from "../queries/keys"
import { upsertById } from "../../../lib/cache/collection"

/** Pessimistic create (matches existing behavior): await the server, then
 *  insert the new list and seed its empty cards entry. upsertById is idempotent,
 *  so the socket onListCreated echo and this write converge with no duplicate —
 *  replacing the old inline `.some()` dedup check (the socket handler's own guard
 *  is untouched). */
export function useCreateList(boardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name }: { name: string }) => listsApi.create(boardId, name),
    onSuccess: (newList) => {
      qc.setQueryData<ListSummary[]>(boardKeys.lists(boardId), (prev) => upsertById(prev ?? [], newList))
      qc.setQueryData<Record<string, CardSummary[]>>(boardKeys.cards(boardId), (prev) =>
        prev?.[newList.id] ? prev : { ...(prev ?? {}), [newList.id]: [] },
      )
    },
  })
}
