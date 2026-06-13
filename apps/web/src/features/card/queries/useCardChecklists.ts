import { useQuery } from "@tanstack/react-query"
import { checklistsApi } from "../../../api/checklists"
import { cardKeys } from "./keys"

export function useCardChecklists(cardId: string | undefined) {
  return useQuery({
    queryKey: cardKeys.checklists(cardId ?? ""),
    queryFn: () => checklistsApi.list(cardId as string),
    enabled: !!cardId,
    // Checklists have no socket channel; rely on refetch-on-mount/focus for freshness.
  })
}
