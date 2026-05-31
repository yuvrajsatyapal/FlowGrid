import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { useWorkspaceStore } from "../stores/workspaceStore"
import { workspacesApi } from "../api/workspaces"

/**
 * Redirect hub — sends authenticated users to their first workspace.
 * Loads workspace list if not already cached.
 */
export default function DashboardPage() {
  const { user } = useAuth()
  const { workspaces, setWorkspaces, activeWorkspace } = useWorkspaceStore()
  const navigate = useNavigate()

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
        navigate("/login?error=workspace_load_failed", { replace: true })
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
