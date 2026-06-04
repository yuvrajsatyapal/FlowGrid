import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { notificationsApi } from "../api/notifications"
import { NOTIFICATIONS_KEY } from "../hooks/useNotifications"
import type { AppNotification, NotificationType } from "@flowgrid/types"

const PAGE_SIZE = 20

// ── Icons ──────────────────────────────────────────────────────────────────────

function TypeIcon({ type }: { type: NotificationType }) {
  if (type === "CARD_ASSIGNED") return (
    <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="4.5" r="2.25" stroke="oklch(52% 0.22 260)" strokeWidth="1.25" />
      <path d="M2 12c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="oklch(52% 0.22 260)" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
  if (type === "COMMENT_ADDED") return (
    <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 2h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5l-3 2V3a1 1 0 0 1 1-1z" stroke="oklch(55% 0.18 155)" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  )
  if (type === "WORKSPACE_INVITE") return (
    <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1" y="3" width="12" height="8" rx="1" stroke="oklch(58% 0.2 30)" strokeWidth="1.25" />
      <path d="M1 4l6 4 6-4" stroke="oklch(58% 0.2 30)" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
  if (type === "CARD_DUE_SOON") return (
    <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" stroke="oklch(0.75 0.15 80)" strokeWidth="1.25" />
      <path d="M7 4v3l2 1.5" stroke="oklch(0.75 0.15 80)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
  // INVITE_ACCEPTED / CARD_UPDATED / SYSTEM
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 7h10M9 4l3 3-3 3" stroke="oklch(52% 0.22 260)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const EmptyIcon = (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

// Build an in-app deep link (or external invite URL) for a notification.
function notificationLink(n: AppNotification): string | null {
  const data = (n.data ?? {}) as Record<string, string | undefined>
  if (n.type === "WORKSPACE_INVITE") return data.inviteUrl ?? null
  if (data.boardId && data.workspaceId) {
    return `/${data.workspaceId}/${data.boardId}${data.cardId ? `?card=${data.cardId}` : ""}`
  }
  if (data.workspaceId) return `/${data.workspaceId}`
  return null
}

type FilterType = "all" | "unread"

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [total, setTotal] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")
  const [filter, setFilter] = useState<FilterType>("all")

  // Keep the sidebar badge (which reads the shared query) in sync after mutations.
  const syncSidebar = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY })
  }, [queryClient])

  const fetchPage = useCallback(async (offset: number) => {
    const page = await notificationsApi.list(offset, PAGE_SIZE)
    setTotal(page.total)
    setUnreadCount(page.unreadCount)
    setNotifications((prev) => (offset === 0 ? page.notifications : [...prev, ...page.notifications]))
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError("")
    notificationsApi
      .list(0, PAGE_SIZE)
      .then((page) => {
        if (!active) return
        setNotifications(page.notifications)
        setTotal(page.total)
        setUnreadCount(page.unreadCount)
      })
      .catch((err: unknown) => { if (active) setError((err as Error).message || "Failed to load notifications") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const handleLoadMore = async () => {
    setLoadingMore(true)
    try {
      await fetchPage(notifications.length)
    } catch {
      // best-effort
    } finally {
      setLoadingMore(false)
    }
  }

  const handleMarkRead = async (id: string) => {
    // Optimistic
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    setUnreadCount((c) => Math.max(0, c - 1))
    try {
      await notificationsApi.markRead(id)
      syncSidebar()
    } catch {
      // Revert on failure
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: false } : n)))
      setUnreadCount((c) => c + 1)
    }
  }

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return
    const prev = notifications
    setNotifications((list) => list.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
    try {
      await notificationsApi.markAllRead()
      syncSidebar()
    } catch {
      setNotifications(prev)
    }
  }

  const handleRowClick = (n: AppNotification) => {
    if (!n.read) void handleMarkRead(n.id)
    const link = notificationLink(n)
    if (!link) return
    if (link.startsWith("http")) {
      window.location.href = link
    } else {
      navigate(link)
    }
  }

  const visible = filter === "unread" ? notifications.filter((n) => !n.read) : notifications
  const hasMore = notifications.length < total

  return (
    <div style={{ padding: "32px 36px", maxWidth: "760px", color: "oklch(var(--color-ink))", fontFamily: "var(--font-body)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "24px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: 700, letterSpacing: "var(--display-tracking)", fontFamily: "var(--font-display)" }}>
            Inbox
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))" }}>
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}` : "You're all caught up"}
          </p>
        </div>
        <button
          onClick={handleMarkAllRead}
          disabled={unreadCount === 0}
          style={{
            padding: "8px 14px",
            borderRadius: "var(--radius-button)",
            border: "1px solid oklch(var(--color-border))",
            background: "oklch(var(--color-paper-2))",
            color: unreadCount === 0 ? "oklch(var(--color-ink-3))" : "oklch(var(--color-ink-2))",
            fontSize: "var(--text-sm)",
            fontWeight: 500,
            cursor: unreadCount === 0 ? "default" : "pointer",
            fontFamily: "var(--font-body)",
            opacity: unreadCount === 0 ? 0.6 : 1,
          }}
        >
          Mark all read
        </button>
      </div>

      {/* Filter tabs */}
      <div
        style={{
          display: "inline-flex",
          borderRadius: "var(--radius-input)",
          border: "1px solid oklch(var(--color-border))",
          background: "oklch(var(--color-paper-2))",
          overflow: "hidden",
          marginBottom: "16px",
        }}
      >
        {(["all", "unread"] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "7px 16px",
              border: "none",
              background: filter === f ? "oklch(var(--color-paper-3))" : "transparent",
              color: filter === f ? "oklch(var(--color-accent))" : "oklch(var(--color-ink-3))",
              fontSize: "var(--text-sm)",
              fontWeight: filter === f ? 600 : 400,
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              textTransform: "capitalize",
            }}
          >
            {f}
            {f === "unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}
          </button>
        ))}
      </div>

      {/* List */}
      <div
        style={{
          border: "1px solid oklch(var(--color-border))",
          borderRadius: "var(--radius-card)",
          background: "oklch(var(--color-paper-2))",
          overflow: "hidden",
        }}
      >
        {loading ? (
          <div style={{ padding: "32px 20px", textAlign: "center", fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-3))" }}>
            Loading…
          </div>
        ) : error ? (
          <div style={{ padding: "32px 20px", textAlign: "center", fontSize: "var(--text-sm)", color: "oklch(var(--color-error))" }}>
            {error}
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: "56px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", color: "oklch(var(--color-ink-3))" }}>
            <span style={{ opacity: 0.5 }}>{EmptyIcon}</span>
            <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600, color: "oklch(var(--color-ink-2))", fontFamily: "var(--font-display)" }}>
              {filter === "unread" ? "No unread notifications" : "No notifications yet"}
            </p>
            <p style={{ margin: 0, fontSize: "var(--text-xs)", textAlign: "center", maxWidth: "300px", lineHeight: 1.5 }}>
              {filter === "unread"
                ? "You've read everything. New notifications will appear here."
                : "Assignments, comments, invites, and reminders will show up here."}
            </p>
          </div>
        ) : (
          <div>
            {visible.map((n, i) => {
              const link = notificationLink(n)
              const clickable = !!link
              return (
                <div
                  key={n.id}
                  onClick={clickable ? () => handleRowClick(n) : undefined}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onKeyDown={clickable ? (e) => { if (e.key === "Enter") handleRowClick(n) } : undefined}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    padding: "14px 18px",
                    borderBottom: i === visible.length - 1 ? "none" : "1px solid oklch(var(--color-border))",
                    background: n.read ? "transparent" : "oklch(var(--color-accent-muted) / 0.4)",
                    cursor: clickable ? "pointer" : "default",
                    transition: "background var(--dur-fast)",
                  }}
                  onMouseEnter={(e) => { if (clickable) (e.currentTarget as HTMLDivElement).style.background = "oklch(var(--color-paper-3))" }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = n.read ? "transparent" : "oklch(var(--color-accent-muted) / 0.4)" }}
                >
                  {/* Unread dot */}
                  <div style={{ flexShrink: 0, width: "7px", height: "7px", borderRadius: "50%", background: n.read ? "transparent" : "oklch(var(--color-accent))", marginTop: "6px" }} />

                  {/* Type icon */}
                  <div style={{ flexShrink: 0, marginTop: "1px" }}>
                    <TypeIcon type={n.type as NotificationType} />
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: n.read ? 400 : 600, color: "oklch(var(--color-ink))", lineHeight: 1.4 }}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p style={{ margin: "3px 0 0", fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-2))", lineHeight: 1.45 }}>
                        {n.body}
                      </p>
                    )}
                    <p style={{ margin: "5px 0 0", fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                      {relativeTime(n.createdAt)}
                    </p>
                  </div>

                  {/* Mark-read */}
                  {!n.read && (
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleMarkRead(n.id) }}
                      title="Mark as read"
                      aria-label="Mark as read"
                      style={{
                        flexShrink: 0,
                        padding: "4px 8px",
                        border: "1px solid oklch(var(--color-border))",
                        borderRadius: "var(--radius-button)",
                        background: "transparent",
                        color: "oklch(var(--color-ink-3))",
                        cursor: "pointer",
                        fontSize: "var(--text-xs)",
                      }}
                    >
                      Mark read
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Load more (only meaningful in "all" view; unread filter is client-side) */}
      {!loading && !error && filter === "all" && hasMore && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: "16px" }}>
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            style={{
              padding: "8px 18px",
              borderRadius: "var(--radius-button)",
              border: "1px solid oklch(var(--color-border))",
              background: "oklch(var(--color-paper-2))",
              color: "oklch(var(--color-ink-2))",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              cursor: loadingMore ? "default" : "pointer",
              fontFamily: "var(--font-body)",
              opacity: loadingMore ? 0.6 : 1,
            }}
          >
            {loadingMore ? "Loading…" : `Load more (${total - notifications.length})`}
          </button>
        </div>
      )}
    </div>
  )
}
