import { api } from "../lib/axiosInstance"
import type { AuthUser } from "./auth"

interface UpdateMeRequest {
  name?: string
  avatarUrl?: string
}

interface UserResponse {
  user: AuthUser
}

export const usersApi = {
  async updateMe(data: UpdateMeRequest): Promise<AuthUser> {
    const res = await api.patch<UserResponse>("/users/me", data)
    return res.data.user
  },

  async getMe(): Promise<AuthUser> {
    const res = await api.get<UserResponse>("/users/me")
    return res.data.user
  },
}
