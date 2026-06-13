import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { useWorkspaceStore } from "../stores/workspaceStore"
import { useWorkspaceList } from "../features/workspace/queries/useWorkspaceList"

export default function DashboardPage() {
  const { user } = useAuth()
  const { activeWorkspace } = useWorkspaceStore()
  const listQuery = useWorkspaceList()
  const navigate = useNavigate()
  const loadError = listQuery.isError

  // One-shot redirect gate. The workspace list is owned by useWorkspaceList;
  // redirect once it resolves (or immediately via the active selection if set).
  useEffect(() => {
    if (!user?.onboardingCompleted) {
      navigate("/onboarding", { replace: true })
      return
    }
    if (listQuery.data) {
      navigate(listQuery.data.length > 0 ? `/${listQuery.data[0].id}` : "/onboarding", { replace: true })
    } else if (activeWorkspace) {
      navigate(`/${activeWorkspace.id}`, { replace: true })
    }
  }, [user, activeWorkspace, listQuery.data, navigate])

  if (loadError) {
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
          color: "oklch(var(--color-ink-2))",
          fontSize: "var(--text-sm)",
          fontFamily: "var(--font-body)",
        }}
      >
        <span>Failed to load workspaces.</span>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "8px 16px",
            borderRadius: "var(--radius-button)",
            border: "1px solid oklch(var(--color-border))",
            background: "transparent",
            color: "oklch(var(--color-ink-2))",
            fontSize: "var(--text-sm)",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "oklch(var(--color-paper))",
        color: "oklch(var(--color-ink-2))",
        fontSize: "var(--text-sm)",
        fontFamily: "var(--font-body)",
      }}
    >
      <span className="animate-pulse">Loading…</span>
    </div>
  )
}
