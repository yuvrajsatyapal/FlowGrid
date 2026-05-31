import { api } from "../lib/axiosInstance"

export interface AuthUser {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
}

export interface RefreshResponse {
  accessToken: string
  user: AuthUser
}

export const authApi = {
  // Refresh access token using the httpOnly refresh cookie
  async refresh(): Promise<RefreshResponse> {
    const res = await api.post<RefreshResponse>("/auth/refresh")
    return res.data
  },

  async logout(): Promise<void> {
    await api.post("/auth/logout")
  },
}
