import { useQuery } from "@tanstack/react-query"
import { analyticsApi } from "../api/analytics"
import type { AnalyticsData } from "@flowgrid/types"

export function useAnalytics(workspaceId: string | undefined) {
  return useQuery<AnalyticsData>({
    queryKey: ["analytics", workspaceId],
    queryFn: () => analyticsApi.get(workspaceId!),
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60 * 1000, // 5 min — analytics don't need to be real-time
  })
}
