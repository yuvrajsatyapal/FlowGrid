import { api } from "../lib/axiosInstance"

export interface WorkspaceSummary {
  id: string
  name: string
  slug: string
  organizationId: string
  role?: string
}

export interface WorkspaceDetail extends WorkspaceSummary {
  description: string | null
  organization: { id: string; name: string; slug: string; ownerId: string }
  memberCount: number
  boardCount: number
  role: string
  createdAt: string
}

interface CreateWorkspaceRequest {
  name: string
}

interface UpdateWorkspaceRequest {
  name?: string
  description?: string
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

  async update(id: string, data: UpdateWorkspaceRequest): Promise<WorkspaceSummary> {
    const res = await api.post<{ workspace: WorkspaceSummary }>("/workspaces/update", data, { params: { id } })
    return res.data.workspace
  },

  async deleteWorkspace(id: string): Promise<void> {
    await api.post("/workspaces/delete", {}, { params: { id } })
  },
}
