import { useQueryClient } from "@tanstack/react-query"
import { useWorkspaceSocket } from "../../../hooks/useWorkspaceSocket"
import { workspaceKeys } from "../queries/keys"
import type { WorkspaceMember } from "../../../api/workspaces"

export function useWorkspacePresenceSync(workspaceId: string | undefined) {
  const qc = useQueryClient()
  const setOnline = (userId: string, online: boolean) => {
    if (!workspaceId) return
    qc.setQueryData<WorkspaceMember[]>(workspaceKeys.members(workspaceId), (prev) =>
      prev?.map((m) => (m.userId === userId ? { ...m, online } : m)),
    )
  }
  useWorkspaceSocket(workspaceId, {
    onMemberOnline: ({ userId }) => setOnline(userId, true),
    onMemberOffline: ({ userId }) => setOnline(userId, false),
  })
}
