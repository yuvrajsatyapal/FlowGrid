import { api } from "../lib/axiosInstance"

export interface ListSummary {
  id: string
  boardId: string
  name: string
  position: string
  cardCount: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export const listsApi = {
  async create(boardId: string, name: string): Promise<ListSummary> {
    const res = await api.post<{ list: ListSummary }>("/lists", { boardId, name })
    return res.data.list
  },

  async list(boardId: string): Promise<ListSummary[]> {
    const res = await api.get<{ lists: ListSummary[] }>("/lists", { params: { boardId } })
    return res.data.lists
  },

  async update(id: string, name: string): Promise<ListSummary> {
    const res = await api.post<{ list: ListSummary }>("/lists/update", { name }, { params: { id } })
    return res.data.list
  },

  async reorder(boardId: string, positions: { id: string; position: string }[]): Promise<void> {
    await api.post("/lists/reorder", { boardId, positions })
  },

  async deleteList(id: string): Promise<void> {
    await api.post("/lists/delete", {}, { params: { id } })
  },
}
