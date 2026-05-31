import { api } from "../lib/axiosInstance"
import type { Priority } from "@flowgrid/types"

export interface CardSummary {
  id: string
  listId: string
  title: string
  description: string | null
  position: string
  priority: Priority
  dueDate: string | null
  assigneeId: string | null
  coverColor: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export const cardsApi = {
  async create(listId: string, title: string): Promise<CardSummary> {
    const res = await api.post<{ card: CardSummary }>("/cards", { listId, title })
    return res.data.card
  },

  async list(listId: string): Promise<CardSummary[]> {
    const res = await api.get<{ cards: CardSummary[] }>("/cards", { params: { listId } })
    return res.data.cards
  },

  async update(
    id: string,
    data: { title?: string; description?: string | null; priority?: Priority },
  ): Promise<CardSummary> {
    const res = await api.post<{ card: CardSummary }>("/cards/update", data, { params: { id } })
    return res.data.card
  },

  async reorder(listId: string, cardIds: string[]): Promise<void> {
    await api.post("/cards/reorder", { listId, cardIds })
  },

  async move(cardId: string, targetListId: string, cardIds: string[]): Promise<CardSummary> {
    const res = await api.post<{ card: CardSummary }>("/cards/move", { cardId, targetListId, cardIds })
    return res.data.card
  },

  async deleteCard(id: string): Promise<void> {
    await api.post("/cards/delete", {}, { params: { id } })
  },
}
