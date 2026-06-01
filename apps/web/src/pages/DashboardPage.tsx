import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { useWorkspaceStore } from "../stores/workspaceStore"
import { workspacesApi } from "../api/workspaces"

export default function DashboardPage() {
  const { user } = useAuth()
  const { workspaces, setWorkspaces, activeWorkspace } = useWorkspaceStore()
  const navigate = useNavigate()
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!user?.onboardingCompleted) {
      navigate("/onboarding", { replace: true })
      return
    }

    const redirect = (list: typeof workspaces) => {
      if (list.length === 0) {
        navigate("/onboarding", { replace: true })
      } else {
        navigate(`/${list[0].id}`, { replace: true })
      }
    }

    if (workspaces.length > 0) {
      redirect(workspaces)
    } else if (activeWorkspace) {
      navigate(`/${activeWorkspace.id}`, { replace: true })
    } else {
      workspacesApi.list().then((list) => {
        setWorkspaces(list)
        redirect(list)
      }).catch(() => {
        // Don't navigate to /login — if the user is authenticated, LoginPage would
        // immediately bounce them back here creating an infinite redirect loop.
        setLoadError(true)
      })
    }
    // Intentional empty deps — one-shot mount redirect. Re-running when workspaces
    // changes would fight the Zustand store and cause a redirect loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
