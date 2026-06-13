import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Role } from "@flowgrid/types"
import { workspacesApi, type WorkspaceMember } from "../../../api/workspaces"
import { workspaceKeys } from "../queries/keys"

export function useUpdateMemberRole(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: Role }) =>
      workspacesApi.updateMember(memberId, role),
    onSuccess: (updated, { memberId }) => {
      qc.setQueryData<WorkspaceMember[]>(workspaceKeys.members(workspaceId), (prev) =>
        prev?.map((m) => (m.id === memberId ? { ...m, role: updated.role } : m)),
      )
    },
  })
}
