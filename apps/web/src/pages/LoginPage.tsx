import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"

const GOOGLE_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
)

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/dashboard", { replace: true })
    }
  }, [isAuthenticated, isLoading, navigate])

  const handleGoogleLogin = () => {
    window.location.href = "/api/auth/google"
  }

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "oklch(var(--color-paper))",
        }}
      >
        <div className="animate-pulse" style={{ color: "oklch(var(--color-ink-2))", fontSize: "0.875rem" }}>
          Loading…
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "oklch(var(--color-paper))",
        color: "oklch(var(--color-ink))",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "360px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "32px",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <rect width="40" height="40" rx="8" fill="oklch(52% 0.22 260)" />
            <rect x="8" y="8" width="10" height="24" rx="2" fill="white" opacity="0.9" />
            <rect x="22" y="8" width="10" height="16" rx="2" fill="white" opacity="0.6" />
          </svg>
          <span style={{ fontSize: "1.25rem", fontWeight: 600, letterSpacing: "-0.02em", fontFamily: "var(--font-display)" }}>
            FlowGrid
          </span>
        </div>

        {/* Card */}
        <div
          style={{
            width: "100%",
            borderRadius: "12px",
            border: "1px solid oklch(var(--color-border))",
            background: "oklch(var(--color-surface))",
            padding: "32px 28px",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600, letterSpacing: "-0.02em" }}>
              Sign in
            </h1>
            <p style={{ margin: "6px 0 0", fontSize: "0.875rem", color: "oklch(var(--color-ink-2))" }}>
              Use your Google account to continue
            </p>
          </div>

          <button
            onClick={handleGoogleLogin}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              width: "100%",
              padding: "10px 16px",
              borderRadius: "8px",
              border: "1px solid oklch(var(--color-border))",
              background: "oklch(var(--color-surface))",
              color: "oklch(var(--color-ink))",
              fontSize: "0.9375rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 120ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "oklch(var(--color-surface-raised))"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "oklch(var(--color-surface))"
            }}
          >
            {GOOGLE_ICON}
            Continue with Google
          </button>
        </div>

        <p style={{ fontSize: "0.75rem", color: "oklch(var(--color-ink-3))", textAlign: "center", margin: 0 }}>
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  )
}
