import { api } from "../lib/axiosInstance"
import type { Role } from "@flowgrid/types"

export interface WorkspaceInviteRecord {
  id: string
  role: Role
  status: string
  expiresAt: string
  createdAt: string
  invitee: {
    id: string
    name: string | null
    email: string
    avatarUrl: string | null
  }
}

interface AcceptInviteResult {
  workspaceId: string
  workspaceName: string
  role: Role
}

export const invitesApi = {
  async list(workspaceId: string): Promise<WorkspaceInviteRecord[]> {
    const res = await api.get<{ invites: WorkspaceInviteRecord[] }>("/invites", { params: { workspaceId } })
    return res.data.invites
  },

  // Invitee must be an existing user (identified by userId, not email).
  async create(workspaceId: string, userId: string, role: Role): Promise<{ invite: WorkspaceInviteRecord }> {
    const res = await api.post<{ invite: WorkspaceInviteRecord }>("/invites", { workspaceId, userId, role })
    return res.data
  },

  // Accept by invite ID (authenticated — invitee only).
  async accept(inviteId: string): Promise<AcceptInviteResult> {
    const res = await api.post<AcceptInviteResult>("/invites/accept", {}, { params: { id: inviteId } })
    return res.data
  },

  // Decline by invite ID (authenticated — invitee only).
  async decline(inviteId: string): Promise<void> {
    await api.post("/invites/decline", {}, { params: { id: inviteId } })
  },

  // Re-sends the in-app notification to the invitee and resets expiry.
  async resend(inviteId: string): Promise<{ invite: WorkspaceInviteRecord }> {
    const res = await api.post<{ invite: WorkspaceInviteRecord }>("/invites/resend", {}, { params: { id: inviteId } })
    return res.data
  },

  async revoke(inviteId: string): Promise<void> {
    await api.post("/invites/revoke", {}, { params: { id: inviteId } })
  },
}
