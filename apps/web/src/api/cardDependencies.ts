import { api } from "../lib/axiosInstance"

export interface DependencyCard {
  id: string
  title: string
  completed?: boolean
}

export interface DependencyEntry {
  depId: string
  card: DependencyCard
}

export interface BoardCard {
  id: string
  title: string
  listName: string
}

export interface DependencyEdge {
  blockerId: string
  blockedId: string
}

export interface BoardDependencyGraph {
  edges: DependencyEdge[]
  completedCardIds: string[]
}

export const cardDependenciesApi = {
  async get(cardId: string): Promise<{ blocking: DependencyEntry[]; blockedBy: DependencyEntry[] }> {
    const res = await api.get<{ blocking: DependencyEntry[]; blockedBy: DependencyEntry[] }>(
      "/card-dependencies",
      { params: { cardId } },
    )
    return res.data
  },

  async add(blockerId: string, blockedId: string): Promise<void> {
    await api.post("/card-dependencies/add", { blockerId, blockedId })
  },

  async remove(depId: string): Promise<void> {
    await api.post("/card-dependencies/remove", {}, { params: { id: depId } })
  },

  async getBoardCards(boardId: string): Promise<BoardCard[]> {
    const res = await api.get<{ cards: BoardCard[] }>("/card-dependencies/board-cards", { params: { boardId } })
    return res.data.cards
  },

  async boardGraph(boardId: string): Promise<BoardDependencyGraph> {
    const res = await api.get<BoardDependencyGraph>("/card-dependencies/board-graph", { params: { boardId } })
    return res.data
  },
}
