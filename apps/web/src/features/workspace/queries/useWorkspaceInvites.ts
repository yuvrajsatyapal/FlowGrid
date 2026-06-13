import { useQuery } from "@tanstack/react-query"
import { invitesApi } from "../../../api/invites"
import { workspaceKeys } from "./keys"

export function useWorkspaceInvites(workspaceId: string | undefined, canManage: boolean) {
  return useQuery({
    queryKey: workspaceKeys.invites(workspaceId ?? ""),
    queryFn: () => invitesApi.list(workspaceId as string),
    enabled: !!workspaceId && canManage,
    refetchInterval: 30_000,
  })
}
