import { api } from "../lib/axiosInstance"

export interface WorkspaceSummary {
  id: string
  name: string
  slug: string
  organizationId: string
  role?: string
}

interface CreateWorkspaceRequest {
  name: string
}

interface CreateWorkspaceResponse {
  workspace: WorkspaceSummary
}

interface ListWorkspacesResponse {
  workspaces: WorkspaceSummary[]
}

export const workspacesApi = {
  async create(data: CreateWorkspaceRequest): Promise<WorkspaceSummary> {
    const res = await api.post<CreateWorkspaceResponse>("/workspaces", data)
    return res.data.workspace
  },

  async list(): Promise<WorkspaceSummary[]> {
    const res = await api.get<ListWorkspacesResponse>("/workspaces")
    return res.data.workspaces
  },
}
