import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useNotifications } from "../../hooks/useNotifications"
import { NotificationDropdown } from "./NotificationDropdown"

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
        title="Notifications"
        style={{
          position: "relative",
          padding: "6px",
          borderRadius: "6px",
          border: "none",
          background: open ? "oklch(var(--color-paper-3))" : "transparent",
          color: "oklch(var(--color-ink-2))",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background var(--dur-fast), color var(--dur-fast)",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "oklch(var(--color-paper-3))" }}
        onMouseLeave={(e) => { if (!open) (e.currentTarget as HTMLButtonElement).style.background = "transparent" }}
      >
        {/* Bell icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5v2.5L2 10h12l-1.5-1.5V6A4.5 4.5 0 0 0 8 1.5z"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <path d="M6.5 10.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        </svg>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: "2px",
              right: "2px",
              minWidth: "14px",
              height: "14px",
              borderRadius: "7px",
              background: "oklch(var(--color-error))",
              color: "#fff",
              fontSize: "0.625rem",
              fontWeight: 700,
              lineHeight: "14px",
              textAlign: "center",
              padding: "0 3px",
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <NotificationDropdown
          notifications={notifications}
          unreadCount={unreadCount}
          onClose={() => setOpen(false)}
          onMarkRead={markRead}
          onMarkAllRead={async () => { await markAllRead(); setOpen(false) }}
          onNavigate={(url) => { navigate(url); setOpen(false) }}
        />
      )}
    </div>
  )
}
