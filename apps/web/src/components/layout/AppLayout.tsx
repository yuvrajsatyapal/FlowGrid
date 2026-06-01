import { useCallback, useEffect, useRef, useState } from "react"
import { Outlet, NavLink, useNavigate, useParams } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import { useAuth } from "../../contexts/AuthContext"
import { useTheme } from "../../contexts/ThemeContext"
import { useWorkspaceStore } from "../../stores/workspaceStore"
import { workspacesApi } from "../../api/workspaces"
import WorkspaceSwitcher from "./WorkspaceSwitcher"
import { NotificationBell } from "../notifications/NotificationBell"
import { SearchModal } from "../search/SearchModal"

// ── Responsive hook ────────────────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  )
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener("change", handler)
    setIsMobile(mq.matches)
    return () => mq.removeEventListener("change", handler)
  }, [])
  return isMobile
}

// ── Icons ──────────────────────────────────────────────────────────────────────

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

const AnalyticsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="1" y="9" width="3" height="6" rx="1" stroke="currentColor" strokeWidth="1.25" />
    <rect x="6" y="5" width="3" height="10" rx="1" stroke="currentColor" strokeWidth="1.25" />
    <rect x="11" y="1" width="3" height="14" rx="1" stroke="currentColor" strokeWidth="1.25" />
  </svg>
)

const SignOutIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
    <path d="M6 2H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    <path d="M10 10l3-3-3-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13 7.5H6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
  </svg>
)

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.25" />
    <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
  </svg>
)

const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.25" />
    <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
  </svg>
)

const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M13.5 10A6 6 0 0 1 6 2.5a6 6 0 1 0 7.5 7.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const HamburgerIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

// ── Nav item ───────────────────────────────────────────────────────────────────

function NavItem({
  to,
  icon,
  label,
  onClick,
}: {
  to: string
  icon: React.ReactNode
  label: string
  onClick?: () => void
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
      className={({ isActive }) => (isActive ? "nav-item--active" : "")}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (!e.currentTarget.classList.contains("nav-item--active")) {
          e.currentTarget.style.background = "oklch(var(--color-paper-3))"
        }
      }}
      onMouseLeave={(e) => {
        if (!e.currentTarget.classList.contains("nav-item--active")) {
          e.currentTarget.style.background = "transparent"
        }
      }}
    >
      {icon}
      {label}
    </NavLink>
  )
}

// ── Sidebar content ────────────────────────────────────────────────────────────

function SidebarContent({
  onNavClick,
}: {
  onNavClick?: () => void
}) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { activeWorkspace } = useWorkspaceStore()
  const navigate = useNavigate()

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
    <>
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
      <div style={{ height: "1px", background: "oklch(var(--color-border))", margin: "6px 0" }} />

      {/* Nav items */}
      {activeWorkspace && (
        <nav style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <NavItem to={`/${activeWorkspace.id}`} icon={<BoardsIcon />} label="Boards" onClick={onNavClick} />
          <NavItem to={`/${activeWorkspace.id}/settings`} icon={<SettingsIcon />} label="Settings" onClick={onNavClick} />
          <NavItem to={`/${activeWorkspace.id}/members`} icon={<MembersIcon />} label="Members" onClick={onNavClick} />
          <NavItem to={`/${activeWorkspace.id}/analytics`} icon={<AnalyticsIcon />} label="Analytics" onClick={onNavClick} />
        </nav>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Bottom controls row: notifications + dark mode toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "0 2px" }}>
        <div style={{ flex: 1 }}>
          <NotificationBell />
        </div>
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            padding: "6px",
            borderRadius: "6px",
            border: "none",
            background: "transparent",
            color: "oklch(var(--color-ink-3))",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
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
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>

      {/* Divider */}
      <div style={{ height: "1px", background: "oklch(var(--color-border))", margin: "6px 0" }} />

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
          aria-label="Sign out"
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
    </>
  )
}

// ── AppLayout ──────────────────────────────────────────────────────────────────

