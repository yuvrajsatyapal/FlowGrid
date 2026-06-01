import { useEffect, useState } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { invitesApi } from "../api/invites"
import { workspacesApi } from "../api/workspaces"
import { useWorkspaceStore } from "../stores/workspaceStore"
import type { Role } from "@flowgrid/types"

const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
}

type PageState =
  | { status: "loading" }
  | { status: "success"; workspaceId: string; workspaceName: string; role: Role }
  | { status: "error"; code: string; message: string }

export default function InviteAcceptPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const { setWorkspaces } = useWorkspaceStore()
  const [pageState, setPageState] = useState<PageState>({ status: "loading" })

  const token = searchParams.get("token")

  useEffect(() => {
    if (authLoading) return
    if (!token) {
      setPageState({ status: "error", code: "NO_TOKEN", message: "No invite token found in the URL." })
      return
    }

    if (!isAuthenticated) {
      // Save this URL so AuthCallbackPage can redirect here after OAuth
      sessionStorage.setItem("invite_next", window.location.href)
      window.location.href = "/api/auth/google"
      return
    }

    invitesApi
      .accept(token)
      .then(async (result) => {
        // Refresh workspace list so the new workspace appears in the sidebar
        try {
          const updated = await workspacesApi.list()
          setWorkspaces(updated)
        } catch {
          // Non-fatal — workspace list will refresh on next navigation
        }
        setPageState({ status: "success", workspaceId: result.workspaceId, workspaceName: result.workspaceName, role: result.role })
      })
      .catch((err: Error) => {
        const msg = err.message || "Failed to accept invite"
        // Map backend error codes to user-friendly states
        if (msg.includes("INVITE_EXPIRED") || msg.toLowerCase().includes("expired")) {
          setPageState({ status: "error", code: "INVITE_EXPIRED", message: "Invite expired. Ask the workspace owner to resend." })
        } else if (msg.includes("EMAIL_MISMATCH") || msg.toLowerCase().includes("different email")) {
          setPageState({ status: "error", code: "EMAIL_MISMATCH", message: "This invite was sent to a different email address." })
        } else if (msg.includes("INVITE_INVALID") || msg.toLowerCase().includes("no longer valid")) {
          setPageState({ status: "error", code: "INVITE_INVALID", message: "This invite is no longer valid." })
        } else {
          setPageState({ status: "error", code: "UNKNOWN", message: msg })
        }
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated, token])

  const containerStyle: React.CSSProperties = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "oklch(var(--color-paper))",
    padding: "24px",
  }

  const cardStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: "420px",
    background: "oklch(var(--color-paper-2))",
    border: "1px solid oklch(var(--color-border))",
    borderRadius: "var(--radius-modal)",
    padding: "32px 28px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    color: "oklch(var(--color-ink))",
    fontFamily: "var(--font-body)",
  }

  if (pageState.status === "loading" || authLoading) {
    return (
      <div style={containerStyle}>
        <p style={{ color: "oklch(var(--color-ink-2))", fontSize: "var(--text-sm)" }}>
          {authLoading ? "Checking authentication…" : "Accepting invite…"}
        </p>
      </div>
    )
  }

  if (pageState.status === "success") {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div>
            <h1 style={{ margin: "0 0 6px", fontSize: "var(--text-xl)", fontWeight: 600, fontFamily: "var(--font-display)" }}>
              You're in!
            </h1>
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))" }}>
              You joined <strong>{pageState.workspaceName}</strong> as a{" "}
              <strong>{ROLE_LABELS[pageState.role]}</strong>.
            </p>
          </div>
          <button
            onClick={() => navigate(`/${pageState.workspaceId}`, { replace: true })}
            style={{
              padding: "10px 20px",
              borderRadius: "var(--radius-button)",
              border: "none",
              background: "oklch(var(--color-accent))",
              color: "#fff",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              cursor: "pointer",
              alignSelf: "flex-start",
            }}
          >
            Go to workspace
          </button>
        </div>
      </div>
    )
  }

  // Error state
  const isExpired = pageState.code === "INVITE_EXPIRED"
  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={{ margin: "0 0 6px", fontSize: "var(--text-xl)", fontWeight: 600, fontFamily: "var(--font-display)" }}>
          {isExpired ? "Invite expired" : "Invite unavailable"}
        </h1>
        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))", lineHeight: 1.5 }}>
          {pageState.message}
        </p>
        <button
          onClick={() => navigate("/dashboard", { replace: true })}
          style={{
            padding: "8px 16px",
            borderRadius: "var(--radius-button)",
            border: "1px solid oklch(var(--color-border))",
            background: "transparent",
            color: "oklch(var(--color-ink-2))",
            fontSize: "var(--text-sm)",
            cursor: "pointer",
            alignSelf: "flex-start",
          }}
        >
          Go to dashboard
        </button>
      </div>
    </div>
  )
}
