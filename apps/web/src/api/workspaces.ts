import { api } from "../lib/axiosInstance"
import type { Role, WorkspaceMemberResponse } from "@flowgrid/types"

export interface WorkspaceMember {
  id: string       // WorkspaceMember.id — pass to update/remove endpoints
  userId: string   // User.id — use for identity comparisons
  name: string | null
  email: string
  avatarUrl: string | null
  role: Role
}

export interface WorkspaceSummary {
  id: string
  name: string
  slug: string
  organizationId: string
  role?: Role
}

// Shape returned by GET /workspaces/one — a lighter API response, not the full domain model
export interface WorkspaceDetail extends WorkspaceSummary {
  description: string | null
  organization: { id: string; name: string; slug: string; ownerId: string }
  memberCount: number
  boardCount: number
  role: Role
  createdAt: string
}

// Returned by POST /workspaces/update — includes description from backend select
export interface WorkspaceUpdateResult {
  id: string
  name: string
  slug: string
  description: string | null
  organizationId: string
}

interface CreateWorkspaceRequest {
  name: string
}

interface UpdateWorkspaceRequest {
  name?: string
  description?: string | null
}

export const workspacesApi = {
  async create(data: CreateWorkspaceRequest): Promise<WorkspaceSummary> {
    const res = await api.post<{ workspace: WorkspaceSummary }>("/workspaces", data)
    return res.data.workspace
  },

  async list(): Promise<WorkspaceSummary[]> {
    const res = await api.get<{ workspaces: WorkspaceSummary[] }>("/workspaces")
    return res.data.workspaces
  },

  async getOne(id: string): Promise<WorkspaceDetail> {
    const res = await api.get<{ workspace: WorkspaceDetail }>("/workspaces/one", { params: { id } })
    return res.data.workspace
  },

  async update(id: string, data: UpdateWorkspaceRequest): Promise<WorkspaceUpdateResult> {
    const res = await api.post<{ workspace: WorkspaceUpdateResult }>("/workspaces/update", data, {
      params: { id },
    })
    return res.data.workspace
  },

  async deleteWorkspace(id: string): Promise<void> {
    await api.post("/workspaces/delete", {}, { params: { id } })
  },

  async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const res = await api.get<{ members: WorkspaceMember[] }>("/workspaces/members", { params: { workspaceId } })
    return res.data.members
  },

  async updateMember(memberId: string, role: Role): Promise<WorkspaceMemberResponse> {
    const res = await api.post<{ member: WorkspaceMemberResponse }>("/workspaces/members/update", { role }, { params: { memberId } })
    return res.data.member
  },

  async removeMember(memberId: string): Promise<void> {
    await api.post("/workspaces/members/remove", {}, { params: { memberId } })
  },
}
