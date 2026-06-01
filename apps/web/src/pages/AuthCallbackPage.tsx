import { useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"

/**
 * Landing page after Google OAuth redirect.
 *
 * The backend sets an httpOnly refresh cookie and redirects here.
 * AuthProvider already fires a silent refresh on mount — calling
 * authApi.refresh() here a second time races against it. Since the
 * backend rotates the refresh token on every use (deletes the old jti),
 * the second concurrent call always gets a 401, clearing auth state
 * and causing a login loop.
 *
 * Fix: let AuthProvider's mount refresh own the token exchange.
 * This page just waits for isLoading → false, then navigates.
 */
export default function AuthCallbackPage() {
  const { isLoading, isAuthenticated, user } = useAuth()
  const navigate = useNavigate()
  // Guard against double-navigation in React StrictMode double-invoke
  const navigated = useRef(false)

  useEffect(() => {
    if (isLoading) return
    if (navigated.current) return
    navigated.current = true

    if (!isAuthenticated) {
      navigate("/login?error=auth_failed", { replace: true })
      return
    }

    // If user was redirected here from an invite link, return them there.
    // Same-origin check prevents open redirect.
    const inviteNext = sessionStorage.getItem("invite_next")
    if (inviteNext) {
      sessionStorage.removeItem("invite_next")
      try {
        const url = new URL(inviteNext)
        if (url.origin === window.location.origin) {
          navigate(url.pathname + url.search, { replace: true })
          return
        }
      } catch {
        // Malformed URL — fall through to default redirect
      }
    }

    const dest = user?.onboardingCompleted ? "/dashboard" : "/onboarding"
    navigate(dest, { replace: true })
  }, [isLoading, isAuthenticated, user, navigate])

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
