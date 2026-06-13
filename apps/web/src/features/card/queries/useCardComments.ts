import { useQuery } from "@tanstack/react-query"
import { commentsApi } from "../../../api/comments"
import { cardKeys } from "./keys"

export function useCardComments(cardId: string | undefined) {
  return useQuery({
    queryKey: cardKeys.comments(cardId ?? ""),
    queryFn: () => commentsApi.list(cardId as string),
    enabled: !!cardId,
    staleTime: Infinity, // socket-driven; reconciled by useCommentRealtimeSync
  })
}
