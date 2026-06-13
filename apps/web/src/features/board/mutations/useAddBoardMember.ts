import { useMutation, useQueryClient } from "@tanstack/react-query"
import { boardsApi, type BoardAccessMember } from "../../../api/boards"
import { boardKeys } from "../queries/keys"

export function useAddBoardMember(boardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId }: { userId: string }) => boardsApi.addMember(boardId, userId),
    onSuccess: (added) => {
      qc.setQueryData<BoardAccessMember[]>(boardKeys.members(boardId), (prev) => [...(prev ?? []), added])
    },
  })
}
