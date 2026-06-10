import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, Link } from "react-router-dom"
import { workspacesApi, type WorkspaceMember } from "../api/workspaces"
import { invitesApi, type WorkspaceInviteRecord } from "../api/invites"
import { usersApi, type UserSearchResult } from "../api/users"
import { useAuth } from "../contexts/AuthContext"
import { getInitials, getAvatarBg } from "../utils/avatar"
import { useWorkspaceSocket } from "../hooks/useWorkspaceSocket"
import type { Role } from "@flowgrid/types"

const ASSIGNABLE_ROLES: Role[] = ["ADMIN", "MEMBER", "VIEWER"]

const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const DOWNLOAD_ICON = (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
    <path d="M6.5 2v6M4 6l2.5 2.5L9 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 10h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
)

const GEAR_ICON = (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
    <circle cx="6.5" cy="6.5" r="2" stroke="currentColor" strokeWidth="1.2" />
    <path d="M6.5 1.5v1M6.5 10.5v1M1.5 6.5h1M10.5 6.5h1M3.2 3.2l.7.7M9.1 9.1l.7.7M9.8 3.2l-.7.7M3.9 9.1l-.7.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
)

const SEARCH_ICON = (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.25" />
    <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
  </svg>
)

const DOTS_ICON = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <circle cx="7" cy="2.5" r="1.25" fill="currentColor" />
    <circle cx="7" cy="7" r="1.25" fill="currentColor" />
    <circle cx="7" cy="11.5" r="1.25" fill="currentColor" />
  </svg>
)

const ENVELOPE_ICON = (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <rect x="4" y="8" width="24" height="17" rx="3" stroke="currentColor" strokeWidth="1.5" />
    <path d="M4 11l12 8 12-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

// ── Stat icon types ───────────────────────────────────────────────────────────

function StatIcon({ type }: { type: "total" | "owner" | "pending" | "active" }) {
  if (type === "total") return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="5.5" cy="5" r="2.25" stroke="currentColor" strokeWidth="1.1" />
      <path d="M1 13c0-2.49 2.01-4.5 4.5-4.5S10 10.51 10 13" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="12" cy="5" r="1.5" stroke="currentColor" strokeWidth="1.1" />
      <path d="M14 12c0-1.24-.8-2.3-1.9-2.66" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
  if (type === "owner") return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2l1.5 3 3 .5-2 2 .5 3L8 9l-3 1.5.5-3-2-2 3-.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  )
  if (type === "pending") return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="5" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.1" />
      <path d="M2 8l6 4 6-4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.1" />
      <path d="M5.5 8l1.5 1.5L10.5 6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const sectionCard: React.CSSProperties = {
  border: "1px solid oklch(var(--color-border))",
  borderRadius: "var(--radius-card)",
  background: "oklch(var(--color-paper-2))",
  overflow: "hidden",
}

const sectionHeader: React.CSSProperties = {
  padding: "14px 20px",
  borderBottom: "1px solid oklch(var(--color-border))",
}

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: "var(--radius-input)",
  border: "1px solid oklch(var(--color-border))",
  background: "oklch(var(--color-paper))",
  color: "oklch(var(--color-ink))",
  fontSize: "var(--text-sm)",
  outline: "none",
  boxSizing: "border-box" as const,
  fontFamily: "var(--font-body)",
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
}

const primaryBtn: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: "var(--radius-button)",
  border: "none",
  background: "oklch(var(--color-accent))",
  color: "#fff",
  fontSize: "var(--text-sm)",
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
  fontFamily: "var(--font-body)",
}

const secondaryBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "8px 14px",
  borderRadius: "var(--radius-button)",
  border: "1px solid oklch(var(--color-border))",
  background: "oklch(var(--color-paper-2))",
  color: "oklch(var(--color-ink-2))",
  fontSize: "var(--text-sm)",
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
  fontFamily: "var(--font-body)",
  textDecoration: "none",
}

const ghostBtn: React.CSSProperties = {
  padding: "5px 10px",
  borderRadius: "var(--radius-button)",
  border: "1px solid oklch(var(--color-border))",
  background: "transparent",
  color: "oklch(var(--color-ink-2))",
  fontSize: "var(--text-xs)",
  cursor: "pointer",
}

