import { useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { authApi } from "../api/auth"

/**
 * Landing page after Google OAuth redirect.
 * The backend redirects here with ?token=<accessToken>.
 * We capture the token, fetch the user profile, store in AuthContext, then navigate to dashboard.
 */
export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const { setTokenAndUser } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const token = searchParams.get("token")
    if (!token) {
      navigate("/login?error=missing_token", { replace: true })
      return
    }

    // Exchange for user profile via a refresh (the refresh cookie was already set by the backend)
    authApi
      .refresh()
      .then((data) => {
        setTokenAndUser(data.accessToken, data.user)
        navigate("/dashboard", { replace: true })
      })
      .catch(() => {
        navigate("/login?error=auth_failed", { replace: true })
      })
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
        fontSize: "0.875rem",
      }}
    >
      Signing you in…
    </div>
  )
}
