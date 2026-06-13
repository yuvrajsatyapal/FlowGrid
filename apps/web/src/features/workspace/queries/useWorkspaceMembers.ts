import { useQuery } from "@tanstack/react-query"
import { workspacesApi } from "../../../api/workspaces"
import { workspaceKeys } from "./keys"

export function useWorkspaceMembers(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceKeys.members(workspaceId ?? ""),
    queryFn: () => workspacesApi.listMembers(workspaceId as string),
    enabled: !!workspaceId,
    refetchInterval: 30_000, // preserves the old silent 30s presence refresh
  })
}
