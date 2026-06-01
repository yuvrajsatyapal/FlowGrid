import { api } from "../lib/axiosInstance"
import type { AnalyticsData } from "@flowgrid/types"

export const analyticsApi = {
  async get(workspaceId: string): Promise<AnalyticsData> {
    const res = await api.get<AnalyticsData>("/analytics", {
      params: { workspace_id: workspaceId },
    })
    return res.data
  },
}
