import { api } from "../lib/axiosInstance"
import type { CommentResponse } from "@flowgrid/types"

export interface CommentPage {
  items: CommentResponse[]
  total: number
  offset: number
  limit: number
}

export const commentsApi = {
  async list(cardId: string, offset = 0, limit = 50): Promise<CommentPage> {
    const res = await api.get<CommentPage>("/comments", { params: { cardId, offset, limit } })
    return res.data
  },

  async create(cardId: string, content: string): Promise<CommentResponse> {
    const res = await api.post<{ comment: CommentResponse }>("/comments", { cardId, content })
    return res.data.comment
  },

  async update(id: string, content: string): Promise<CommentResponse> {
    const res = await api.post<{ comment: CommentResponse }>("/comments/update", { content }, { params: { id } })
    return res.data.comment
  },

  async delete(id: string): Promise<void> {
    await api.post("/comments/delete", {}, { params: { id } })
  },
}
