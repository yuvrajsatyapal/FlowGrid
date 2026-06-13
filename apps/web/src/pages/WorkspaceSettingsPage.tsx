import { useEffect, useRef, useState, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useParams, useNavigate, Link } from "react-router-dom"
import { workspacesApi, type WorkspaceDetail } from "../api/workspaces"
import { useWorkspaceDetail } from "../features/workspace/queries/useWorkspaceDetail"
import { useWorkspaceList } from "../features/workspace/queries/useWorkspaceList"
import { updateWorkspaceInCache, removeWorkspaceFromCache } from "../features/workspace/queries/workspaceListCache"
import { workspaceKeys } from "../features/workspace/queries/keys"
import { useWindowWidth } from "../hooks/useWindowWidth"

// ── Constants ──────────────────────────────────────────────────────────────────

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

const COLOR_OPTIONS = ["blue", "teal", "purple", "orange", "pink", "yellow", "slate", "red"] as const

const COLOR_HEX: Record<string, string> = {
  blue: "#3b82f6", teal: "#10b981", purple: "#8b5cf6", orange: "#f97316",
  pink: "#ec4899", yellow: "#f59e0b", slate: "#64748b", red: "#ef4444",
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const sectionCard: React.CSSProperties = {
  border: "1px solid oklch(var(--color-border))",
  borderRadius: "var(--radius-card)",
  background: "oklch(var(--color-paper-2))",
  overflow: "hidden",
}

const sectionHeader: React.CSSProperties = {
  padding: "16px 20px",
  borderBottom: "1px solid oklch(var(--color-border))",
}

const sectionBody: React.CSSProperties = {
  padding: "20px",
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: "var(--radius-input)",
  border: "1px solid oklch(var(--color-border))",
  background: "oklch(var(--color-paper))",
  color: "oklch(var(--color-ink))",
  fontSize: "var(--text-sm)",
  fontFamily: "var(--font-body)",
  outline: "none",
  boxSizing: "border-box" as const,
}


const dangerBtn: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: "var(--radius-button)",
  border: "1px solid oklch(var(--color-error) / 0.5)",
  background: "transparent",
  color: "oklch(var(--color-error))",
  fontSize: "var(--text-sm)",
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "var(--font-body)",
  transition: "background 150ms ease, border-color 150ms ease",
}

const ghostBtn: React.CSSProperties = {
  padding: "5px 11px",
  borderRadius: "var(--radius-button)",
  border: "1px solid oklch(var(--color-border))",
  background: "transparent",
  color: "oklch(var(--color-ink-2))",
  fontSize: "var(--text-xs)",
  cursor: "pointer",
  fontFamily: "var(--font-body)",
}

const dangerGhostBtn: React.CSSProperties = {
  padding: "5px 11px",
  borderRadius: "var(--radius-button)",
  border: "1px solid oklch(var(--color-error) / 0.4)",
  background: "transparent",
  color: "oklch(var(--color-error))",
  fontSize: "var(--text-xs)",
  cursor: "pointer",
  fontFamily: "var(--font-body)",
}

type SaveStatus = "idle" | "saving" | "saved" | "error"

// ── Delete confirmation modal ──────────────────────────────────────────────────