const dangerGhostBtn: React.CSSProperties = {
  ...ghostBtn,
  borderColor: "oklch(var(--color-error) / 0.4)",
  color: "oklch(var(--color-error))",
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function MemberStat({ label, value, iconType }: { label: string; value: number | string; iconType: "total" | "owner" | "pending" | "active" }) {
  return (
    <div
      style={{
        border: "1px solid oklch(var(--color-border))",
        borderRadius: "var(--radius-card)",
        background: "oklch(var(--color-paper-2))",
        padding: "16px",
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", top: "14px", right: "14px", color: "oklch(var(--color-ink-3))" }}>
        <StatIcon type={iconType} />
      </div>
      <p
        style={{
          margin: 0,
          fontSize: "0.6875rem",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "oklch(var(--color-ink-3))",
          fontFamily: "var(--font-body)",
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: "8px 0 0",
          fontSize: "var(--text-2xl)",
          fontWeight: 700,
          color: "oklch(var(--color-ink))",
          fontFamily: "var(--font-display)",
          lineHeight: 1,
        }}
      >
        {value}
      </p>
    </div>
  )
}

// ── Role badge ────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: Role }) {
  const colors: Record<Role, React.CSSProperties> = {
    OWNER: { background: "oklch(var(--color-accent) / 0.12)", color: "oklch(var(--color-accent))" },
    ADMIN: { background: "oklch(var(--color-warning) / 0.12)", color: "oklch(var(--color-warning, 0.7 0.15 80))" },
    MEMBER: { background: "oklch(var(--color-ink-3) / 0.15)", color: "oklch(var(--color-ink-2))" },
    VIEWER: { background: "oklch(var(--color-ink-3) / 0.1)", color: "oklch(var(--color-ink-3))" },
  }
  return (
    <span style={{ ...colors[role], padding: "3px 10px", borderRadius: "100px", fontSize: "var(--text-xs)", fontWeight: 600 }}>
      {ROLE_LABELS[role]}
    </span>
  )
}

// ── Overflow menu for member row ───────────────────────────────────────────────

function MemberMenu({ memberId, role, onRoleChange, onRemove, canManage }: {
  memberId: string
  role: Role
  onRoleChange: (id: string, role: Role) => void
  onRemove: (id: string) => void
  canManage: boolean
}) {
  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  // Estimated menu height (role header + 3 roles + divider + remove)
  const MENU_HEIGHT = 220

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev
      if (next && btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect()
        // Flip upward when there isn't room below in the viewport
        setDropUp(window.innerHeight - rect.bottom < MENU_HEIGHT)
      }
      return next
    })
  }

  if (!canManage) return null

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        ref={btnRef}
        onClick={toggle}
        style={{ ...ghostBtn, padding: "4px 8px", display: "flex", alignItems: "center" }}
        aria-label="Member options"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {DOTS_ICON}
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            ...(dropUp ? { bottom: "calc(100% + 4px)" } : { top: "calc(100% + 4px)" }),
            background: "oklch(var(--color-paper-2))",
            border: "1px solid oklch(var(--color-border))",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--shadow-pop)",
            minWidth: "160px",
            zIndex: 50,
            overflow: "hidden",
          }}
        >
          <p style={{ margin: 0, padding: "8px 12px 4px", fontSize: "0.625rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "oklch(var(--color-ink-3))" }}>
            Change Role
          </p>
          {ASSIGNABLE_ROLES.map((r) => (
            <button
              key={r}
              onClick={() => { onRoleChange(memberId, r); setOpen(false) }}
              style={{
                all: "unset",
                display: "block",
                width: "100%",
                padding: "7px 12px",
                fontSize: "var(--text-sm)",
                color: role === r ? "oklch(var(--color-accent))" : "oklch(var(--color-ink))",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
                boxSizing: "border-box",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "oklch(var(--color-paper-3))" }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent" }}
            >
              {ROLE_LABELS[r]} {role === r && "✓"}
            </button>
          ))}
          <div style={{ height: "1px", background: "oklch(var(--color-border))", margin: "4px 0" }} />
          <button
            onClick={() => { onRemove(memberId); setOpen(false) }}
            style={{
              all: "unset",
              display: "block",
              width: "100%",
              padding: "7px 12px",
              fontSize: "var(--text-sm)",
              color: "oklch(var(--color-error))",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              boxSizing: "border-box",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "oklch(var(--color-paper-3))" }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent" }}
          >
            Remove from workspace
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WorkspaceMembersPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { user } = useAuth()

  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [invites, setInvites] = useState<WorkspaceInviteRecord[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [loadingInvites, setLoadingInvites] = useState(true)
  const [membersError, setMembersError] = useState("")
  const [invitesError, setInvitesError] = useState("")
  const [memberSearch, setMemberSearch] = useState("")

  // Invite form — user search based (invitee must have an account)
  const [inviteSearch, setInviteSearch] = useState("")
  const [inviteSearchResults, setInviteSearchResults] = useState<UserSearchResult[]>([])
  const [inviteSearchLoading, setInviteSearchLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [inviteRole, setInviteRole] = useState<Role>("MEMBER")
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState("")
  const [inviteSuccess, setInviteSuccess] = useState("")
  const [resendSuccess, setResendSuccess] = useState<Record<string, boolean>>({})

  const currentUserMember = members.find((m) => m.userId === user?.id)
  const canManage = currentUserMember?.role === "OWNER" || currentUserMember?.role === "ADMIN"

  // The current viewer always holds an active socket connection, so count them as online.
  const onlineCount = members.filter((m) => m.userId === user?.id || m.online).length

  const filteredMembers = members
    .filter((m) => {
      const q = memberSearch.trim().toLowerCase()
      if (!q) return true
      return (m.name ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      const tier = (m: typeof a) => {
        if (m.role === "OWNER") return 0
        return m.userId === user?.id || m.online ? 1 : 2
      }
      const tierDiff = tier(a) - tier(b)
      if (tierDiff !== 0) return tierDiff
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })

  // Real-time presence — update online state immediately when members connect/disconnect
  useWorkspaceSocket(workspaceId, {
    onMemberOnline: ({ userId: onlineId }) => {
      setMembers((prev) => prev.map((m) => (m.userId === onlineId ? { ...m, online: true } : m)))
    },
    onMemberOffline: ({ userId: offlineId }) => {
      setMembers((prev) => prev.map((m) => (m.userId === offlineId ? { ...m, online: false } : m)))
    },
  })

  const fetchMembers = useCallback(async () => {
    if (!workspaceId) return
    setLoadingMembers(true)
    try {
      const data = await workspacesApi.listMembers(workspaceId)
      setMembers(data)
    } catch (err: unknown) {
      setMembersError((err as Error).message || "Failed to load members")
    } finally {
      setLoadingMembers(false)
    }
  }, [workspaceId])

  const fetchInvites = useCallback(async () => {
    if (!workspaceId || !canManage) return
    setLoadingInvites(true)
    try {
      const data = await invitesApi.list(workspaceId)
      setInvites(data)
    } catch (err: unknown) {
      setInvitesError((err as Error).message || "Failed to load invites")
    } finally {
      setLoadingInvites(false)
    }
  }, [workspaceId, canManage])

  useEffect(() => { void fetchMembers() }, [fetchMembers])
  useEffect(() => { void fetchInvites() }, [fetchInvites])

  // Keep online/offline status and invite list fresh without flashing the loading state.
  const silentRefreshMembers = useCallback(async () => {
    if (!workspaceId) return
    try {
      const data = await workspacesApi.listMembers(workspaceId)
      setMembers(data)
    } catch {
      // Non-critical — keep showing the last known status
    }
  }, [workspaceId])

  const silentRefreshInvites = useCallback(async () => {
    if (!workspaceId || !canManage) return
    try {
      const data = await invitesApi.list(workspaceId)
      setInvites(data)
    } catch {
      // Non-critical
    }
  }, [workspaceId, canManage])

  useEffect(() => {
    const refresh = () => { void silentRefreshMembers(); void silentRefreshInvites() }
    const interval = setInterval(refresh, 30_000)
    window.addEventListener("focus", refresh)
    return () => {
      clearInterval(interval)
      window.removeEventListener("focus", refresh)
    }
  }, [silentRefreshMembers, silentRefreshInvites])

  const handleRoleChange = async (memberId: string, newRole: Role) => {
    try {
      const updated = await workspacesApi.updateMember(memberId, newRole)
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role: updated.role } : m)))
    } catch (err: unknown) {
      alert((err as Error).message || "Failed to update role")
    }
  }

  const handleRemove = async (memberId: string) => {
    try {
      await workspacesApi.removeMember(memberId)
      setMembers((prev) => prev.filter((m) => m.id !== memberId))
    } catch (err: unknown) {
      alert((err as Error).message || "Failed to remove member")
    }
  }

  // Debounce user search as the admin types
  useEffect(() => {
    if (selectedUser) return
    if (!workspaceId || inviteSearch.length < 2) {
      setInviteSearchResults([])
      setShowDropdown(false)
      return
    }
    const t = setTimeout(async () => {
      setInviteSearchLoading(true)
      try {
        const results = await usersApi.search(inviteSearch, workspaceId)
        setInviteSearchResults(results)
        setShowDropdown(true)
      } catch {
        setInviteSearchResults([])
      } finally {
        setInviteSearchLoading(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [inviteSearch, workspaceId, selectedUser])

  const handleSelectUser = (u: UserSearchResult) => {
    setSelectedUser(u)
    setInviteSearch(u.name ?? u.email)
    setShowDropdown(false)
    setInviteError("")
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!workspaceId || !selectedUser) return
    setInviting(true)
    setInviteError("")
    setInviteSuccess("")
    try {
      await invitesApi.create(workspaceId, selectedUser.id, inviteRole)
      setInviteSuccess(`Invite sent to ${selectedUser.name ?? selectedUser.email}`)
      setSelectedUser(null)
      setInviteSearch("")
      void fetchInvites()
    } catch (err: unknown) {
      setInviteError((err as Error).message || "Failed to send invite")
    } finally {
      setInviting(false)
    }
  }

  const handleResend = async (inviteId: string) => {
    try {
      const result = await invitesApi.resend(inviteId)
      setResendSuccess((prev) => ({ ...prev, [inviteId]: true }))
      setInvites((prev) => prev.map((i) => i.id === inviteId ? { ...i, ...result.invite } : i))
      setTimeout(() => setResendSuccess((prev) => ({ ...prev, [inviteId]: false })), 3000)
    } catch (err: unknown) {
      alert((err as Error).message || "Failed to resend invite")
    }
  }

  const handleRevoke = async (inviteId: string) => {
    try {
      await invitesApi.revoke(inviteId)
      setInvites((prev) => prev.filter((i) => i.id !== inviteId))
    } catch (err: unknown) {
      alert((err as Error).message || "Failed to revoke invite")
    }
  }

  function handleExportCsv() {
    const rows = [
      "Name,Email,Role,Status",
      ...members.map((m) => {
        const status = m.userId === user?.id || m.online ? "Active" : "Inactive"
        return `${m.name ?? ""},${m.email},${m.role},${status}`
      }),
    ]
    const blob = new Blob([rows.join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "members.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: "32px 36px", maxWidth: "960px", color: "oklch(var(--color-ink))", fontFamily: "var(--font-body)" }}>

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "28px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: 700, letterSpacing: "var(--display-tracking)", fontFamily: "var(--font-display)" }}>
            Team Members
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))" }}>
            Manage workspace access and roles ({members.length} total)
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button onClick={handleExportCsv} style={secondaryBtn as React.CSSProperties}>
            {DOWNLOAD_ICON}
            Export CSV
          </button>
          <Link to={`/${workspaceId}/settings`} style={secondaryBtn}>
            {GEAR_ICON}
            Team Settings
          </Link>
        </div>
      </div>

      {/* Stat cards row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px", marginBottom: "24px" }}>
        <MemberStat label="Total Members" value={members.length} iconType="total" />
        <MemberStat label="Workspace Owners" value={members.filter((m) => m.role === "OWNER").length} iconType="owner" />
        <MemberStat label="Pending Invites" value={invites.length} iconType="pending" />
        <MemberStat label="Active Now" value={onlineCount} iconType="active" />
      </div>

      {/* Invite form */}
      {canManage && (
        <div style={{ ...sectionCard, marginBottom: "24px", overflow: "visible" }}>
          <div style={{ ...sectionHeader, borderRadius: "var(--radius-card) var(--radius-card) 0 0" }}>
            <h2 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600 }}>Invite New Member</h2>
          </div>
          <div style={{ padding: "16px 20px" }}>
            <form onSubmit={handleInvite} style={{ display: "flex", gap: "8px", flexWrap: "wrap" as const }}>
              {/* User search input */}
              <div style={{ flex: "1 1 200px", minWidth: "180px", position: "relative" }}>
                <input
                  type="text"
                  placeholder="Search by name or email…"
                  value={inviteSearch}
                  onChange={(e) => {
                    setInviteSearch(e.target.value)
                    setSelectedUser(null)
                    setInviteError("")
                    setInviteSuccess("")
                  }}
                  onFocus={() => { if (inviteSearchResults.length > 0) setShowDropdown(true) }}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  disabled={inviting}
                  autoComplete="off"
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" as const }}
                />
                {/* Search results dropdown */}
                {showDropdown && (
                  <div style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    left: 0,
                    right: 0,
                    zIndex: 100,
                    background: "oklch(var(--color-paper))",
                    border: "1px solid oklch(var(--color-border))",
                    borderRadius: "var(--radius-card)",
                    boxShadow: "0 4px 16px oklch(0% 0 0 / 0.12)",
                    overflow: "hidden",
                  }}>
                    {inviteSearchLoading ? (
                      <div style={{ padding: "10px 12px", fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                        Searching…
                      </div>
                    ) : inviteSearchResults.length === 0 ? (
                      <div style={{ padding: "10px 12px", fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                        No users found
                      </div>
                    ) : (
                      inviteSearchResults.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onMouseDown={() => handleSelectUser(u)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            width: "100%",
                            padding: "8px 12px",
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            textAlign: "left",
                            fontFamily: "var(--font-body)",
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "oklch(var(--color-paper-3))" }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent" }}
                        >
                          <div style={{
                            width: 24, height: 24, borderRadius: "50%",
                            background: u.avatarUrl ? "transparent" : getAvatarBg(u.id),
                            display: "flex", alignItems: "center", justifyContent: "center",
                            overflow: "hidden", flexShrink: 0,
                          }}>
                            {u.avatarUrl
                              ? <img src={u.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              : <span style={{ fontSize: "9px", fontWeight: 700, color: "#fff" }}>{getInitials(u.name ?? u.email)}</span>
                            }
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {u.name ?? u.email}
                            </div>
                            {u.name && <div style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)} disabled={inviting} style={selectStyle}>
                {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
              <button type="submit" disabled={inviting || !selectedUser} style={{ ...primaryBtn, opacity: (inviting || !selectedUser) ? 0.6 : 1 }}>
                {inviting ? "Sending…" : "Send invite"}
              </button>
            </form>
            {inviteError && <p style={{ margin: "8px 0 0", fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>{inviteError}</p>}
            {inviteSuccess && (
              <p style={{ margin: "8px 0 0", fontSize: "var(--text-xs)", color: "oklch(0.55 0.13 152)" }}>{inviteSuccess}</p>
            )}
          </div>
        </div>
      )}

      {/* Active Members */}
      <div style={{ ...sectionCard, marginBottom: "24px", overflow: "visible" }}>
        <div style={{ ...sectionHeader, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <h2 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600 }}>Active Members</h2>
          {/* Search */}
          <div style={{ position: "relative", maxWidth: "220px" }}>
            <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "oklch(var(--color-ink-3))", display: "flex" }}>
              {SEARCH_ICON}
            </span>
            <input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search members…"
              style={{ ...inputStyle, paddingLeft: "28px", width: "100%" }}
            />
          </div>
        </div>
        {loadingMembers ? (
          <div style={{ padding: "20px", fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))" }}>Loading…</div>
        ) : membersError ? (
          <div style={{ padding: "20px", fontSize: "var(--text-sm)", color: "oklch(var(--color-error))" }}>{membersError}</div>
        ) : (
          <div>
            {filteredMembers.map((member, index) => {
              const isCurrentUser = member.userId === user?.id
              const isOwner = member.role === "OWNER"
              const canModify = canManage && !isCurrentUser && !isOwner
              const isLast = index === filteredMembers.length - 1
              // The current viewer always holds an active socket connection.
              const isOnline = isCurrentUser || member.online

              return (
                <div
                  key={member.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 20px",
                    borderBottom: isLast ? "none" : "1px solid oklch(var(--color-border))",
                  }}
                >
                  {/* Avatar */}
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      flexShrink: 0,
                      overflow: "hidden",
                      background: member.avatarUrl ? "transparent" : getAvatarBg(member.id),
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {member.avatarUrl ? (
                      <img src={member.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>{getInitials(member.name ?? member.email)}</span>
                    )}
                  </div>

                  {/* Name + email */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {member.name ?? member.email}
                      {isCurrentUser && <span style={{ marginLeft: 6, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>(you)</span>}
                    </p>
                    {member.name && (
                      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>{member.email}</p>
                    )}
                  </div>

                  {/* Role badge */}
                  <RoleBadge role={member.role} />

                  {/* Online/offline status */}
                  <div style={{ display: "flex", alignItems: "center", gap: "5px", flexShrink: 0, minWidth: 64 }}>
                    <div
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: isOnline ? "oklch(var(--color-success))" : "oklch(var(--color-ink-3))",
                      }}
                    />
                    <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                      {isOnline ? "Active" : "Inactive"}
                    </span>
                  </div>

                  {/* Overflow menu */}
                  <MemberMenu
                    memberId={member.id}
                    role={member.role}
                    onRoleChange={handleRoleChange}
                    onRemove={handleRemove}
                    canManage={canModify}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pending invites */}
      {canManage && (
        <div style={sectionCard}>
          <div style={{ ...sectionHeader, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600 }}>
              Pending Invites
              {invites.length > 0 && (
                <span style={{ marginLeft: 8, background: "oklch(var(--color-ink-3) / 0.15)", color: "oklch(var(--color-ink-2))", padding: "1px 7px", borderRadius: "100px", fontSize: "var(--text-xs)" }}>
                  {invites.length}
                </span>
              )}
            </h2>
          </div>
          {loadingInvites ? (
            <div style={{ padding: "20px", fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))" }}>Loading…</div>
          ) : invitesError ? (
            <div style={{ padding: "20px", fontSize: "var(--text-sm)", color: "oklch(var(--color-error))" }}>{invitesError}</div>
          ) : invites.length === 0 ? (
            /* Styled empty state per mockup */
            <div
              style={{
                padding: "40px 24px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
                color: "oklch(var(--color-ink-3))",
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  border: "1px dashed oklch(var(--color-border))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "oklch(var(--color-ink-3))",
                }}
              >
                {ENVELOPE_ICON}
              </div>
              <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600, color: "oklch(var(--color-ink-2))", fontFamily: "var(--font-display)" }}>
                No Pending Invites
              </p>
              <p style={{ margin: 0, fontSize: "var(--text-xs)", textAlign: "center", maxWidth: "280px", lineHeight: 1.5 }}>
                Any invites you send will appear here until accepted. They expire after 7 days.
              </p>
            </div>
          ) : (
            <div>
              {invites.map((invite) => {
                const expiresDate = new Date(invite.expiresAt)
                const isExpired = expiresDate < new Date()
                const didResend = resendSuccess[invite.id] ?? false
                const displayName = invite.invitee.name ?? invite.invitee.email
                return (
                  <div
                    key={invite.id}
                    style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 20px", borderBottom: "1px solid oklch(var(--color-border))", opacity: isExpired ? 0.7 : 1 }}
                  >
                    {/* Invitee avatar */}
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                      overflow: "hidden", background: invite.invitee.avatarUrl ? "transparent" : getAvatarBg(invite.invitee.id),
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {invite.invitee.avatarUrl
                        ? <img src={invite.invitee.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <span style={{ fontSize: "11px", fontWeight: 600, color: "#fff" }}>{getInitials(displayName)}</span>
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 500 }}>{displayName}</p>
                      <p style={{ margin: "2px 0 0", fontSize: "var(--text-xs)", color: isExpired ? "oklch(var(--color-error))" : "oklch(var(--color-ink-3))" }}>
                        {invite.invitee.email} · {isExpired ? "Expired" : `Expires ${expiresDate.toLocaleDateString()}`}
                      </p>
                    </div>
                    <RoleBadge role={invite.role} />
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      {didResend && <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-success))" }}>Sent!</span>}
                      <button onClick={() => { void handleResend(invite.id) }} style={ghostBtn}>Resend</button>
                      <button onClick={() => { void handleRevoke(invite.id) }} style={dangerGhostBtn}>Revoke</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