export default function AppLayout() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { workspaces, activeWorkspace, setWorkspaces, setActiveWorkspace, setLoading } =
    useWorkspaceStore()
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const isMobile = useIsMobile()
  const hamburgerRef = useRef<HTMLButtonElement>(null)
  // Tracks whether the drawer has been opened at least once; prevents focus
  // returning to hamburger on initial mount (isMobileMenuOpen starts false).
  const drawerWasOpenRef = useRef(false)

  // Close drawer on desktop resize
  useEffect(() => {
    if (!isMobile) setIsMobileMenuOpen(false)
  }, [isMobile])

  // Return focus to hamburger only on genuine close (not on initial mount or resize)
  useEffect(() => {
    if (isMobileMenuOpen) {
      drawerWasOpenRef.current = true
    } else if (drawerWasOpenRef.current) {
      hamburgerRef.current?.focus()
    }
  }, [isMobileMenuOpen])

  // Minimal focus trap for keyboard users navigating inside the drawer
  const handleDrawerKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Tab") return
    const focusable = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
      )
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault()
        last.focus()
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }, [])

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

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setIsSearchOpen(true)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const sidebarStyle: React.CSSProperties = {
    width: "220px",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    background: "oklch(var(--color-paper-2))",
    borderRight: "1px solid oklch(var(--color-border))",
    padding: "12px 10px",
    gap: "4px",
    overflowY: "auto",
    height: "100%",
  }

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
      {/* ── Desktop sidebar (always visible ≥768px) ── */}
      {!isMobile && (
        <aside style={sidebarStyle}>
          <SidebarContent />
        </aside>
      )}

      {/* ── Mobile: top bar with hamburger ── */}
      {isMobile && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: "52px",
            background: "oklch(var(--color-paper-2))",
            borderBottom: "1px solid oklch(var(--color-border))",
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
            gap: "10px",
            zIndex: 200,
          }}
        >
          <button
            ref={hamburgerRef}
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-sidebar-drawer"
            style={{
              padding: "6px",
              borderRadius: "6px",
              border: "none",
              background: "transparent",
              color: "oklch(var(--color-ink-2))",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
          >
            <HamburgerIcon />
          </button>
          <svg width="22" height="22" viewBox="0 0 40 40" fill="none" aria-hidden="true">
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
      )}

      {/* ── Mobile: sidebar drawer + backdrop ── */}
      <AnimatePresence>
        {isMobile && isMobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsMobileMenuOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                background: "oklch(0% 0 0 / 0.4)",
                zIndex: 250,
              }}
            />

            {/* Drawer */}
            <motion.aside
              id="mobile-sidebar-drawer"
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              onKeyDown={handleDrawerKeyDown}
              style={{
                ...sidebarStyle,
                position: "fixed",
                top: 0,
                left: 0,
                bottom: 0,
                zIndex: 260,
              }}
            >
              {/* Drawer close button */}
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                autoFocus
                style={{
                  alignSelf: "flex-end",
                  padding: "6px",
                  marginBottom: "4px",
                  borderRadius: "6px",
                  border: "none",
                  background: "transparent",
                  color: "oklch(var(--color-ink-3))",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <CloseIcon />
              </button>
              <SidebarContent onNavClick={() => setIsMobileMenuOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Main content area ── */}
      <main
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          paddingTop: isMobile ? "52px" : 0,
        }}
      >
        <Outlet />
      </main>

      {/* ── Search button in mobile top bar ── */}
      {isMobile && (
        <button
          onClick={() => setIsSearchOpen(true)}
          aria-label="Search"
          style={{
            position: "fixed",
            top: "10px",
            right: "12px",
            zIndex: 201,
            padding: "6px",
            borderRadius: "6px",
            border: "none",
            background: "transparent",
            color: "oklch(var(--color-ink-2))",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
          }}
        >
          <SearchIcon />
        </button>
      )}

      {/* ── Global search modal ── */}
      {workspaceId && (
        <SearchModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          workspaceId={workspaceId}
        />
      )}
    </div>
  )
}
