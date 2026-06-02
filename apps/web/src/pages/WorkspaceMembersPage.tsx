import { useEffect, useState, useCallback } from "react"
import { useParams } from "react-router-dom"
import { workspacesApi, type WorkspaceMember } from "../api/workspaces"
import { invitesApi } from "../api/invites"
import { useAuth } from "../contexts/AuthContext"
import { getInitials, getAvatarBg } from "../utils/avatar"
import type { Role, WorkspaceInvite } from "@flowgrid/types"

const ASSIGNABLE_ROLES: Role[] = ["ADMIN", "MEMBER", "VIEWER"]

const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
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

function RoleBadge({ role }: { role: Role }) {
  const colors: Record<Role, React.CSSProperties> = {
    OWNER: { background: "oklch(var(--color-accent) / 0.12)", color: "oklch(var(--color-accent))" },
    ADMIN: { background: "oklch(var(--color-warning) / 0.12)", color: "oklch(var(--color-warning, 0.7 0.15 80))" },
    MEMBER: { background: "oklch(var(--color-ink-3) / 0.15)", color: "oklch(var(--color-ink-2))" },
    VIEWER: { background: "oklch(var(--color-ink-3) / 0.1)", color: "oklch(var(--color-ink-3))" },
  }
  return (
    <span
      style={{
        ...colors[role],
        padding: "2px 8px",
        borderRadius: "100px",
        fontSize: "var(--text-xs)",
        fontWeight: 500,
      }}
    >
      {ROLE_LABELS[role]}
    </span>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WorkspaceMembersPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { user } = useAuth()

  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [invites, setInvites] = useState<WorkspaceInvite[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [loadingInvites, setLoadingInvites] = useState(true)
  const [membersError, setMembersError] = useState("")
  const [invitesError, setInvitesError] = useState("")

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<Role>("MEMBER")
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState("")
  const [inviteSuccess, setInviteSuccess] = useState("")
  const [inviteUrl, setInviteUrl] = useState("")
  const [resendSuccess, setResendSuccess] = useState<Record<string, boolean>>({})

  const currentUserMember = members.find((m) => m.userId === user?.id)
  const canManage = currentUserMember?.role === "OWNER" || currentUserMember?.role === "ADMIN"

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

  const handleRoleChange = async (memberId: string, newRole: Role) => {
    try {
      const updated = await workspacesApi.updateMember(memberId, newRole)
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role: updated.role } : m)))
    } catch (err: unknown) {
      alert((err as Error).message || "Failed to update role")
    }
  }

  const handleRemove = async (memberId: string) => {
    if (!confirm("Remove this member from the workspace?")) return
    try {
      await workspacesApi.removeMember(memberId)
      setMembers((prev) => prev.filter((m) => m.id !== memberId))
    } catch (err: unknown) {
      alert((err as Error).message || "Failed to remove member")
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!workspaceId || !inviteEmail.trim()) return
    setInviting(true)
    setInviteError("")
    setInviteSuccess("")
    setInviteUrl("")
    try {
      const result = await invitesApi.create(workspaceId, inviteEmail.trim(), inviteRole)
      setInviteSuccess(`Invite sent to ${inviteEmail.trim()}`)
      setInviteUrl(result.inviteUrl)
      setInviteEmail("")
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
      // Update the invite URL in the list in case it changed
      setInvites((prev) => prev.map((i) => i.id === inviteId ? { ...i, ...result.invite, inviteUrl: result.inviteUrl } : i))
      setTimeout(() => setResendSuccess((prev) => ({ ...prev, [inviteId]: false })), 3000)
    } catch (err: unknown) {
      alert((err as Error).message || "Failed to resend invite")
    }
  }

  const handleRevoke = async (inviteId: string) => {
    if (!confirm("Revoke this invite?")) return
    try {
      await invitesApi.revoke(inviteId)
      setInvites((prev) => prev.filter((i) => i.id !== inviteId))
    } catch (err: unknown) {
      alert((err as Error).message || "Failed to revoke invite")
    }
  }

  return (
    <div
      style={{
        padding: "32px 36px",
        maxWidth: "680px",
        color: "oklch(var(--color-ink))",
        fontFamily: "var(--font-body)",
      }}
    >
      {/* Page header */}
      <div style={{ marginBottom: "28px" }}>
        <h1
          style={{
            margin: 0,
            fontSize: "var(--text-xl)",
            fontWeight: 600,
            letterSpacing: "-0.02em",
            fontFamily: "var(--font-display)",
          }}
        >
          Members
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))" }}>
          {members.length} member{members.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Invite form — OWNER/ADMIN only */}
      {canManage && (
        <div style={{ ...sectionCard, marginBottom: "24px" }}>
          <div style={sectionHeader}>
            <h2 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600 }}>Invite people</h2>
          </div>
          <div style={{ padding: "16px 20px" }}>
            <form onSubmit={handleInvite} style={{ display: "flex", gap: "8px", flexWrap: "wrap" as const }}>
              <input
                type="email"
                placeholder="colleague@example.com"
                value={inviteEmail}
                onChange={(e) => { setInviteEmail(e.target.value); setInviteError(""); setInviteSuccess("") }}
                required
                disabled={inviting}
                style={{ ...inputStyle, flex: "1 1 200px", minWidth: "180px" }}
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as Role)}
                disabled={inviting}
                style={selectStyle}
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
              <button type="submit" disabled={inviting || !inviteEmail.trim()} style={{ ...primaryBtn, opacity: inviting ? 0.6 : 1 }}>
                {inviting ? "Sending…" : "Send invite"}
              </button>
            </form>
            {inviteError && (
              <p style={{ margin: "8px 0 0", fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>{inviteError}</p>
            )}
            {inviteSuccess && (
              <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" as const }}>
                <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-success))" }}>{inviteSuccess}</p>
                {inviteUrl && (
                  <button
                    type="button"
                    onClick={() => { void navigator.clipboard.writeText(inviteUrl) }}
                    style={{ ...ghostBtn, fontSize: "var(--text-xs)" }}
                  >
                    Copy invite link
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Members list */}
      <div style={{ ...sectionCard, marginBottom: "24px" }}>
        <div style={sectionHeader}>
          <h2 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600 }}>Current members</h2>
        </div>
        {loadingMembers ? (
          <div style={{ padding: "20px", fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))" }}>Loading…</div>
        ) : membersError ? (
          <div style={{ padding: "20px", fontSize: "var(--text-sm)", color: "oklch(var(--color-error))" }}>{membersError}</div>
        ) : (
          <div>
            {members.map((member) => {
              const isCurrentUser = member.userId === user?.id
              const isOwner = member.role === "OWNER"
              const canModify = canManage && !isCurrentUser && !isOwner

              return (
                <div
                  key={member.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 20px",
                    borderBottom: "1px solid oklch(var(--color-border))",
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
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>
                        {getInitials(member.name ?? member.email)}
                      </span>
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

                  {/* Role */}
                  {canModify ? (
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.id, e.target.value as Role)}
                      style={{ ...selectStyle, fontSize: "var(--text-xs)", padding: "4px 8px" }}
                    >
                      {ASSIGNABLE_ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  ) : (
                    <RoleBadge role={member.role} />
                  )}

                  {/* Remove */}
                  {canModify && (
                    <button onClick={() => handleRemove(member.id)} style={dangerGhostBtn} title="Remove member">
                      Remove
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pending invites — OWNER/ADMIN only */}
      {canManage && (
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <h2 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600 }}>
              Pending invites
              {invites.length > 0 && (
                <span
                  style={{
                    marginLeft: 8,
                    background: "oklch(var(--color-ink-3) / 0.15)",
                    color: "oklch(var(--color-ink-2))",
                    padding: "1px 7px",
                    borderRadius: "100px",
                    fontSize: "var(--text-xs)",
                  }}
                >
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
            <div style={{ padding: "20px", fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-3))" }}>
              No pending invites
            </div>
          ) : (
            <div>
              {invites.map((invite) => {
                const expiresDate = new Date(invite.expiresAt)
                const isExpired = expiresDate < new Date()
                const didResend = resendSuccess[invite.id] ?? false
                return (
                  <div
                    key={invite.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "12px 20px",
                      borderBottom: "1px solid oklch(var(--color-border))",
                      opacity: isExpired ? 0.7 : 1,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: "var(--text-sm)" }}>{invite.email}</p>
                      <p style={{ margin: "2px 0 0", fontSize: "var(--text-xs)", color: isExpired ? "oklch(var(--color-error))" : "oklch(var(--color-ink-3))" }}>
                        {isExpired ? "Expired" : `Expires ${expiresDate.toLocaleDateString()}`}
                      </p>
                    </div>
                    <RoleBadge role={invite.role} />
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      {didResend && (
                        <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-success))" }}>Sent!</span>
                      )}
                      {invite.inviteUrl && (
                        <button
                          onClick={() => { void navigator.clipboard.writeText(invite.inviteUrl!) }}
                          style={ghostBtn}
                          title="Copy invite link"
                        >
                          Copy link
                        </button>
                      )}
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
