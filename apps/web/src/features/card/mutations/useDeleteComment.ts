import { useMutation, useQueryClient } from "@tanstack/react-query"
import { commentsApi, type CommentPage } from "../../../api/comments"
import { cardKeys } from "../queries/keys"
import { applyCommentRemove } from "../realtime/commentCache"

export function useDeleteComment(cardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string }) => commentsApi.delete(id),
    onSuccess: (_void, { id }) => {
      qc.setQueryData<CommentPage>(cardKeys.comments(cardId), (prev) =>
        prev ? applyCommentRemove(prev, id) : prev,
      )
    },
  })
}
