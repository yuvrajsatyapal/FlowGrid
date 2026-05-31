import { useEffect } from "react"
import { Outlet, NavLink, useNavigate, useParams } from "react-router-dom"
import { useAuth } from "../../contexts/AuthContext"
import { useWorkspaceStore } from "../../stores/workspaceStore"
import { workspacesApi } from "../../api/workspaces"
import WorkspaceSwitcher from "./WorkspaceSwitcher"

// ── Nav icons ──────────────────────────────────────────────────────────────────

const BoardsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="1" y="1" width="6" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
    <rect x="9" y="1" width="6" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
  </svg>
)

const SettingsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.25" />
    <path
      d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
    />
  </svg>
)

const MembersIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.25" />
    <path d="M1 13c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    <circle cx="12" cy="5" r="1.75" stroke="currentColor" strokeWidth="1.25" />
    <path d="M14 12c0-1.38-.9-2.56-2.14-2.93" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
  </svg>
)

const SignOutIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
    <path d="M6 2H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    <path d="M10 10l3-3-3-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13 7.5H6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
  </svg>
)

// ── Nav item ───────────────────────────────────────────────────────────────────

function NavItem({
  to,
  icon,
  label,
}: {
  to: string
  icon: React.ReactNode
  label: string
}) {
  const navLinkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "9px",
    padding: "7px 10px",
    borderRadius: "6px",
    border: "none",
    background: isActive ? "oklch(var(--color-accent-muted))" : "transparent",
    color: isActive ? "oklch(var(--color-accent))" : "oklch(var(--color-ink-2))",
    fontSize: "var(--text-sm)",
    fontWeight: isActive ? 500 : 400,
    textDecoration: "none",
    transition: "background var(--dur-fast) var(--ease-out), color var(--dur-fast)",
    cursor: "pointer",
  })

  return (
    <NavLink
      to={to}
      style={navLinkStyle}
      onMouseEnter={(e) => {
        const el = e.currentTarget
        if (!el.style.background.includes("accent-muted")) {
          el.style.background = "oklch(var(--color-paper-3))"
        }
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget
        if (!el.style.background.includes("accent-muted")) {
          el.style.background = "transparent"
        }
      }}
    >
      {icon}
      {label}
    </NavLink>
  )
}

// ── AppLayout ──────────────────────────────────────────────────────────────────

export default function AppLayout() {
  const { user, logout } = useAuth()
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { workspaces, activeWorkspace, setWorkspaces, setActiveWorkspace, setLoading } =
    useWorkspaceStore()
  const navigate = useNavigate()

  // Load workspaces on first mount
  useEffect(() => {
    if (workspaces.length > 0) return
    setLoading(true)
    workspacesApi
      .list()
      .then((list) => {
        setWorkspaces(list)
        if (!activeWorkspace && list.length > 0) {
          const target = workspaceId ? (list.find((w) => w.id === workspaceId) ?? list[0]) : list[0]
          setActiveWorkspace(target)
        }
      })
      .catch(() => {
        // Silently fail — workspace list is best-effort; user can reload
      })
      .finally(() => setLoading(false))
    // Intentionally runs once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync activeWorkspace when URL workspaceId changes
  useEffect(() => {
    if (!workspaceId || workspaces.length === 0) return
    const match = workspaces.find((w) => w.id === workspaceId)
    if (match && match.id !== activeWorkspace?.id) {
      setActiveWorkspace(match)
    }
  }, [workspaceId, workspaces, activeWorkspace, setActiveWorkspace])

  const handleLogout = async () => {
    await logout()
    navigate("/login", { replace: true })
  }

  const userInitials = (user?.name ?? user?.email ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "oklch(var(--color-paper))",
        fontFamily: "var(--font-body)",
        overflow: "hidden",
      }}
    >
      {/* ── Sidebar ── */}
      <aside
        style={{
          width: "220px",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          background: "oklch(var(--color-paper-2))",
          borderRight: "1px solid oklch(var(--color-border))",
          padding: "12px 10px",
          gap: "4px",
          overflowY: "auto",
        }}
      >
        {/* Logo */}
        <div style={{ padding: "4px 8px 8px", display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="26" height="26" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <rect width="40" height="40" rx="8" fill="oklch(52% 0.22 260)" />
            <rect x="8" y="8" width="10" height="24" rx="2" fill="white" opacity="0.9" />
            <rect x="22" y="8" width="10" height="16" rx="2" fill="white" opacity="0.6" />
          </svg>
          <span
            style={{
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              letterSpacing: "-0.02em",
              fontFamily: "var(--font-display)",
              color: "oklch(var(--color-ink))",
            }}
          >
            FlowGrid
          </span>
        </div>

        {/* Workspace switcher */}
        <WorkspaceSwitcher />

        {/* Divider */}
        <div
          style={{ height: "1px", background: "oklch(var(--color-border))", margin: "6px 0" }}
        />

        {/* Nav items */}
        {activeWorkspace && (
          <nav style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <NavItem to={`/${activeWorkspace.id}`} icon={<BoardsIcon />} label="Boards" />
            <NavItem
              to={`/${activeWorkspace.id}/settings`}
              icon={<SettingsIcon />}
              label="Settings"
            />
            <NavItem
              to={`/${activeWorkspace.id}/members`}
              icon={<MembersIcon />}
              label="Members"
            />
          </nav>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Divider */}
        <div
          style={{ height: "1px", background: "oklch(var(--color-border))", margin: "6px 0" }}
        />

        {/* User section */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 8px",
            borderRadius: "6px",
          }}
        >
          {/* Avatar */}
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              background: user?.avatarUrl ? "transparent" : "oklch(52% 0.22 260)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.6875rem",
              fontWeight: 600,
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              userInitials
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: "var(--text-xs)",
                fontWeight: 500,
                color: "oklch(var(--color-ink))",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user?.name ?? user?.email}
            </p>
            {user?.name && (
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--text-xs)",
                  color: "oklch(var(--color-ink-3))",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user.email}
              </p>
            )}
          </div>

          <button
            onClick={handleLogout}
            title="Sign out"
            style={{
              padding: "5px",
              borderRadius: "5px",
              border: "none",
              background: "transparent",
              color: "oklch(var(--color-ink-3))",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              transition: "background var(--dur-fast), color var(--dur-fast)",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "oklch(var(--color-paper-3))"
              e.currentTarget.style.color = "oklch(var(--color-ink))"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent"
              e.currentTarget.style.color = "oklch(var(--color-ink-3))"
            }}
          >
            <SignOutIcon />
          </button>
        </div>
      </aside>

      {/* ── Main content area ── */}
      <main style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        <Outlet />
      </main>
    </div>
  )
}
