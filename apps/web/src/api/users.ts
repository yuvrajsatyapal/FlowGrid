import { api } from "../lib/axiosInstance"
import type { AuthUser } from "./auth"

export const usersApi = {
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
