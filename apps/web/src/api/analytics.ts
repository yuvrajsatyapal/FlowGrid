import { api } from "../lib/axiosInstance"
import type { AnalyticsData } from "@flowgrid/types"

export const analyticsApi = {
  async get(workspaceId: string, days: number = 30): Promise<AnalyticsData> {
    const res = await api.get<AnalyticsData>("/analytics", {
      params: { workspace_id: workspaceId, days },
    })
    return res.data
  },
}
