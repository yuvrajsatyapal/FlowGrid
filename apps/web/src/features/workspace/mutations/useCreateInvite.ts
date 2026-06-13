import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Role } from "@flowgrid/types"
import { invitesApi } from "../../../api/invites"
import { workspaceKeys } from "../queries/keys"

export function useCreateInvite(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      invitesApi.create(workspaceId, userId, role),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workspaceKeys.invites(workspaceId) })
    },
  })
}
