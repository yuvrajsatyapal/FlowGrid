import { useMutation, useQueryClient } from "@tanstack/react-query"
import { boardsApi, type BoardAccessMember } from "../../../api/boards"
import { boardKeys } from "../queries/keys"

export function useRemoveBoardMember(boardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId }: { userId: string }) => boardsApi.removeMember(boardId, userId),
    onSuccess: (_void, { userId }) => {
      qc.setQueryData<BoardAccessMember[]>(boardKeys.members(boardId), (prev) =>
        (prev ?? []).filter((m) => m.userId !== userId),
      )
    },
  })
}
