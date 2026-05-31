import { useEffect, useState } from "react"
import { useParams, Link } from "react-router-dom"
import { useWorkspaceStore } from "../stores/workspaceStore"
import { workspacesApi, type WorkspaceDetail } from "../api/workspaces"

const BOARD_PLACEHOLDER_ICON = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <rect x="1" y="1" width="7" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
    <rect x="11" y="1" width="8" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
  </svg>
)

const MEMBERS_ICON = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <circle cx="5" cy="4.5" r="2.25" stroke="currentColor" strokeWidth="1.1" />
    <path d="M0.5 12c0-2.49 2.01-4.5 4.5-4.5s4.5 2.01 4.5 4.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    <circle cx="11" cy="4.5" r="1.5" stroke="currentColor" strokeWidth="1.1" />
    <path d="M13 11c0-1.24-.8-2.3-1.9-2.66" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
  </svg>
)

export default function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { activeWorkspace } = useWorkspaceStore()
  const [detail, setDetail] = useState<WorkspaceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    setError("")
    workspacesApi
      .getOne(workspaceId)
      .then(setDetail)
      .catch((err: Error) => setError(err.message || "Failed to load workspace"))
      .finally(() => setLoading(false))
  }, [workspaceId])

  if (loading) {
    return (
      <div style={centerStyle}>
        <span className="animate-pulse" style={{ color: "oklch(var(--color-ink-2))", fontSize: "var(--text-sm)" }}>
          Loading…
        </span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={centerStyle}>
        <p style={{ color: "oklch(var(--color-error))", fontSize: "var(--text-sm)" }}>{error}</p>
      </div>
    )
  }

  const ws = detail ?? activeWorkspace

  return (
    <div style={{ padding: "32px 36px", color: "oklch(var(--color-ink))", fontFamily: "var(--font-body)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "28px" }}>
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "var(--text-2xl)",
              fontWeight: 600,
              letterSpacing: "-0.02em",
              fontFamily: "var(--font-display)",
            }}
          >
            {ws?.name ?? "Workspace"}
          </h1>
          {detail?.description && (
            <p style={{ margin: "6px 0 0", fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))" }}>
              {detail.description}
            </p>
          )}
          {detail && (
            <div style={{ display: "flex", gap: "16px", marginTop: "10px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                {MEMBERS_ICON}
                {detail.memberCount} {detail.memberCount === 1 ? "member" : "members"}
              </span>
              <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                {detail.role}
              </span>
            </div>
          )}
        </div>

        {workspaceId && (
          <Link
            to={`/${workspaceId}/settings`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              borderRadius: "var(--radius-button)",
              border: "1px solid oklch(var(--color-border))",
              background: "transparent",
              color: "oklch(var(--color-ink-2))",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              textDecoration: "none",
              transition: "background var(--dur-fast)",
            }}
          >
            Settings
          </Link>
        )}
      </div>

      {/* Boards placeholder */}
      <div>
        <h2
          style={{
            margin: "0 0 16px",
            fontSize: "var(--text-base)",
            fontWeight: 600,
            color: "oklch(var(--color-ink))",
          }}
        >
          Boards
        </h2>

        {/* Empty state — boards come in Feature #7 */}
        <div
          style={{
            border: "1px dashed oklch(var(--color-border))",
            borderRadius: "var(--radius-card)",
            padding: "48px 24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
            color: "oklch(var(--color-ink-3))",
          }}
        >
          <div style={{ color: "oklch(var(--color-muted))" }}>{BOARD_PLACEHOLDER_ICON}</div>
          <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink-2))" }}>
            No boards yet
          </p>
          <p style={{ margin: 0, fontSize: "var(--text-xs)", textAlign: "center", maxWidth: "280px" }}>
            Create your first board to start organizing tasks. Boards are coming in the next update.
          </p>
        </div>
      </div>
    </div>
  )
}

const centerStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}
