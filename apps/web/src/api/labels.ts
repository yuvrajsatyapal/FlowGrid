import { api } from "../lib/axiosInstance"

export interface LabelSummary {
  id: string
  name: string
  color: string
}

export const labelsApi = {
  async list(boardId: string): Promise<LabelSummary[]> {
    const res = await api.get<{ labels: LabelSummary[] }>("/labels", { params: { boardId } })
    return res.data.labels
  },

  async create(boardId: string, name: string, color: string): Promise<LabelSummary> {
    const res = await api.post<{ label: LabelSummary }>("/labels", { boardId, name, color })
    return res.data.label
  },
}
