import { useCallback, useEffect } from "react"
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query"
import { useAuth } from "../contexts/AuthContext"
import { notificationsApi, type NotificationPage } from "../api/notifications"
import { createBoardSocket } from "../lib/socket"
import type { AppNotification } from "@flowgrid/types"

export const NOTIFICATIONS_KEY = ["notifications"] as const
const PAGE_SIZE = 20

type NotificationsCache = InfiniteData<NotificationPage>

const loadedCount = (pages: NotificationPage[]): number =>
  pages.reduce((sum, p) => sum + p.notifications.length, 0)

/** Single source of truth for notifications (sidebar badge + Inbox page).
 *  Infinite query over NOTIFICATIONS_KEY: page 0 feeds the sidebar's unread
 *  count; the Inbox page reads the flattened pages and paginates via loadMore.
 *  The socket prepends to page 0 and totals are derived from page 0. */
export function useNotifications() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()

  const query = useInfiniteQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: ({ pageParam }) => notificationsApi.list(pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (_lastPage, allPages) => {
      const loaded = loadedCount(allPages)
      const total = allPages[0]?.total ?? 0
      return loaded < total ? loaded : undefined
    },
    enabled: !!accessToken,
    staleTime: 30_000,
  })

  // Dedicated socket for notification:new — server joins us to the userId room on connect.
  useEffect(() => {
    if (!accessToken) return

    const socket = createBoardSocket(accessToken)

    socket.on("notification:new", (notification: AppNotification) => {
      queryClient.setQueryData<NotificationsCache>(NOTIFICATIONS_KEY, (old) => {
        if (!old || old.pages.length === 0) return old
        // Dedup across all loaded pages (e.g. tab reconnect)
        if (old.pages.some((p) => p.notifications.some((n) => n.id === notification.id))) return old
        const [first, ...rest] = old.pages
        const updatedFirst: NotificationPage = {
          ...first,
          notifications: [notification, ...first.notifications],
          total: first.total + 1,
          unreadCount: first.unreadCount + 1,
        }
        return { ...old, pages: [updatedFirst, ...rest] }
      })
    })

    return () => {
      socket.off("notification:new")
      socket.disconnect()
    }
  }, [accessToken, queryClient])

  // Optimistic + revert (preserves the Inbox page's prior mark-read UX).
  const markRead = useCallback(
    async (id: string) => {
      const prev = queryClient.getQueryData<NotificationsCache>(NOTIFICATIONS_KEY)
      queryClient.setQueryData<NotificationsCache>(NOTIFICATIONS_KEY, (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((p, i) => ({
                ...p,
                notifications: p.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
                unreadCount: i === 0 ? Math.max(0, p.unreadCount - 1) : p.unreadCount,
              })),
            }
          : old,
      )
      try {
        await notificationsApi.markRead(id)
      } catch {
        if (prev) queryClient.setQueryData(NOTIFICATIONS_KEY, prev)
      }
    },
    [queryClient],
  )

  const markAllRead = useCallback(async () => {
    const prev = queryClient.getQueryData<NotificationsCache>(NOTIFICATIONS_KEY)
    queryClient.setQueryData<NotificationsCache>(NOTIFICATIONS_KEY, (old) =>
      old
        ? {
            ...old,
            pages: old.pages.map((p) => ({
              ...p,
              notifications: p.notifications.map((n) => ({ ...n, read: true })),
              unreadCount: 0,
            })),
          }
        : old,
    )
    try {
      await notificationsApi.markAllRead()
    } catch {
      if (prev) queryClient.setQueryData(NOTIFICATIONS_KEY, prev)
    }
  }, [queryClient])

  const pages = query.data?.pages ?? []
  return {
    notifications: pages.flatMap((p) => p.notifications),
    unreadCount: pages[0]?.unreadCount ?? 0,
    total: pages[0]?.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    hasMore: query.hasNextPage,
    isFetchingMore: query.isFetchingNextPage,
    loadMore: query.fetchNextPage,
    refetch: query.refetch,
    markRead,
    markAllRead,
  }
}
