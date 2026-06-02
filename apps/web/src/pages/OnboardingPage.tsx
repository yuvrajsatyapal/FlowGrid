import { useState } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { authApi } from "../api/auth"
import { usersApi } from "../api/users"
import { workspacesApi } from "../api/workspaces"

const TOTAL_STEPS = 2

// ── Shared style helpers ──────────────────────────────────────────────────────

const pageWrap: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  background: "oklch(var(--color-paper))",
  color: "oklch(var(--color-ink))",
  padding: "24px",
  fontFamily: "var(--font-body)",
}

const card: React.CSSProperties = {
  width: "100%",
  maxWidth: "440px",
  borderRadius: "var(--radius-modal)",
  border: "1px solid oklch(var(--color-border))",
  background: "oklch(var(--color-paper-2))",
  padding: "36px 32px",
  display: "flex",
  flexDirection: "column",
  gap: "28px",
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: "var(--radius-input)",
  border: "1px solid oklch(var(--color-border))",
  background: "oklch(var(--color-paper))",
  color: "oklch(var(--color-ink))",
  fontSize: "var(--text-sm)",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)",
}

const primaryBtn: React.CSSProperties = {
  width: "100%",
  padding: "10px 20px",
  borderRadius: "var(--radius-button)",
  border: "none",
  background: "oklch(var(--color-accent))",
  color: "#fff",
  fontSize: "var(--text-sm)",
  fontWeight: 500,
  cursor: "pointer",
  transition: "background var(--dur-fast) var(--ease-out), opacity var(--dur-fast)",
}

const ghostBtn: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: "var(--radius-button)",
  border: "1px solid oklch(var(--color-border))",
  background: "transparent",
  color: "oklch(var(--color-ink-2))",
  fontSize: "var(--text-sm)",
  fontWeight: 500,
  cursor: "pointer",
  transition: "background var(--dur-fast) var(--ease-out)",
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  return (
    <div style={{ display: "flex", gap: "6px" }}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          style={{
            height: "3px",
            flex: 1,
            borderRadius: "2px",
            background:
              i < step
                ? "oklch(var(--color-accent))"
                : i === step
                  ? "oklch(var(--color-accent-muted))"
                  : "oklch(var(--color-border))",
            transition: "background var(--dur-base) var(--ease-out)",
          }}
        />
      ))}
    </div>
  )
}

// ── FlowGrid logo mark (shared) ───────────────────────────────────────────────

const LogoMark = () => (
  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
    <svg width="32" height="32" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect width="40" height="40" rx="8" fill="oklch(52% 0.22 260)" />
      <rect x="8" y="8" width="10" height="24" rx="2" fill="white" opacity="0.9" />
      <rect x="22" y="8" width="10" height="16" rx="2" fill="white" opacity="0.6" />
    </svg>
    <span style={{ fontSize: "var(--text-base)", fontWeight: 600, letterSpacing: "-0.02em", fontFamily: "var(--font-display)" }}>
      FlowGrid
    </span>
  </div>
)

// ── Step 1: Display name ──────────────────────────────────────────────────────

interface Step1Props {
  onNext: (name: string) => void
}

function StepDisplayName({ onNext }: Step1Props) {
  const { user } = useAuth()
  const [name, setName] = useState(user?.name ?? "")
  const [error, setError] = useState("")
  const [focused, setFocused] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) {
      setError("Name must be at least 2 characters")
      return
    }
    onNext(name.trim())
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: "var(--text-xl)", fontWeight: 600, letterSpacing: "-0.02em" }}>
          What's your name?
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))" }}>
          This is how your teammates will see you in FlowGrid.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <label
          htmlFor="display-name"
          style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink-2))" }}
        >
          Display name
        </label>
        <input
          id="display-name"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (error) setError("")
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="e.g. Alex Kim"
          autoFocus
          autoComplete="name"
          style={{
            ...inputStyle,
            borderColor: error
              ? "oklch(var(--color-error))"
              : focused
                ? "oklch(var(--color-accent))"
                : "oklch(var(--color-border))",
            boxShadow: focused && !error ? "0 0 0 3px oklch(var(--color-accent-muted))" : "none",
          }}
        />
        {error && (
          <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>{error}</span>
        )}
      </div>

      <button
        type="submit"
        disabled={name.trim().length === 0}
        style={{ ...primaryBtn, opacity: name.trim().length === 0 ? 0.5 : 1, cursor: name.trim().length === 0 ? "not-allowed" : "pointer" }}
        onMouseEnter={(e) => { if (name.trim()) e.currentTarget.style.background = "oklch(var(--color-accent-hover))" }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "oklch(var(--color-accent))" }}
      >
        Continue
      </button>
    </form>
  )
}

