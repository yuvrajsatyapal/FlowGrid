import { api } from "../lib/axiosInstance"
import type { Role, WorkspaceInvite } from "@flowgrid/types"

interface AcceptInviteResult {
  workspaceId: string
  workspaceName: string
  role: Role
}

export const invitesApi = {
  async list(workspaceId: string): Promise<WorkspaceInvite[]> {
    const res = await api.get<{ invites: WorkspaceInvite[] }>("/invites", { params: { workspaceId } })
    return res.data.invites
  },

  async create(workspaceId: string, email: string, role: Role): Promise<{ invite: WorkspaceInvite; inviteUrl: string }> {
    const res = await api.post<{ invite: WorkspaceInvite; inviteUrl: string }>("/invites", { workspaceId, email, role })
    return res.data
  },

  async accept(token: string): Promise<AcceptInviteResult> {
    const res = await api.post<AcceptInviteResult>("/invites/accept", {}, { params: { token } })
    return res.data
  },

  async resend(inviteId: string): Promise<{ invite: WorkspaceInvite; inviteUrl: string }> {
    const res = await api.post<{ invite: WorkspaceInvite; inviteUrl: string }>("/invites/resend", {}, { params: { id: inviteId } })
    return res.data
  },

  async revoke(inviteId: string): Promise<void> {
    await api.post("/invites/revoke", {}, { params: { id: inviteId } })
  },
}
