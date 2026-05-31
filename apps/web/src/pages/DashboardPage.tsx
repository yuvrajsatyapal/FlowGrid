import { useAuth } from "../contexts/AuthContext"

export default function DashboardPage() {
  const { user, logout } = useAuth()

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        background: "oklch(var(--color-paper))",
        color: "oklch(var(--color-ink))",
        fontFamily: "var(--font-display)",
      }}
    >
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <rect width="40" height="40" rx="8" fill="oklch(52% 0.22 260)" />
        <rect x="8" y="8" width="10" height="24" rx="2" fill="white" opacity="0.9" />
        <rect x="22" y="8" width="10" height="16" rx="2" fill="white" opacity="0.6" />
      </svg>
      <span style={{ fontSize: "1.25rem", fontWeight: 600, letterSpacing: "-0.02em" }}>
        Welcome, {user?.name ?? user?.email}
      </span>
      <span style={{ fontSize: "0.875rem", color: "oklch(var(--color-ink-2))" }}>
        Dashboard — boards and workspaces coming in Feature #5–#7
      </span>
      <button
        onClick={() => logout()}
        style={{
          marginTop: "8px",
          padding: "8px 16px",
          borderRadius: "6px",
          border: "1px solid oklch(var(--color-border))",
          background: "transparent",
          color: "oklch(var(--color-ink))",
          fontSize: "0.875rem",
          cursor: "pointer",
        }}
      >
        Sign out
      </button>
    </div>
  )
}
