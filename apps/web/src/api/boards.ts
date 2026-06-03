import { api } from "../lib/axiosInstance"
import type { BoardVisibility, Priority, Role } from "@flowgrid/types"

export interface CalendarCard {
  id: string
  listId: string
  listTitle: string
  title: string
  priority: Priority
  startDate: string | null
  dueDate: string | null
  assigneeId: string | null
  assignee: { id: string; name: string | null; avatarUrl: string | null } | null
  labels: { id: string; name: string; color: string }[]
  coverColor: string | null
}

export interface BoardMemberSummary {
  id: string
  name: string | null
  avatarUrl: string | null
}

export interface BoardSummary {
  id: string
  workspaceId: string
  name: string
  description: string | null
  visibility: BoardVisibility
  coverColor: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  listCount: number
  cardCount: number
  members: BoardMemberSummary[]
  memberCount: number
}

export interface BoardDetail extends BoardSummary {
  role: Role
}

interface CreateBoardRequest {
  workspaceId: string
  name: string
  visibility?: BoardVisibility
  coverColor?: string | null
}

interface UpdateBoardRequest {
  name?: string
  visibility?: BoardVisibility
  coverColor?: string | null
}

export const boardsApi = {
  async create(data: CreateBoardRequest): Promise<BoardSummary> {
    const res = await api.post<{ board: BoardSummary }>("/boards", data)
    return res.data.board
  },

  async list(workspaceId: string): Promise<BoardSummary[]> {
    const res = await api.get<{ boards: BoardSummary[] }>("/boards", { params: { workspaceId } })
    return res.data.boards
  },

  async getOne(id: string): Promise<BoardDetail> {
    const res = await api.get<{ board: BoardDetail }>("/boards/one", { params: { id } })
    return res.data.board
  },

  async update(id: string, data: UpdateBoardRequest): Promise<BoardSummary> {
    const res = await api.post<{ board: BoardSummary }>("/boards/update", data, { params: { id } })
    return res.data.board
  },

  async deleteBoard(id: string): Promise<void> {
    await api.post("/boards/delete", {}, { params: { id } })
  },

  async getCalendarCards(boardId: string): Promise<CalendarCard[]> {
    const res = await api.get<{ cards: CalendarCard[] }>("/boards/calendar", { params: { boardId } })
    return res.data.cards
  },
}
