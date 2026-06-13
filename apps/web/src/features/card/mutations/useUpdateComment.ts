import { useMutation, useQueryClient } from "@tanstack/react-query"
import { commentsApi, type CommentPage } from "../../../api/comments"
import { cardKeys } from "../queries/keys"
import { applyCommentUpsert } from "../realtime/commentCache"

export function useUpdateComment(cardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => commentsApi.update(id, content),
    onSuccess: (comment) => {
      qc.setQueryData<CommentPage>(cardKeys.comments(cardId), (prev) =>
        prev ? applyCommentUpsert(prev, comment) : prev,
      )
    },
  })
}
