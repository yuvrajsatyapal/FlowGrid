import { useCallback, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "../contexts/AuthContext"
import { notificationsApi, type NotificationPage } from "../api/notifications"
import { createBoardSocket } from "../lib/socket"
import type { AppNotification } from "@flowgrid/types"

export const NOTIFICATIONS_KEY = ["notifications"] as const

export function useNotifications() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery<NotificationPage>({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () => notificationsApi.list(0, 20),
    enabled: !!accessToken,
    staleTime: 30_000,
  })

  // Dedicated socket for notification:new — server joins us to userId room on connect
  useEffect(() => {
    if (!accessToken) return

    const socket = createBoardSocket(accessToken)

    socket.on("notification:new", (notification: AppNotification) => {
      queryClient.setQueryData<NotificationPage>(NOTIFICATIONS_KEY, (old) => {
        if (!old) return old
        // Dedup: skip if already in list (e.g. tab reconnect)
        if (old.notifications.some((n) => n.id === notification.id)) return old
        return {
          ...old,
          notifications: [notification, ...old.notifications],
          total: old.total + 1,
          unreadCount: old.unreadCount + 1,
        }
      })
    })

    return () => {
      socket.off("notification:new")
      socket.disconnect()
    }
  }, [accessToken, queryClient])

  const markRead = useCallback(
    async (id: string) => {
      await notificationsApi.markRead(id)
      queryClient.setQueryData<NotificationPage>(NOTIFICATIONS_KEY, (old) => {
        if (!old) return old
        return {
          ...old,
          notifications: old.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
          unreadCount: Math.max(0, old.unreadCount - 1),
        }
      })
    },
    [queryClient],
  )

  const markAllRead = useCallback(async () => {
    await notificationsApi.markAllRead()
    queryClient.setQueryData<NotificationPage>(NOTIFICATIONS_KEY, (old) => {
      if (!old) return old
      return {
        ...old,
        notifications: old.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }
    })
  }, [queryClient])

  return {
    notifications: query.data?.notifications ?? [],
    unreadCount: query.data?.unreadCount ?? 0,
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    markRead,
    markAllRead,
  }
}
