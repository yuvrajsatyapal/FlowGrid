import { api } from "../lib/axiosInstance"
import type { AppNotification } from "@flowgrid/types"

export interface NotificationPage {
  notifications: AppNotification[]
  total: number
  unreadCount: number
}

export const notificationsApi = {
  async list(offset = 0, limit = 20): Promise<NotificationPage> {
    const res = await api.get<NotificationPage>("/notifications", { params: { offset, limit } })
    return res.data
  },

  async markRead(id: string): Promise<void> {
    await api.post("/notifications/read", {}, { params: { id } })
  },

  async markAllRead(): Promise<void> {
    await api.post("/notifications/read-all", {})
  },
}
