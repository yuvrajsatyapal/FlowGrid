import { api } from "../lib/axiosInstance"
import type { AuthUser } from "./auth"

export interface UserSearchResult {
  id: string
  name: string | null
  email: string
  avatarUrl: string | null
}

export const usersApi = {
  // Search for existing users who are NOT already members of the workspace.
  // Used by WorkspaceMembersPage to find people to invite.
  // Requires q >= 2 chars. Returns at most 10 results.
  async search(q: string, workspaceId: string): Promise<UserSearchResult[]> {
    const res = await api.get<{ users: UserSearchResult[] }>("/users/search", { params: { q, workspaceId } })
    return res.data.users
  },

  async updateName(name: string): Promise<AuthUser> {
    const res = await api.patch<{ user: AuthUser }>("/users/me", { name })
    return res.data.user
  },

  async uploadAvatar(file: File): Promise<AuthUser> {
    const formData = new FormData()
    formData.append("file", file)
    const res = await api.post<{ user: AuthUser }>("/users/avatar", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    return res.data.user
  },

  async removeAvatar(): Promise<AuthUser> {
    const res = await api.post<{ user: AuthUser }>("/users/avatar/remove", {})
    return res.data.user
  },
}
