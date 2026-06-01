import { api } from "../lib/axiosInstance"
import type { SearchResponse } from "@flowgrid/types"

export const searchApi = {
  async search(q: string, workspaceId: string, limit = 20, offset = 0): Promise<SearchResponse> {
    const res = await api.get<SearchResponse>("/search", {
      params: { q, workspace_id: workspaceId, limit, offset },
    })
    return res.data
  },
}
