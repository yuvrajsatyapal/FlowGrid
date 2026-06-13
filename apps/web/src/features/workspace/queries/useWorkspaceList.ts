import { useQuery } from "@tanstack/react-query"
import { workspacesApi } from "../../../api/workspaces"
import { workspaceKeys } from "./keys"
import { useAuth } from "../../../contexts/AuthContext"

/** Canonical source of truth for the workspace LIST (Phase 4B).
 *  Replaces the Zustand-owned `workspaces[]`. Zustand now owns only the active
 *  selection. Key: workspaceKeys.list() === ['workspace','list']. */
export function useWorkspaceList() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: workspaceKeys.list(),
    queryFn: () => workspacesApi.list(),
    enabled: !!accessToken,
    staleTime: 60_000,
  })
}
