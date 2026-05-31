export default function App() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-display)",
        background: "oklch(var(--color-paper))",
        color: "oklch(var(--color-ink))",
        gap: "12px",
      }}
    >
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <rect width="40" height="40" rx="8" fill="oklch(52% 0.22 260)" />
        <rect x="8" y="8" width="10" height="24" rx="2" fill="white" opacity="0.9" />
        <rect x="22" y="8" width="10" height="16" rx="2" fill="white" opacity="0.6" />
      </svg>
      <span style={{ fontSize: "1.25rem", fontWeight: 600, letterSpacing: "-0.02em" }}>
        FlowGrid
      </span>
      <span style={{ fontSize: "0.875rem", color: "oklch(var(--color-ink-2))" }}>
        Scaffold ready — auth and routing coming in Feature #3
      </span>
    </div>
  )
}
