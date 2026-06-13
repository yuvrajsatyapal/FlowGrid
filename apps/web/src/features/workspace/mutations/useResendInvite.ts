import { useMutation, useQueryClient } from "@tanstack/react-query"
import { invitesApi, type WorkspaceInviteRecord } from "../../../api/invites"
import { workspaceKeys } from "../queries/keys"

export function useResendInvite(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ inviteId }: { inviteId: string }) => invitesApi.resend(inviteId),
    onSuccess: (result, { inviteId }) => {
      qc.setQueryData<WorkspaceInviteRecord[]>(workspaceKeys.invites(workspaceId), (prev) =>
        prev?.map((i) => (i.id === inviteId ? { ...i, ...result.invite } : i)),
      )
    },
  })
}
