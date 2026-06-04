import { api } from "../lib/axiosInstance"
import type { Priority } from "@flowgrid/types"

export interface CardAssignee {
  id: string
  name: string | null
  avatarUrl: string | null
}

export interface CardLabel {
  id: string
  name: string
  color: string
}

export interface CardSummary {
  id: string
  listId: string
  title: string
  description: string | null
  position: string
  priority: Priority
  startDate: string | null
  dueDate: string | null
  assigneeId: string | null
  assignee: CardAssignee | null
  labels: CardLabel[]
  coverColor: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  commentCount: number
  attachmentCount: number
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
    data: {
      title?: string
      description?: string | null
      priority?: Priority
      startDate?: string | null
      dueDate?: string | null
      assigneeId?: string | null
      completed?: boolean
    },
  ): Promise<CardSummary> {
    const res = await api.post<{ card: CardSummary }>("/cards/update", data, { params: { id } })
    return res.data.card
  },

  async addLabel(cardId: string, labelId: string): Promise<void> {
    await api.post("/cards/labels/add", { cardId, labelId })
  },

  async removeLabel(cardId: string, labelId: string): Promise<void> {
    await api.post("/cards/labels/remove", { cardId, labelId })
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

  async upcoming(workspaceId: string, days = 14): Promise<UpcomingCard[]> {
    const res = await api.get<{ cards: UpcomingCard[] }>("/cards/upcoming", { params: { workspaceId, days } })
    return res.data.cards
  },
}

export interface UpcomingCard {
  id: string
  title: string
  dueDate: string
  listId: string
  boardId: string
}
