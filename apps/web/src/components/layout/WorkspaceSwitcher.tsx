import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { workspacesApi } from "../../api/workspaces"
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

const COLOR_GRADIENTS: Record<string, string> = {
  blue:   "linear-gradient(135deg, #3b82f6, #2563eb)",
  teal:   "linear-gradient(135deg, #10b981, #06b6d4)",
  purple: "linear-gradient(135deg, #8b5cf6, #6366f1)",
  orange: "linear-gradient(135deg, #f97316, #ef4444)",
  pink:   "linear-gradient(135deg, #ec4899, #8b5cf6)",
  yellow: "linear-gradient(135deg, #f59e0b, #eab308)",
  slate:  "linear-gradient(135deg, #64748b, #475569)",
  red:    "linear-gradient(135deg, #ef4444, #b91c1c)",
}

function WorkspaceBadge({ name, logoUrl, color }: { name: string; logoUrl?: string | null; color?: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")

  const background = COLOR_GRADIENTS[color ?? "blue"] ?? color ?? COLOR_GRADIENTS.blue

  return (
    <div
      style={{
        width: "28px",
        height: "28px",
        borderRadius: "6px",
        background: logoUrl ? "transparent" : background,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "0.6875rem",
        fontWeight: 600,
        letterSpacing: "0.02em",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        initials || "W"
      )}
    </div>
  )
}

export default function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, setActiveWorkspace, addWorkspace } = useWorkspaceStore()
  const [open, setOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState("")
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  // Close dropdown on outside click (not the modal — modal has its own overlay)
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  // Focus input when modal opens
  useEffect(() => {
    if (showCreate) setTimeout(() => inputRef.current?.focus(), 50)
  }, [showCreate])

  const handleSelect = (workspace: WorkspaceSummary) => {
    setActiveWorkspace(workspace)
    setOpen(false)
    navigate(`/${workspace.id}`)
  }

  const openCreate = () => {
    setOpen(false)
    setNewName("")
    setCreateError("")
    setShowCreate(true)
  }

  const closeCreate = () => {
    setShowCreate(false)
    setNewName("")
    setCreateError("")
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (name.length < 2) { setCreateError("Name must be at least 2 characters."); return }
    setCreating(true)
    setCreateError("")
    try {
      const workspace = await workspacesApi.create({ name })
      addWorkspace(workspace)
      setActiveWorkspace(workspace)
      closeCreate()
      navigate(`/${workspace.id}`)
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      setCreateError(axiosErr?.response?.data?.error?.message ?? "Failed to create workspace.")
    } finally {
      setCreating(false)
    }
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
        <WorkspaceBadge name={activeWorkspace.name} logoUrl={activeWorkspace.logoUrl} color={activeWorkspace.color} />
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
              <WorkspaceBadge name={ws.name} logoUrl={ws.logoUrl} color={ws.color} />
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

          {/* Divider + Add workspace */}
          <div style={{ height: "1px", background: "oklch(var(--color-border))", margin: "4px 0" }} />
          <button
            onClick={openCreate}
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
              color: "oklch(var(--color-ink-2))",
              textAlign: "left",
              transition: "background var(--dur-fast) var(--ease-out)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "oklch(var(--color-paper-2))"; e.currentTarget.style.color = "oklch(var(--color-ink))" }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "oklch(var(--color-ink-2))" }}
          >
            {/* Plus icon */}
            <div style={{
              width: "28px", height: "28px", borderRadius: "6px", flexShrink: 0,
              border: "1.5px dashed oklch(var(--color-border))",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "oklch(var(--color-ink-3))",
            }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <span style={{ fontSize: "var(--text-sm)" }}>Add workspace</span>
          </button>
        </div>
      )}

      {/* Create workspace modal */}
      {showCreate && (
        <div
          onClick={closeCreate}
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "oklch(0% 0 0 / 0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "24px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: "400px",
              background: "oklch(var(--color-paper))",
              border: "1px solid oklch(var(--color-border))",
              borderRadius: "var(--radius-modal, 12px)",
              padding: "24px",
              display: "flex", flexDirection: "column", gap: "16px",
              fontFamily: "var(--font-body)",
            }}
          >
            <div>
              <h2 style={{ margin: "0 0 4px", fontSize: "var(--text-lg)", fontWeight: 600, fontFamily: "var(--font-display)", color: "oklch(var(--color-ink))" }}>
                New workspace
              </h2>
              <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))" }}>
                A workspace holds your boards and team members.
              </p>
            </div>

            <form onSubmit={(e) => { void handleCreate(e) }} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label htmlFor="new-ws-name" style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink))" }}>
                  Workspace name
                </label>
                <input
                  ref={inputRef}
                  id="new-ws-name"
                  type="text"
                  placeholder="e.g. Acme Design Team"
                  value={newName}
                  onChange={(e) => { setNewName(e.target.value); setCreateError("") }}
                  maxLength={80}
                  disabled={creating}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--radius-input, 6px)",
                    border: createError ? "1px solid oklch(var(--color-error))" : "1px solid oklch(var(--color-border))",
                    background: "oklch(var(--color-paper-2))",
                    color: "oklch(var(--color-ink))",
                    fontSize: "var(--text-sm)",
                    outline: "none",
                    width: "100%",
                    boxSizing: "border-box" as const,
                  }}
                />
                {createError && (
                  <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>{createError}</p>
                )}
              </div>

              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={closeCreate}
                  disabled={creating}
                  style={{
                    padding: "8px 16px", borderRadius: "var(--radius-button, 6px)",
                    border: "1px solid oklch(var(--color-border))",
                    background: "transparent", color: "oklch(var(--color-ink-2))",
                    fontSize: "var(--text-sm)", cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || newName.trim().length < 2}
                  style={{
                    padding: "8px 16px", borderRadius: "var(--radius-button, 6px)",
                    border: "none",
                    background: "oklch(var(--color-accent))", color: "#fff",
                    fontSize: "var(--text-sm)", fontWeight: 500, cursor: "pointer",
                    opacity: creating || newName.trim().length < 2 ? 0.6 : 1,
                  }}
                >
                  {creating ? "Creating…" : "Create workspace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
