import { useQuery } from "@tanstack/react-query"
import { analyticsApi } from "../api/analytics"
import type { AnalyticsData } from "@flowgrid/types"

export function useAnalytics(workspaceId: string | undefined, days: number = 30) {
  return useQuery<AnalyticsData>({
    queryKey: ["analytics", workspaceId, days],
    queryFn: () => analyticsApi.get(workspaceId as string, days),
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60 * 1000,
  })
}
