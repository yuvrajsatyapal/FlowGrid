import { useMutation, useQueryClient } from "@tanstack/react-query"
import { checklistsApi, type Checklist, type ChecklistItem } from "../../../api/checklists"
import { cardKeys } from "../queries/keys"
import { optimisticListUpdate } from "../../../lib/cache/optimistic"

/** Optimistic: flips the item's checked state in the cache immediately, then
 *  awaits the server. On failure the optimistic snapshot is restored. */
export function useToggleChecklistItem(cardId: string) {
  const qc = useQueryClient()
  const key = cardKeys.checklists(cardId)
  return useMutation({
    mutationFn: ({ item }: { item: ChecklistItem }) =>
      checklistsApi.updateItem(item.id, { checked: !item.checked }),
    ...optimisticListUpdate<Checklist[], { item: ChecklistItem }>(qc, key, (prev, { item }) =>
      (prev ?? []).map((cl) => ({
        ...cl,
        items: cl.items.map((i) => (i.id === item.id ? { ...i, checked: !item.checked } : i)),
      })),
    ),
  })
}