function DeleteDialog({
  workspaceName,
  onConfirm,
  onCancel,
  loading,
}: {
  workspaceName: string
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  const [confirmText, setConfirmText] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const match = confirmText === workspaceName

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCancel() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onCancel])

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
      style={{
        position: "fixed", inset: 0,
        background: "oklch(0% 0 0 / 0.48)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 200, padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: "420px",
          background: "oklch(var(--color-paper))",
          borderRadius: "var(--radius-modal)",
          border: "1px solid oklch(var(--color-border))",
          boxShadow: "0 20px 60px oklch(0% 0 0 / 0.2)",
          padding: "28px 24px",
          display: "flex", flexDirection: "column", gap: "20px",
        }}
      >
        <div>
          <h2 style={{ margin: "0 0 8px", fontSize: "var(--text-base)", fontWeight: 600, color: "oklch(var(--color-ink))", fontFamily: "var(--font-display)" }}>
            Delete Workspace
          </h2>
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))", lineHeight: 1.55 }}>
            This action cannot be undone. All boards, lists, and cards will be permanently deleted.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={{ fontSize: "var(--text-xs)", fontWeight: 500, color: "oklch(var(--color-ink-2))" }}>
            Type <strong style={{ color: "oklch(var(--color-ink))" }}>"{workspaceName}"</strong> to confirm
          </label>
          <input
            ref={inputRef}
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && match && !loading) onConfirm() }}
            placeholder={workspaceName}
            style={{
              ...inputStyle,
              borderColor: confirmText && !match
                ? "oklch(var(--color-error))"
                : "oklch(var(--color-border))",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{ ...dangerBtn, border: "1px solid oklch(var(--color-border))", color: "oklch(var(--color-ink-2))" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!match || loading}
            style={{
              ...dangerBtn,
              background: match ? "oklch(0.50 0.20 25)" : "transparent",
              borderColor: match ? "oklch(0.50 0.20 25)" : "oklch(var(--color-error) / 0.4)",
              color: match ? "#fff" : "oklch(var(--color-error))",
              opacity: !match || loading ? 0.6 : 1,
              cursor: !match || loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Deleting…" : "Delete Workspace"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── WorkspaceSettingsPage ──────────────────────────────────────────────────────

export default function WorkspaceSettingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const isCompact = useWindowWidth() < 768
  const navigate = useNavigate()
  const qc = useQueryClient()
  const workspaces = useWorkspaceList().data ?? []

  // Server state: the workspace detail is owned by React Query (Phase 4A).
  const workspaceQuery = useWorkspaceDetail(workspaceId)
  const detail = workspaceQuery.data ?? null
  const loading = workspaceQuery.isLoading
  const loadError = workspaceQuery.isError ? ((workspaceQuery.error as Error).message || "Failed to load workspace") : ""

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedColor, setSelectedColor] = useState("blue")

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const [saveError, setSaveError] = useState("")

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError, setLogoError] = useState("")
  const [colorSaving, setColorSaving] = useState(false)

  const [nameFocused, setNameFocused] = useState(false)
  const [descFocused, setDescFocused] = useState(false)

  const logoFileInputRef = useRef<HTMLInputElement>(null)
  const savedValuesRef = useRef({ name: "", description: "" })
  const savedStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const colorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadedRef = useRef(false)

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  useEffect(() => () => {
    if (savedStatusTimerRef.current) clearTimeout(savedStatusTimerRef.current)
  }, [])

  // ── Seed the editable form draft from the query (once per workspace) ───────────
  // Server-state → editable-form synchronization (not data fetching). loadedRef
  // guards against re-seeding when the detail cache changes after a save.
  useEffect(() => {
    loadedRef.current = false
  }, [workspaceId])

  useEffect(() => {
    const ws = workspaceQuery.data
    if (!ws || loadedRef.current) return
    setName(ws.name)
    setDescription(ws.description ?? "")
    setSelectedColor(ws.color ?? "blue")
    savedValuesRef.current = { name: ws.name, description: ws.description ?? "" }
    loadedRef.current = true
  }, [workspaceQuery.data])

  // ── Autosave ─────────────────────────────────────────────────────────────────
  const performSave = useCallback(
    async (n: string, d: string) => {
      if (!workspaceId) return
      setSaveStatus("saving")
      setSaveError("")
      try {
        const updated = await workspacesApi.update(workspaceId, {
          name: n.trim(),
          description: d.trim() || null,
        })
        qc.setQueryData<WorkspaceDetail>(workspaceKeys.detail(workspaceId), (prev) =>
          prev ? { ...prev, name: updated.name, description: updated.description } : prev,
        )
        setDescription(updated.description ?? "")
        updateWorkspaceInCache(qc, workspaceId, { name: updated.name })
        savedValuesRef.current = { name: updated.name, description: updated.description ?? "" }
        setSaveStatus("saved")
        if (savedStatusTimerRef.current) clearTimeout(savedStatusTimerRef.current)
        savedStatusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2500)
      } catch (err: unknown) {
        setSaveStatus("error")
        setSaveError((err as Error).message || "Failed to save")
      }
    },
    [workspaceId, qc],
  )

  // Debounce: 700 ms after last keystroke
  useEffect(() => {
    if (!loadedRef.current) return
    const trimmedName = name.trim()
    const trimmedDesc = description.trim()
    if (
      trimmedName === savedValuesRef.current.name &&
      trimmedDesc === savedValuesRef.current.description
    ) return
    if (!trimmedName) return

    const timer = setTimeout(() => void performSave(name, description), 700)
    return () => clearTimeout(timer)
  }, [name, description, performSave])

  const canEdit = detail?.role === "OWNER" || detail?.role === "ADMIN"
  const isOwner = detail?.role === "OWNER"

  const wsInitials =
    (name || detail?.name || "W")
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "W"

  // ── Logo handlers ────────────────────────────────────────────────────────────
  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !workspaceId) return
    e.target.value = ""
    setLogoUploading(true)
    setLogoError("")
    try {
      const updated = await workspacesApi.uploadLogo(workspaceId, file)
      qc.setQueryData<WorkspaceDetail>(workspaceKeys.detail(workspaceId), (prev) => (prev ? { ...prev, logoUrl: updated.logoUrl } : prev))
      updateWorkspaceInCache(qc, workspaceId, { logoUrl: updated.logoUrl ?? undefined })
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      setLogoError(axiosErr?.response?.data?.error?.message ?? "Failed to upload logo")
    } finally {
      setLogoUploading(false)
    }
  }

  const handleRemoveLogo = async () => {
    if (!workspaceId) return
    setLogoUploading(true)
    setLogoError("")
    try {
      const updated = await workspacesApi.removeLogo(workspaceId)
      qc.setQueryData<WorkspaceDetail>(workspaceKeys.detail(workspaceId), (prev) => (prev ? { ...prev, logoUrl: updated.logoUrl } : prev))
      updateWorkspaceInCache(qc, workspaceId, { logoUrl: updated.logoUrl ?? undefined })
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      setLogoError(axiosErr?.response?.data?.error?.message ?? "Failed to remove logo")
    } finally {
      setLogoUploading(false)
    }
  }

  // ── Color handler ─────────────────────────────────────────────────────────────
  const commitColor = useCallback(async (color: string, prevColor: string) => {
    if (!workspaceId) return
    setColorSaving(true)
    try {
      await workspacesApi.update(workspaceId, { color })
      setSaveStatus("saved")
      if (savedStatusTimerRef.current) clearTimeout(savedStatusTimerRef.current)
      savedStatusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000)
    } catch {
      setSelectedColor(prevColor)
      updateWorkspaceInCache(qc, workspaceId, { color: prevColor })
    } finally {
      setColorSaving(false)
    }
  }, [workspaceId, qc])

  const handleSaveColor = useCallback((color: string) => {
    if (!workspaceId) return
    const prevColor = selectedColor
    setSelectedColor(color)
    updateWorkspaceInCache(qc, workspaceId, { color })
    void commitColor(color, prevColor)
  }, [workspaceId, selectedColor, qc, commitColor])

  const handleCustomColorChange = useCallback((color: string) => {
    if (!workspaceId) return
    const prevColor = selectedColor
    setSelectedColor(color)
    updateWorkspaceInCache(qc, workspaceId, { color })
    if (colorDebounceRef.current) clearTimeout(colorDebounceRef.current)
    colorDebounceRef.current = setTimeout(() => void commitColor(color, prevColor), 500)
  }, [workspaceId, selectedColor, qc, commitColor])

  // ── Delete handler ────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!workspaceId) return
    setDeleting(true)
    try {
      await workspacesApi.deleteWorkspace(workspaceId)
      removeWorkspaceFromCache(qc, workspaceId)
      const remaining = workspaces.filter((w) => w.id !== workspaceId)
      navigate(remaining.length > 0 ? `/${remaining[0].id}` : "/onboarding", { replace: true })
    } catch (err: unknown) {
      setSaveError((err as Error).message || "Failed to delete workspace")
      setDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  // ── Loading / error ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="animate-pulse" style={{ color: "oklch(var(--color-ink-2))", fontSize: "var(--text-sm)" }}>Loading…</span>
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={{ padding: "32px 36px" }}>
        <p style={{ color: "oklch(var(--color-error))", fontSize: "var(--text-sm)" }}>{loadError}</p>
      </div>
    )
  }

  return (
    <div style={{ color: "oklch(var(--color-ink))", fontFamily: "var(--font-body)" }}>

      {/* ── Sticky top bar ─────────────────────────────────────────────────── */}
      <div
        style={{
          position: "sticky", top: 0, zIndex: 40,
          background: "oklch(var(--color-paper-2))",
          borderBottom: "1px solid oklch(var(--color-border))",
          padding: isCompact ? "10px 16px" : "10px 36px",
          display: "flex", alignItems: "center", gap: "12px",
        }}
      >
        {/* Breadcrumb */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "6px", fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-3))", whiteSpace: "nowrap" }}>
          <Link to={`/${workspaceId}`} style={{ color: "oklch(var(--color-ink-3))", textDecoration: "none", flexShrink: 0 }}>
            FlowGrid
          </Link>
          <span style={{ flexShrink: 0 }}>›</span>
          <span style={{ color: "oklch(var(--color-ink-2))", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Workspace Settings</span>
        </div>

        {/* Save status */}
        {saveStatus !== "idle" && (
          <span
            aria-live="polite"
            style={{
              fontSize: "var(--text-xs)", fontWeight: 500,
              color: saveStatus === "error"
                ? "oklch(var(--color-error))"
                : saveStatus === "saved"
                ? "oklch(0.55 0.13 152)"
                : "oklch(var(--color-ink-3))",
            }}
          >
            {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : saveError}
          </span>
        )}

        {/* Delete Workspace — OWNER only */}
        {isOwner && (
          <button
            onClick={() => setShowDeleteDialog(true)}
            style={{
              ...dangerBtn,
              flexShrink: 0,
              whiteSpace: "nowrap",
              ...(isCompact ? { padding: "5px 10px", fontSize: "var(--text-xs)" } : {}),
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "oklch(var(--color-error))"
              e.currentTarget.style.borderColor = "oklch(var(--color-error))"
              e.currentTarget.style.color = "#fff"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent"
              e.currentTarget.style.borderColor = "oklch(var(--color-error) / 0.5)"
              e.currentTarget.style.color = "oklch(var(--color-error))"
            }}
          >
            Delete Workspace
          </button>
        )}
      </div>

      <div style={{ padding: "32px 36px" }}>

        {/* Page title */}
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ margin: "0 0 6px", fontSize: "var(--text-2xl)", fontWeight: 700, letterSpacing: "var(--display-tracking)", fontFamily: "var(--font-display)" }}>
            {detail?.name ?? "Workspace Settings"}
          </h1>
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))" }}>
            Manage your workspace identity, general settings, and operational preferences.
          </p>
        </div>

        {/* Two-column layout */}
        <div className="settings-grid" style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "24px", alignItems: "start" }}>

          {/* ── Left column ──────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

            {/* Identity & Branding */}
            {canEdit && (
              <div style={sectionCard}>
                <div style={sectionBody}>

                  {/* Logo upload */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", marginBottom: "20px" }}>
                    {/* Badge — clickable to upload */}
                    <div
                      style={{
                        width: 56, height: 56, borderRadius: "14px",
                        background: detail?.logoUrl ? "transparent" : (COLOR_GRADIENTS[selectedColor] ?? selectedColor),
                        flexShrink: 0, overflow: "hidden",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: "2px solid oklch(var(--color-border))",
                        cursor: logoUploading ? "default" : "pointer",
                        opacity: logoUploading ? 0.6 : 1,
                      }}
                      onClick={() => !logoUploading && logoFileInputRef.current?.click()}
                      title="Click to change logo"
                    >
                      {detail?.logoUrl ? (
                        <img src={detail.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <span style={{ fontSize: "20px", fontWeight: 700, color: "#fff" }}>{wsInitials}</span>
                      )}
                    </div>

                    {/* Buttons + hint */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => logoFileInputRef.current?.click()}
                          disabled={logoUploading}
                          style={{ ...ghostBtn, opacity: logoUploading ? 0.5 : 1, cursor: logoUploading ? "not-allowed" : "pointer" }}
                        >
                          {logoUploading ? "Uploading…" : "Upload logo"}
                        </button>
                        {detail?.logoUrl && (
                          <button
                            type="button"
                            onClick={handleRemoveLogo}
                            disabled={logoUploading}
                            style={{ ...dangerGhostBtn, opacity: logoUploading ? 0.5 : 1, cursor: logoUploading ? "not-allowed" : "pointer" }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                        PNG or JPG, max 2 MB
                      </p>
                      {logoError && (
                        <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>{logoError}</p>
                      )}
                    </div>

                    <input
                      ref={logoFileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
                      style={{ display: "none" }}
                      onChange={handleLogoFileChange}
                    />
                  </div>

                  {/* Accent Color */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", marginBottom: "4px" }}>
                      <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink-2))" }}>Accent Color</p>
                    </div>
                    <p style={{ margin: "0 0 10px", fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                      Used when no logo is set.
                    </p>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      {COLOR_OPTIONS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          title={c}
                          onClick={() => handleSaveColor(c)}
                          disabled={colorSaving}
                          style={{
                            width: 28, height: 28, borderRadius: "7px",
                            background: COLOR_GRADIENTS[c],
                            border: selectedColor === c ? "2.5px solid oklch(var(--color-ink))" : "2px solid transparent",
                            cursor: colorSaving ? "not-allowed" : "pointer",
                            transform: selectedColor === c ? "scale(1.15)" : "scale(1)",
                            transition: "transform 0.1s ease, border 0.1s ease",
                            padding: 0,
                          }}
                        />
                      ))}
                      {/* Custom color picker */}
                      <label
                        title="Custom color"
                        style={{
                          position: "relative",
                          width: 28, height: 28, borderRadius: "7px",
                          border: selectedColor.startsWith("#") && !Object.values(COLOR_HEX).includes(selectedColor)
                            ? "2.5px solid oklch(var(--color-ink))"
                            : "2px solid oklch(var(--color-border))",
                          cursor: colorSaving ? "not-allowed" : "pointer",
                          transform: selectedColor.startsWith("#") && !Object.values(COLOR_HEX).includes(selectedColor)
                            ? "scale(1.15)" : "scale(1)",
                          transition: "transform 0.1s ease, border 0.1s ease",
                          overflow: "hidden",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: selectedColor.startsWith("#") && !Object.values(COLOR_HEX).includes(selectedColor)
                            ? selectedColor
                            : "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
                          flexShrink: 0,
                        }}
                      >
                        <input
                          type="color"
                          disabled={colorSaving}
                          value={
                            selectedColor.startsWith("#") && !Object.values(COLOR_HEX).includes(selectedColor)
                              ? selectedColor
                              : "#ffffff"
                          }
                          onChange={(e) => handleCustomColorChange(e.target.value)}
                          style={{
                            position: "absolute", opacity: 0,
                            width: "100%", height: "100%",
                            cursor: colorSaving ? "not-allowed" : "pointer",
                            padding: 0, border: 0,
                          }}
                        />
                      </label>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* General Information */}
            <div style={sectionCard}>
              <div style={sectionHeader}>
                <h2 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600 }}>General Information</h2>
              </div>
              <div style={sectionBody}>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

                  {/* Workspace Name */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label htmlFor="ws-name" style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink-2))" }}>
                      Workspace Name
                    </label>
                    <input
                      id="ws-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onFocus={() => setNameFocused(true)}
                      onBlur={() => setNameFocused(false)}
                      disabled={!canEdit}
                      maxLength={100}
                      style={{
                        ...inputStyle,
                        borderColor: nameFocused ? "oklch(var(--color-accent))" : "oklch(var(--color-border))",
                        boxShadow: nameFocused ? "0 0 0 3px oklch(var(--color-accent-muted))" : "none",
                        opacity: !canEdit ? 0.6 : 1,
                      }}
                    />
                    {name.trim().length === 0 && (
                      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>
                        Workspace name is required.
                      </p>
                    )}
                  </div>

                  {/* Workspace URL (read-only) */}
                  {/* <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label htmlFor="ws-slug" style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink-2))" }}>
                      Workspace URL
                    </label>
                    <div style={{ display: "flex", alignItems: "center", borderRadius: "var(--radius-input)", border: "1px solid oklch(var(--color-border))", background: "oklch(var(--color-paper-3))", overflow: "hidden" }}>
                      <span style={{ padding: "8px 10px", fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-3))", borderRight: "1px solid oklch(var(--color-border))", whiteSpace: "nowrap", userSelect: "none", flexShrink: 0 }}>
                        flowgrid.app/
                      </span>
                      <input
                        id="ws-slug"
                        type="text"
                        readOnly
                        value={detail?.slug ?? ""}
                        style={{ ...inputStyle, border: "none", background: "transparent", borderRadius: 0, flex: 1, cursor: "default", color: "oklch(var(--color-ink-2))" }}
                      />
                    </div>
                    <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                      URL slug cannot be changed after workspace creation.
                    </p>
                  </div> */}

                  {/* Description */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label htmlFor="ws-description" style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink-2))" }}>
                      Description <span style={{ fontWeight: 400, color: "oklch(var(--color-ink-3))" }}>(optional)</span>
                    </label>
                    <textarea
                      id="ws-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      onFocus={() => setDescFocused(true)}
                      onBlur={() => setDescFocused(false)}
                      disabled={!canEdit}
                      rows={3}
                      maxLength={300}
                      placeholder="What does this workspace do?"
                      style={{
                        ...inputStyle,
                        resize: "vertical",
                        borderColor: descFocused ? "oklch(var(--color-accent))" : "oklch(var(--color-border))",
                        boxShadow: descFocused ? "0 0 0 3px oklch(var(--color-accent-muted))" : "none",
                        opacity: !canEdit ? 0.6 : 1,
                      }}
                    />
                  </div>

                  {saveStatus === "error" && (
                    <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>{saveError}</p>
                  )}

                </div>
              </div>
            </div>

          </div>{/* end left column */}

          {/* ── Right column: Preview ─────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={sectionCard}>
              <div style={sectionHeader}>
                <h2 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600 }}>Preview</h2>
              </div>
              <div style={{ ...sectionBody, display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
                {/* Workspace badge */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "12px", background: "oklch(var(--color-paper-3))", borderRadius: "var(--radius-card)" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "8px", background: detail?.logoUrl ? "transparent" : (COLOR_GRADIENTS[selectedColor] ?? selectedColor), flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {detail?.logoUrl ? (
                      <img src={detail.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "#fff" }}>{wsInitials}</span>
                    )}
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600, color: "oklch(var(--color-ink))" }}>{name || detail?.name}</p>
                    <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>Workspace</p>
                  </div>
                </div>

                {/* Meta */}
                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {[
                    {
                      label: "Created",
                      value: detail?.createdAt
                        ? new Date(detail.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
                        : "—",
                    },
                    { label: "Members", value: String(detail?.memberCount ?? "—") },
                    { label: "Boards",  value: String(detail?.boardCount  ?? "—") },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>{label}</span>
                      <span style={{ fontSize: "var(--text-xs)", fontWeight: 500, color: "oklch(var(--color-ink-2))" }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>{/* end grid */}
      </div>{/* end padding */}

      {/* ── Delete modal ───────────────────────────────────────────────────── */}
      {showDeleteDialog && detail && (
        <DeleteDialog
          workspaceName={detail.name}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteDialog(false)}
          loading={deleting}
        />
      )}
    </div>
  )
}
