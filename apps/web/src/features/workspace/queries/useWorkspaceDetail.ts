import { useQuery } from "@tanstack/react-query"
import { workspacesApi } from "../../../api/workspaces"
import { workspaceKeys } from "./keys"

/** Per-workspace detail (name/description/color/slug/counts) for the settings
 *  page. Owns the server read; the page keeps an editable form draft seeded
 *  from this query. Distinct from the workspace LIST (still in Zustand). */
export function useWorkspaceDetail(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceKeys.detail(workspaceId ?? ""),
    queryFn: () => workspacesApi.getOne(workspaceId as string),
    enabled: !!workspaceId,
  })
}
