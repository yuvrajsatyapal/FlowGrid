import { useMutation, useQueryClient } from "@tanstack/react-query"
import { listsApi, type ListSummary } from "../../../api/lists"
import { boardKeys } from "../queries/keys"

/** Pessimistic rename (matches existing behavior): await the server, then patch
 *  the list name in the cache. On failure nothing is written (caller resets its
 *  inline-edit input). */
export function useRenameList(boardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => listsApi.update(id, name),
    onSuccess: (updated) => {
      qc.setQueryData<ListSummary[]>(boardKeys.lists(boardId), (prev) =>
        (prev ?? []).map((l) => (l.id === updated.id ? { ...l, name: updated.name } : l)),
      )
    },
  })
}
