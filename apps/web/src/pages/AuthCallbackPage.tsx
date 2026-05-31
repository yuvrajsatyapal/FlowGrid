import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { authApi } from "../api/auth"

/**
 * Landing page after Google OAuth redirect.
 * The backend sets the httpOnly refresh cookie and redirects here with no query params —
 * the access token is never placed in the URL to avoid browser history / Referer leakage.
 * We call /api/auth/refresh using the cookie to retrieve the access token and user profile.
 */
export default function AuthCallbackPage() {
  const { setTokenAndUser } = useAuth()
  const navigate = useNavigate()

  // Intentionally runs once on mount — this is a one-shot OAuth landing page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    authApi
      .refresh()
      .then((data) => {
        setTokenAndUser(data.accessToken, data.user)
        const dest = data.user.onboardingCompleted ? "/dashboard" : "/onboarding"
        navigate(dest, { replace: true })
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
