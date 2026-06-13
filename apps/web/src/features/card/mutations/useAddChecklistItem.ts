import { useMutation, useQueryClient } from "@tanstack/react-query"
import { checklistsApi, type Checklist } from "../../../api/checklists"
import { cardKeys } from "../queries/keys"

const DEFAULT_CHECKLIST_TITLE = "Checklist"

/** Pessimistic: adds an item to the card's first checklist, creating a single
 *  default checklist first if none exists (preserves the original behavior).
 *  Two server round-trips, so kept pessimistic — the item appears once both
 *  succeed. */
export function useAddChecklistItem(cardId: string) {
  const qc = useQueryClient()
  const key = cardKeys.checklists(cardId)
  return useMutation({
    mutationFn: async ({ text }: { text: string }) => {
      const existing = qc.getQueryData<Checklist[]>(key) ?? []
      let target = existing[0]
      let createdChecklist: Checklist | null = null
      if (!target) {
        target = await checklistsApi.create(cardId, DEFAULT_CHECKLIST_TITLE)
        createdChecklist = target
      }
      const item = await checklistsApi.addItem(target.id, text)
      return { targetId: target.id, item, createdChecklist }
    },
    onSuccess: ({ targetId, item, createdChecklist }) => {
      qc.setQueryData<Checklist[]>(key, (prev) => {
        let next = prev ?? []
        if (createdChecklist && !next.some((cl) => cl.id === createdChecklist.id)) {
          next = [...next, createdChecklist]
        }
        return next.map((cl) => (cl.id === targetId ? { ...cl, items: [...cl.items, item] } : cl))
      })
    },
  })
}
