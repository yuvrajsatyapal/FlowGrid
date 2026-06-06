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
  isOwner: boolean
}

export interface BoardDetail extends BoardSummary {
  role: Role
  createdById: string | null
}

export interface BoardAccessMember {
  id: string       // BoardMember.id
  userId: string
  name: string | null
  email: string
  avatarUrl: string | null
  role: Role
  createdAt: string
}

interface CreateBoardRequest {
  workspaceId: string
  name: string
  visibility?: BoardVisibility
  coverColor?: string | null
  invitedMemberIds?: string[]
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

  // Board access management (PRIVATE boards only)
  async listMembers(boardId: string): Promise<BoardAccessMember[]> {
    const res = await api.get<{ members: BoardAccessMember[] }>("/boards/members", { params: { boardId } })
    return res.data.members
  },

  async addMember(boardId: string, userId: string): Promise<BoardAccessMember> {
    const res = await api.post<{ member: BoardAccessMember }>("/boards/members/add", { boardId, userId })
    return res.data.member
  },

  async removeMember(boardId: string, userId: string): Promise<void> {
    await api.post("/boards/members/remove", { boardId, userId })
  },

  // ── Board invite API (notification-first) ──────────────────────────────────

  // Creates a pending invite and sends an in-app notification. Does NOT add
  // the user as a board member immediately.
  async inviteMember(boardId: string, userId: string): Promise<{ id: string; status: string; expiresAt: string; createdAt: string }> {
    const res = await api.post<{ invite: { id: string; status: string; expiresAt: string; createdAt: string } }>("/boards/invites", { boardId, userId })
    return res.data.invite
  },

  // Returns all PENDING board invites. Used by EditBoardModal to show "Invited" state.
  async listBoardInvites(boardId: string): Promise<Array<{ id: string; inviteeId: string; status: string }>> {
    const res = await api.get<{ invites: Array<{ id: string; inviteeId: string; status: string }> }>("/boards/invites", { params: { boardId } })
    return res.data.invites
  },

  // Accept a board invite by invite ID (authenticated — invitee only).
  async acceptBoardInvite(inviteId: string): Promise<{ boardId: string; boardName: string; workspaceId: string }> {
    const res = await api.post<{ boardId: string; boardName: string; workspaceId: string }>("/boards/invites/accept", {}, { params: { id: inviteId } })
    return res.data
  },

  // Decline a board invite by invite ID (authenticated — invitee only).
  async declineBoardInvite(inviteId: string): Promise<void> {
    await api.post("/boards/invites/decline", {}, { params: { id: inviteId } })
  },
}
