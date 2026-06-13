import { useMutation, useQueryClient } from "@tanstack/react-query"
import { checklistsApi, type Checklist, type ChecklistItem } from "../../../api/checklists"
import { cardKeys } from "../queries/keys"
import { optimisticListUpdate } from "../../../lib/cache/optimistic"

/** Optimistic: removes the item from the cache immediately, then awaits the
 *  server. On failure the optimistic snapshot is restored. */
export function useDeleteChecklistItem(cardId: string) {
  const qc = useQueryClient()
  const key = cardKeys.checklists(cardId)
  return useMutation({
    mutationFn: ({ item }: { item: ChecklistItem }) => checklistsApi.deleteItem(item.id),
    ...optimisticListUpdate<Checklist[], { item: ChecklistItem }>(qc, key, (prev, { item }) =>
      (prev ?? []).map((cl) => ({ ...cl, items: cl.items.filter((i) => i.id !== item.id) })),
    ),
  })
}
