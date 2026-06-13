import { useMutation, useQueryClient } from "@tanstack/react-query"
import { workspacesApi, type WorkspaceMember } from "../../../api/workspaces"
import { workspaceKeys } from "../queries/keys"

export function useRemoveMember(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ memberId }: { memberId: string }) => workspacesApi.removeMember(memberId),
    onSuccess: (_void, { memberId }) => {
      qc.setQueryData<WorkspaceMember[]>(workspaceKeys.members(workspaceId), (prev) =>
        prev?.filter((m) => m.id !== memberId),
      )
    },
  })
}
