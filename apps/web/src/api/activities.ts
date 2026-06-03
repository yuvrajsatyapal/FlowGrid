import { api } from "../lib/axiosInstance"
import type { ActivityResponse } from "@flowgrid/types"

export interface ActivityPage {
  items: ActivityResponse[]
  total: number
  offset: number
  limit: number
}

export const activitiesApi = {
  async list(cardId: string, offset = 0, limit = 100): Promise<ActivityPage> {
    const res = await api.get<ActivityPage>("/activities", { params: { cardId, offset, limit } })
    return res.data
  },

  async listWorkspace(workspaceId: string, limit = 10): Promise<ActivityResponse[]> {
    const res = await api.get<{ items: ActivityResponse[] }>("/activities/workspace", { params: { workspaceId, limit } })
    return res.data.items
  },
}
