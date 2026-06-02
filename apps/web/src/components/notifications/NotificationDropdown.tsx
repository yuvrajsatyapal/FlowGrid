import { useEffect, useRef } from "react"
import type { AppNotification, NotificationType } from "@flowgrid/types"

interface Props {
  notifications: AppNotification[]
  unreadCount: number
  onClose: () => void
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onNavigate: (url: string) => void
}

function typeIcon(type: NotificationType) {
  if (type === "CARD_ASSIGNED") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="4.5" r="2.25" stroke="oklch(52% 0.22 260)" strokeWidth="1.25" />
        <path d="M2 12c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="oklch(52% 0.22 260)" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    )
  }
  if (type === "COMMENT_ADDED") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M2 2h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5l-3 2V3a1 1 0 0 1 1-1z" stroke="oklch(55% 0.18 155)" strokeWidth="1.25" strokeLinejoin="round" />
      </svg>
    )
  }
  if (type === "WORKSPACE_INVITE") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <rect x="1" y="3" width="12" height="8" rx="1" stroke="oklch(58% 0.2 30)" strokeWidth="1.25" />
        <path d="M1 4l6 4 6-4" stroke="oklch(58% 0.2 30)" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    )
  }
  // INVITE_ACCEPTED
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 7h10M9 4l3 3-3 3" stroke="oklch(52% 0.22 260)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function NotificationDropdown({ notifications, unreadCount, onClose, onMarkRead, onMarkAllRead, onNavigate }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [onClose])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Notifications"
      style={{
        position: "absolute",
        bottom: "calc(100% + 8px)",
        left: 0,
        width: "360px",
        background: "oklch(var(--color-paper))",
        border: "1px solid oklch(var(--color-border))",
        borderRadius: "10px",
        boxShadow: "0 8px 24px oklch(0% 0 0 / 0.12)",
        zIndex: 100,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px 10px",
          borderBottom: "1px solid oklch(var(--color-border))",
        }}
      >
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "oklch(var(--color-ink))" }}>
          Notifications
        </span>
        <button
          onClick={onMarkAllRead}
          disabled={unreadCount === 0}
          style={{
            fontSize: "var(--text-xs)",
            color: unreadCount === 0 ? "oklch(var(--color-ink-3))" : "oklch(var(--color-accent))",
            background: "none",
            border: "none",
            cursor: unreadCount === 0 ? "default" : "pointer",
            padding: 0,
          }}
        >
          Mark all read
        </button>
      </div>

      {/* List */}
      <div style={{ maxHeight: "360px", overflowY: "auto" }}>
        {notifications.length === 0 ? (
          <div
            style={{
              padding: "32px 16px",
              textAlign: "center",
              color: "oklch(var(--color-ink-3))",
              fontSize: "var(--text-sm)",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ margin: "0 auto 8px", display: "block", opacity: 0.5 }}>
              <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            You're all caught up
          </div>
        ) : (
          notifications.map((n) => {
            const inviteUrl = n.type === "WORKSPACE_INVITE" ? (n.data?.inviteUrl as string | undefined) : undefined
            return (
              <div
                key={n.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  width: "100%",
                  padding: "10px 14px",
                  background: n.read ? "transparent" : "oklch(var(--color-accent-muted) / 0.35)",
                  borderBottom: "1px solid oklch(var(--color-border))",
                }}
              >
                {/* Unread dot */}
                <div style={{ flexShrink: 0, width: "6px", height: "6px", borderRadius: "50%", background: n.read ? "transparent" : "oklch(var(--color-accent))", marginTop: "5px" }} />

                {/* Type icon */}
                <div style={{ flexShrink: 0, marginTop: "1px" }}>{typeIcon(n.type as NotificationType)}</div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "var(--text-xs)",
                      fontWeight: n.read ? 400 : 500,
                      color: "oklch(var(--color-ink))",
                      lineHeight: 1.4,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {n.title}
                  </p>
                  {n.body && (
                    <p
                      style={{
                        margin: "2px 0 0",
                        fontSize: "var(--text-xs)",
                        color: "oklch(var(--color-ink-3))",
                        lineHeight: 1.4,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 1,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {n.body}
                    </p>
                  )}
                  <p style={{ margin: "3px 0 0", fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                    {relativeTime(n.createdAt)}
                  </p>
                  {inviteUrl && (
                    <button
                      onClick={() => {
                        if (!n.read) onMarkRead(n.id)
                        onNavigate(inviteUrl)
                        onClose()
                      }}
                      style={{
                        marginTop: "6px",
                        padding: "4px 10px",
                        borderRadius: "5px",
                        border: "none",
                        background: "oklch(var(--color-accent))",
                        color: "#fff",
                        fontSize: "var(--text-xs)",
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      Accept invite
                    </button>
                  )}
                </div>

                {/* Mark-read on click for non-invite notifications */}
                {!inviteUrl && !n.read && (
                  <button
                    onClick={() => onMarkRead(n.id)}
                    title="Mark as read"
                    style={{
                      flexShrink: 0,
                      padding: "2px 4px",
                      border: "none",
                      background: "transparent",
                      color: "oklch(var(--color-ink-3))",
                      cursor: "pointer",
                      fontSize: "var(--text-xs)",
                    }}
                  >
                    ✓
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
