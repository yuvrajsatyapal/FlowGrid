import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { renderHook, act, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { makeFakeSocket, type FakeSocket } from "../test/fakeSocket"
import type { NotificationPage } from "../api/notifications"
import type { AppNotification } from "@flowgrid/types"

vi.mock("../lib/socket", () => ({ createBoardSocket: vi.fn() }))
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ accessToken: "tok" }) }))
vi.mock("../api/notifications", () => ({
  notificationsApi: { list: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() },
}))

import { createBoardSocket } from "../lib/socket"
import { notificationsApi } from "../api/notifications"
import { useNotifications } from "./useNotifications"

const n = (id: string, read = false): AppNotification =>
  ({ id, read, type: "GENERIC", createdAt: "2026-01-01T00:00:00Z" }) as unknown as AppNotification

const page = (notifications: AppNotification[], total: number, unreadCount: number): NotificationPage => ({
  notifications,
  total,
  unreadCount,
})

let socket: FakeSocket

function freshQc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}
function wrap(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  socket = makeFakeSocket()
  ;(createBoardSocket as ReturnType<typeof vi.fn>).mockReturnValue(socket)
})

describe("useNotifications (infinite, single source of truth)", () => {
  it("1. initial page load", async () => {
    ;(notificationsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue(page([n("a"), n("b")], 4, 2))
    const { result } = renderHook(() => useNotifications(), { wrapper: wrap(freshQc()) })
    await waitFor(() => expect(result.current.notifications).toHaveLength(2))
    expect(result.current.unreadCount).toBe(2)
    expect(result.current.total).toBe(4)
    expect(result.current.hasMore).toBe(true)
  })

  it("2 + 7. load more merges pages in order", async () => {
    ;(notificationsApi.list as ReturnType<typeof vi.fn>).mockImplementation((offset: number) =>
      Promise.resolve(offset === 0 ? page([n("a"), n("b")], 4, 2) : page([n("c"), n("d")], 4, 2)),
    )
    const { result } = renderHook(() => useNotifications(), { wrapper: wrap(freshQc()) })
    await waitFor(() => expect(result.current.notifications).toHaveLength(2))

    await act(async () => { await result.current.loadMore() })
    await waitFor(() => expect(result.current.notifications.map((x) => x.id)).toEqual(["a", "b", "c", "d"]))
    expect(result.current.hasMore).toBe(false)
  })

  it("3. realtime arrival is reflected", async () => {
    ;(notificationsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue(page([n("a")], 1, 0))
    const { result } = renderHook(() => useNotifications(), { wrapper: wrap(freshQc()) })
    await waitFor(() => expect(result.current.notifications).toHaveLength(1))

    act(() => socket.__trigger("notification:new", n("z")))
    await waitFor(() => expect(result.current.notifications[0].id).toBe("z"))
    expect(result.current.notifications).toHaveLength(2)
    expect(result.current.unreadCount).toBe(1)
  })

  it("4. duplicate realtime event does not double-insert or double-count", async () => {
    ;(notificationsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue(page([n("a")], 1, 1))
    const { result } = renderHook(() => useNotifications(), { wrapper: wrap(freshQc()) })
    await waitFor(() => expect(result.current.notifications).toHaveLength(1))

    act(() => socket.__trigger("notification:new", n("a"))) // already present
    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.unreadCount).toBe(1)
  })

  it("5. two consumers share one cache (sidebar + inbox)", async () => {
    ;(notificationsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue(page([n("a")], 1, 1))
    const qc = freshQc()
    const wrapper = wrap(qc)
    const a = renderHook(() => useNotifications(), { wrapper })
    const b = renderHook(() => useNotifications(), { wrapper })
    await waitFor(() => expect(a.result.current.notifications).toHaveLength(1))

    await act(async () => { await a.result.current.markRead("a") })
    // b reads the same cache → sees the mutation
    await waitFor(() => expect(b.result.current.notifications[0].read).toBe(true))
    expect(b.result.current.unreadCount).toBe(0)
  })

  it("6. mark read keeps unread count consistent (optimistic)", async () => {
    ;(notificationsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue(page([n("a"), n("b")], 2, 2))
    ;(notificationsApi.markRead as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    const { result } = renderHook(() => useNotifications(), { wrapper: wrap(freshQc()) })
    await waitFor(() => expect(result.current.notifications).toHaveLength(2))

    await act(async () => { await result.current.markRead("a") })
    await waitFor(() => expect(result.current.notifications.find((x) => x.id === "a")!.read).toBe(true))
    expect(result.current.unreadCount).toBe(1)
  })
})