// ── Step 2: Create workspace ──────────────────────────────────────────────────

interface Step2Props {
  displayName: string
  onBack: () => void
  onComplete: (workspaceName: string) => Promise<void>
}

function StepCreateWorkspace({ displayName, onBack, onComplete }: Step2Props) {
  const [workspaceName, setWorkspaceName] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (workspaceName.trim().length < 2) {
      setError("Workspace name must be at least 2 characters")
      return
    }
    setLoading(true)
    setError("")
    try {
      await onComplete(workspaceName.trim())
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      setError(axiosErr?.response?.data?.error?.message ?? "Failed to create workspace. Please try again.")
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: "var(--text-xl)", fontWeight: 600, letterSpacing: "-0.02em" }}>
          Create your workspace
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))" }}>
          A workspace is where your boards and team live. You can rename it later.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <label
          htmlFor="workspace-name"
          style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink-2))" }}
        >
          Workspace name
        </label>
        <input
          id="workspace-name"
          type="text"
          value={workspaceName}
          onChange={(e) => {
            setWorkspaceName(e.target.value)
            if (error) setError("")
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={`${displayName.split(" ")[0] || "My"}'s Workspace`}
          autoFocus
          autoComplete="off"
          disabled={loading}
          style={{
            ...inputStyle,
            borderColor: error
              ? "oklch(var(--color-error))"
              : focused
                ? "oklch(var(--color-accent))"
                : "oklch(var(--color-border))",
            boxShadow: focused && !error ? "0 0 0 3px oklch(var(--color-accent-muted))" : "none",
            opacity: loading ? 0.6 : 1,
          }}
        />
        {error && (
          <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>{error}</span>
        )}
        <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
          You can invite teammates after setup.
        </span>
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          style={{ ...ghostBtn, flex: "0 0 auto", opacity: loading ? 0.5 : 1 }}
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = "oklch(var(--color-paper-3))" }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
        >
          Back
        </button>
        <button
          type="submit"
          disabled={workspaceName.trim().length === 0 || loading}
          style={{
            ...primaryBtn,
            flex: 1,
            opacity: workspaceName.trim().length === 0 || loading ? 0.5 : 1,
            cursor: workspaceName.trim().length === 0 || loading ? "not-allowed" : "pointer",
          }}
          onMouseEnter={(e) => { if (!loading && workspaceName.trim()) e.currentTarget.style.background = "oklch(var(--color-accent-hover))" }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "oklch(var(--color-accent))" }}
        >
          {loading ? "Creating…" : "Create workspace"}
        </button>
      </div>
    </form>
  )
}

// ── Main OnboardingPage ───────────────────────────────────────────────────────

export default function OnboardingPage() {
  const { user, setTokenAndUser } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [displayName, setDisplayName] = useState("")

  // Idiomatic React Router redirect — avoids calling navigate() in the render phase
  if (user?.onboardingCompleted) {
    return <Navigate to="/dashboard" replace />
  }

  const handleNameNext = (name: string) => {
    setDisplayName(name)
    setStep(1)
  }

  const handleComplete = async (workspaceName: string) => {
    // 1. Save the display name
    await usersApi.updateName(displayName)

    // 2. Create workspace — this marks onboardingCompleted = true server-side
    await workspacesApi.create({ name: workspaceName })

    // 3. Re-issue tokens via /refresh so the auth context gets a fresh, accurate user object.
    //    This avoids reconstructing the user manually and eliminates the accessToken! assertion.
    const data = await authApi.refresh()
    setTokenAndUser(data.accessToken, data.user)

    navigate("/dashboard", { replace: true })
  }

  return (
    <div style={pageWrap}>
      <div style={{ width: "100%", maxWidth: "440px", display: "flex", flexDirection: "column", gap: "24px" }}>
        <LogoMark />

        <div style={card}>
          {/* Step counter + progress */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))", fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Step {step + 1} of {TOTAL_STEPS}
            </span>
            <ProgressBar step={step} />
          </div>

          {/* Step content */}
          {step === 0 && <StepDisplayName onNext={handleNameNext} />}
          {step === 1 && (
            <StepCreateWorkspace
              displayName={displayName}
              onBack={() => setStep(0)}
              onComplete={handleComplete}
            />
          )}
        </div>

        <p style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))", textAlign: "center", margin: 0 }}>
          Need help?{" "}
          <a href="mailto:support@flowgrid.app" style={{ color: "oklch(var(--color-accent))", textDecoration: "none" }}>
            Contact support
          </a>
        </p>
      </div>
    </div>
  )
}
