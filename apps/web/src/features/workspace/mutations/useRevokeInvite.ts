import { useMutation, useQueryClient } from "@tanstack/react-query"
import { invitesApi, type WorkspaceInviteRecord } from "../../../api/invites"
import { workspaceKeys } from "../queries/keys"

export function useRevokeInvite(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ inviteId }: { inviteId: string }) => invitesApi.revoke(inviteId),
    onSuccess: (_void, { inviteId }) => {
      qc.setQueryData<WorkspaceInviteRecord[]>(workspaceKeys.invites(workspaceId), (prev) =>
        prev?.filter((i) => i.id !== inviteId),
      )
    },
  })
}
