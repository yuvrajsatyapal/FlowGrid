import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useWorkspaceStore } from "../../stores/workspaceStore"
import type { WorkspaceSummary } from "../../api/workspaces"

const CHEVRON_DOWN = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const CHECK = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M2 7l3.5 3.5L12 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

function WorkspaceInitials({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")

  // Deterministic color from name
  const hues = [220, 200, 240, 260, 280, 180, 160]
  const hue = hues[name.charCodeAt(0) % hues.length]

  return (
    <div
      style={{
        width: "28px",
        height: "28px",
        borderRadius: "6px",
        background: `oklch(52% 0.18 ${hue})`,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "0.6875rem",
        fontWeight: 600,
        letterSpacing: "0.02em",
        flexShrink: 0,
      }}
    >
      {initials || "W"}
    </div>
  )
}

export default function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, setActiveWorkspace } = useWorkspaceStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const handleSelect = (workspace: WorkspaceSummary) => {
    setActiveWorkspace(workspace)
    setOpen(false)
    navigate(`/${workspace.id}`)
  }

  if (!activeWorkspace) return null

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          width: "100%",
          padding: "6px 8px",
          borderRadius: "6px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          color: "oklch(var(--color-ink))",
          transition: "background var(--dur-fast) var(--ease-out)",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "oklch(var(--color-paper-3))" }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
      >
        <WorkspaceInitials name={activeWorkspace.name} />
        <span
          style={{
            flex: 1,
            textAlign: "left",
            fontSize: "var(--text-sm)",
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {activeWorkspace.name}
        </span>
        <span style={{ color: "oklch(var(--color-ink-3))", flexShrink: 0 }}>{CHEVRON_DOWN}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "oklch(var(--color-paper))",
            border: "1px solid oklch(var(--color-border))",
            borderRadius: "8px",
            boxShadow: "0 4px 16px oklch(0% 0 0 / 0.12)",
            zIndex: 50,
            padding: "4px",
            minWidth: "200px",
          }}
        >
          <p
            style={{
              margin: "0 0 2px",
              padding: "4px 8px",
              fontSize: "var(--text-xs)",
              color: "oklch(var(--color-ink-3))",
              fontWeight: 500,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            Workspaces
          </p>
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => handleSelect(ws)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "100%",
                padding: "6px 8px",
                borderRadius: "5px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "oklch(var(--color-ink))",
                textAlign: "left",
                transition: "background var(--dur-fast) var(--ease-out)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "oklch(var(--color-paper-2))" }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
            >
              <WorkspaceInitials name={ws.name} />
              <span
                style={{
                  flex: 1,
                  fontSize: "var(--text-sm)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {ws.name}
              </span>
              {ws.id === activeWorkspace.id && (
                <span style={{ color: "oklch(var(--color-accent))" }}>{CHECK}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
