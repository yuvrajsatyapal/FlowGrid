import { useEffect, useRef, useState } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { useWorkspaceStore } from "../stores/workspaceStore"
import { workspacesApi, type WorkspaceDetail } from "../api/workspaces"

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
  outline: "none",
  boxSizing: "border-box",
}

const primaryBtn: React.CSSProperties = {
  padding: "8px 18px",
  borderRadius: "var(--radius-button)",
  border: "none",
  background: "oklch(var(--color-accent))",
  color: "#fff",
  fontSize: "var(--text-sm)",
  fontWeight: 500,
  cursor: "pointer",
  transition: "background var(--dur-fast)",
}

const dangerBtn: React.CSSProperties = {
  padding: "8px 18px",
  borderRadius: "var(--radius-button)",
  border: "1px solid oklch(var(--color-error))",
  background: "transparent",
  color: "oklch(var(--color-error))",
  fontSize: "var(--text-sm)",
  fontWeight: 500,
  cursor: "pointer",
  transition: "background var(--dur-fast), color var(--dur-fast)",
}

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

// ── Delete confirmation dialog ─────────────────────────────────────────────────

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
  const match = confirmText === workspaceName

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(0% 0 0 / 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: "24px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "oklch(var(--color-paper))",
          borderRadius: "var(--radius-modal)",
          border: "1px solid oklch(var(--color-border))",
          padding: "28px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "var(--text-base)", fontWeight: 600 }}>
          Delete workspace
        </h2>
        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))", lineHeight: 1.5 }}>
          This will permanently delete <strong>{workspaceName}</strong> and all its boards, lists,
          and cards. This action cannot be undone.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-2))", fontWeight: 500 }}>
            Type <strong>{workspaceName}</strong> to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={workspaceName}
            autoFocus
            style={{
              ...inputStyle,
              borderColor: confirmText && !match ? "oklch(var(--color-error))" : "oklch(var(--color-border))",
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
              background: match ? "oklch(var(--color-error))" : "transparent",
              color: match ? "#fff" : "oklch(var(--color-error))",
              opacity: !match || loading ? 0.6 : 1,
              cursor: !match || loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Deleting…" : "Delete workspace"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── WorkspaceSettingsPage ──────────────────────────────────────────────────────

export default function WorkspaceSettingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const { updateWorkspace, removeWorkspace, workspaces } = useWorkspaceStore()

  const [detail, setDetail] = useState<WorkspaceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")

  // Rename form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Delete state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  // Identity state
  const logoFileInputRef = useRef<HTMLInputElement>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError, setLogoError] = useState("")
  const [selectedColor, setSelectedColor] = useState<string>(detail?.color ?? "blue")
  const [colorSaving, setColorSaving] = useState(false)
  const [colorSaveSuccess, setColorSaveSuccess] = useState(false)

  const [nameFocused, setNameFocused] = useState(false)
  const [descFocused, setDescFocused] = useState(false)
  const saveSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const actionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!actionsOpen) return
    function close(e: MouseEvent) { if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) setActionsOpen(false) }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [actionsOpen])

  function handleCancel() {
    if (!detail) return
    setName(detail.name)
    setDescription(detail.description ?? "")
    setSaveError("")
    setSaveSuccess(false)
  }

  useEffect(() => () => {
    if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current)
  }, [])

  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    workspacesApi
      .getOne(workspaceId)
      .then((ws) => {
        setDetail(ws)
        setName(ws.name)
        setDescription(ws.description ?? "")
        setSelectedColor(ws.color ?? "blue")
      })
      .catch((err: Error) => setLoadError(err.message || "Failed to load workspace"))
      .finally(() => setLoading(false))
  }, [workspaceId])

  const isOwner = detail?.role === "OWNER"
  const canEdit = detail?.role === "OWNER" || detail?.role === "ADMIN"

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !workspaceId) return
    e.target.value = ""
    setLogoUploading(true)
    setLogoError("")
    try {
      const updated = await workspacesApi.uploadLogo(workspaceId, file)
      setDetail((prev) => prev ? { ...prev, logoUrl: updated.logoUrl } : prev)
      updateWorkspace(workspaceId, { logoUrl: updated.logoUrl ?? undefined })
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
      setDetail((prev) => prev ? { ...prev, logoUrl: updated.logoUrl } : prev)
      updateWorkspace(workspaceId, { logoUrl: updated.logoUrl ?? undefined })
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      setLogoError(axiosErr?.response?.data?.error?.message ?? "Failed to remove logo")
    } finally {
      setLogoUploading(false)
    }
  }

  const handleSaveColor = async (color: string) => {
    if (!workspaceId) return
    setSelectedColor(color)
    setColorSaving(true)
    setColorSaveSuccess(false)
    try {
      await workspacesApi.update(workspaceId, { color })
      updateWorkspace(workspaceId, { color })
      setColorSaveSuccess(true)
      setTimeout(() => setColorSaveSuccess(false), 2000)
    } catch {
      // color reverts on next load — no extra error UI needed
    } finally {
      setColorSaving(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!workspaceId) return
    setSaving(true)
    setSaveError("")
    setSaveSuccess(false)
    try {
      // Send null explicitly to allow clearing the description field
      const updated = await workspacesApi.update(workspaceId, {
        name: name.trim(),
        description: description.trim() || null,
      })
      setDetail((prev) =>
        prev ? { ...prev, name: updated.name, description: updated.description } : prev
      )
      // Sync form field from server response so the textarea reflects what was actually saved
      setDescription(updated.description ?? "")
      updateWorkspace(workspaceId, { name: updated.name })
      setSaveSuccess(true)
      if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current)
      saveSuccessTimerRef.current = setTimeout(() => setSaveSuccess(false), 2500)
    } catch (err: unknown) {
      const e = err as Error
      setSaveError(e.message || "Failed to save changes")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!workspaceId) return
    setDeleting(true)
    setDeleteError("")
    try {
      await workspacesApi.deleteWorkspace(workspaceId)
      removeWorkspace(workspaceId)
      const remaining = workspaces.filter((w) => w.id !== workspaceId)
      if (remaining.length > 0) {
        navigate(`/${remaining[0].id}`, { replace: true })
      } else {
        navigate("/onboarding", { replace: true })
      }
    } catch (err: unknown) {
      const e = err as Error
      setDeleteError(e.message || "Failed to delete workspace")
      setDeleting(false)
      setShowDeleteDialog(false)
    }
  }

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

  const COLOR_HEX: Record<string, string> = {
    blue: "#3b82f6", teal: "#10b981", purple: "#8b5cf6", orange: "#f97316",
    pink: "#ec4899", yellow: "#f59e0b", slate: "#64748b", red: "#ef4444",
  }

  const wsInitials = (detail?.name ?? "W").split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "W"

  return (
    <div style={{ color: "oklch(var(--color-ink))", fontFamily: "var(--font-body)" }}>

      {/* ── Sticky top action bar ── */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          background: "oklch(var(--color-paper-2))",
          borderBottom: "1px solid oklch(var(--color-border))",
          padding: "10px 36px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-3))" }}>
          <Link to={`/${workspaceId}`} style={{ color: "oklch(var(--color-ink-3))", textDecoration: "none" }}>
            FlowGrid
          </Link>
          <span>›</span>
          <span style={{ color: "oklch(var(--color-ink-2))", fontWeight: 500 }}>Workspace Settings</span>
          {/* Live badge */}
          <span style={{ display: "flex", alignItems: "center", gap: "4px", marginLeft: "6px", fontSize: "0.625rem", fontWeight: 700, color: "oklch(var(--color-success))" }}>
            <span className="blip" style={{ width: 6, height: 6, borderRadius: "50%", background: "oklch(var(--color-success))", display: "inline-block" }} />
            Live
          </span>
        </div>

        {/* Action buttons */}
        <button
          type="button"
          onClick={handleCancel}
          style={{ padding: "7px 14px", borderRadius: "var(--radius-button)", border: "1px solid oklch(var(--color-border))", background: "transparent", color: "oklch(var(--color-ink-2))", fontSize: "var(--text-sm)", cursor: "pointer", fontFamily: "var(--font-body)" }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => formRef.current?.requestSubmit()}
          disabled={saving || name.trim().length === 0}
          style={{ padding: "7px 14px", borderRadius: "var(--radius-button)", border: "none", background: "oklch(var(--color-accent))", color: "#fff", fontSize: "var(--text-sm)", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", fontFamily: "var(--font-body)", opacity: saving ? 0.7 : 1 }}
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      <div style={{ padding: "32px 36px" }}>
        {/* ── Title + Actions ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "28px", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: 700, letterSpacing: "var(--display-tracking)", fontFamily: "var(--font-display)" }}>
              {detail?.name ?? "Workspace Settings"}
            </h1>
            <p style={{ margin: "6px 0 0", fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))" }}>
              Manage your workspace identity, general settings, and operational preferences.
            </p>
          </div>
          {/* Actions dropdown */}
          <div ref={actionsRef} style={{ position: "relative", flexShrink: 0 }}>
            <button
              onClick={() => setActionsOpen((v) => !v)}
              style={{ padding: "7px 14px", borderRadius: "var(--radius-button)", border: "1px solid oklch(var(--color-border))", background: "oklch(var(--color-paper-2))", color: "oklch(var(--color-ink-2))", fontSize: "var(--text-sm)", cursor: "pointer", fontFamily: "var(--font-body)", display: "flex", alignItems: "center", gap: "6px" }}
            >
              Actions
              <span style={{ fontSize: "10px" }}>▾</span>
            </button>
            {actionsOpen && (
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "oklch(var(--color-paper-2))", border: "1px solid oklch(var(--color-border))", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-pop)", minWidth: 160, zIndex: 50, overflow: "hidden" }}>
                {isOwner && (
                  <button
                    onClick={() => { setActionsOpen(false); setShowDeleteDialog(true) }}
                    style={{ all: "unset", display: "block", width: "100%", padding: "9px 14px", fontSize: "var(--text-sm)", color: "oklch(var(--color-error))", cursor: "pointer", boxSizing: "border-box", fontFamily: "var(--font-body)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "oklch(var(--color-paper-3))" }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent" }}
                  >
                    Delete workspace
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Two-column layout ── */}
        <div className="settings-grid" style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "24px", alignItems: "start" }}>
          {/* Left column: forms */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

            {/* Identity & Branding */}
            {canEdit && (
              <div style={sectionCard}>
                <div style={{ ...sectionHeader, display: "flex", alignItems: "center", gap: "8px" }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ color: "oklch(var(--color-ink-3))" }}>
                    <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M7 1.5v1M7 11.5v1M1.5 7h1M11.5 7h1M3.3 3.3l.7.7M10 10l.7.7M10.7 3.3l-.7.7M4 10l-.7.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  <h2 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600 }}>Identity &amp; Branding</h2>
                </div>
                <div style={sectionBody}>
                  {/* Logo upload */}
                  <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
                    <div
                      style={{ width: 52, height: 52, borderRadius: "10px", background: detail?.logoUrl ? "transparent" : (COLOR_GRADIENTS[detail?.color ?? "blue"] ?? COLOR_GRADIENTS.blue), flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", cursor: logoUploading ? "default" : "pointer", opacity: logoUploading ? 0.6 : 1, border: "2px solid oklch(var(--color-border))" }}
                      onClick={() => !logoUploading && logoFileInputRef.current?.click()}
                      title="Click to change logo"
                    >
                      {detail?.logoUrl ? (
                        <img src={detail.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <span style={{ fontSize: "16px", fontWeight: 700, color: "#fff" }}>{wsInitials}</span>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button type="button" onClick={() => logoFileInputRef.current?.click()} disabled={logoUploading}
                          style={{ ...primaryBtn, opacity: logoUploading ? 0.5 : 1, cursor: logoUploading ? "not-allowed" : "pointer" }}
                          onMouseEnter={(e) => { if (!logoUploading) e.currentTarget.style.background = "oklch(var(--color-accent-hover))" }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "oklch(var(--color-accent))" }}>
                          {logoUploading ? "Uploading…" : "Upload Image"}
                        </button>
                        {detail?.logoUrl && (
                          <button type="button" onClick={handleRemoveLogo} disabled={logoUploading}
                            style={{ ...dangerBtn, opacity: logoUploading ? 0.5 : 1, cursor: logoUploading ? "not-allowed" : "pointer" }}
                            onMouseEnter={(e) => { if (!logoUploading) { e.currentTarget.style.background = "oklch(var(--color-error))"; e.currentTarget.style.color = "#fff" } }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "oklch(var(--color-error))" }}>
                            Remove
                          </button>
                        )}
                      </div>
                      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>PNG or JPG, max 2 MB. Used in the workspace badge.</p>
                      {logoError && <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>{logoError}</p>}
                    </div>
                    <input ref={logoFileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif" style={{ display: "none" }} onChange={handleLogoFileChange} />
                  </div>

                  {/* Accent Color */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                      <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink-2))" }}>Accent Color</p>
                      <span style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-mono)", color: "oklch(var(--color-ink-3))", letterSpacing: "0.04em" }}>
                        {COLOR_HEX[selectedColor] ?? ""}
                      </span>
                    </div>
                    <p style={{ margin: "0 0 10px", fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>Used when no logo is set.</p>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {COLOR_OPTIONS.map((c) => (
                        <button key={c} type="button" title={c} onClick={() => handleSaveColor(c)} disabled={colorSaving}
                          style={{ width: 28, height: 28, borderRadius: "7px", background: COLOR_GRADIENTS[c], border: selectedColor === c ? "2.5px solid oklch(var(--color-ink))" : "2px solid transparent", cursor: colorSaving ? "not-allowed" : "pointer", transform: selectedColor === c ? "scale(1.15)" : "scale(1)", transition: "transform 0.1s, border 0.1s", padding: 0 }} />
                      ))}
                    </div>
                    {colorSaveSuccess && <p style={{ margin: "8px 0 0", fontSize: "var(--text-xs)", color: "oklch(var(--color-success))" }}>Color saved</p>}
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
                <form ref={formRef} onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {/* Workspace name */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label htmlFor="ws-name" style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink-2))" }}>Workspace Name</label>
                    <input id="ws-name" type="text" value={name} onChange={(e) => { setName(e.target.value); setSaveSuccess(false) }}
                      onFocus={() => setNameFocused(true)} onBlur={() => setNameFocused(false)}
                      disabled={!canEdit || saving} maxLength={100}
                      style={{ ...inputStyle, borderColor: nameFocused ? "oklch(var(--color-accent))" : "oklch(var(--color-border))", boxShadow: nameFocused ? "0 0 0 3px oklch(var(--color-accent-muted))" : "none", opacity: !canEdit ? 0.6 : 1 }}
                    />
                  </div>

                  {/* Workspace URL slug (read-only) */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label htmlFor="ws-slug" style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink-2))" }}>Workspace URL</label>
                    <div style={{ display: "flex", alignItems: "center", borderRadius: "var(--radius-input)", border: "1px solid oklch(var(--color-border))", background: "oklch(var(--color-paper-3))", overflow: "hidden" }}>
                      <span style={{ padding: "8px 10px", fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-3))", borderRight: "1px solid oklch(var(--color-border))", whiteSpace: "nowrap", userSelect: "none" }}>
                        flowgrid.app/
                      </span>
                      <input id="ws-slug" type="text" readOnly value={detail?.slug ?? ""} style={{ ...inputStyle, border: "none", background: "transparent", borderRadius: 0, flex: 1, cursor: "default", color: "oklch(var(--color-ink-2))" }} />
                    </div>
                    <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>URL slug cannot be changed after workspace creation.</p>
                  </div>

                  {/* Description */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label htmlFor="ws-description" style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink-2))" }}>
                      Description <span style={{ fontWeight: 400, color: "oklch(var(--color-ink-3))" }}>(optional)</span>
                    </label>
                    <textarea id="ws-description" value={description} onChange={(e) => { setDescription(e.target.value); setSaveSuccess(false) }}
                      onFocus={() => setDescFocused(true)} onBlur={() => setDescFocused(false)}
                      disabled={!canEdit || saving} rows={3} maxLength={300} placeholder="What does this workspace do?"
                      style={{ ...inputStyle, resize: "vertical", borderColor: descFocused ? "oklch(var(--color-accent))" : "oklch(var(--color-border))", boxShadow: descFocused ? "0 0 0 3px oklch(var(--color-accent-muted))" : "none", opacity: !canEdit ? 0.6 : 1 }}
                    />
                  </div>

                  {saveError && <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>{saveError}</p>}
                  {saveSuccess && <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-success))" }}>Changes saved successfully.</p>}

                  {/* Hidden submit for formRef.requestSubmit() */}
                  <button type="submit" style={{ display: "none" }} aria-hidden="true" />
                </form>
              </div>
            </div>

          </div>{/* end left column */}

          {/* Right column: Preview card */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={sectionCard}>
              <div style={sectionHeader}>
                <h2 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600 }}>Preview</h2>
              </div>
              <div style={{ ...sectionBody, display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
                {/* Workspace badge */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "12px", background: "oklch(var(--color-paper-3))", borderRadius: "var(--radius-card)" }}>
                  <div
                    style={{ width: 36, height: 36, borderRadius: "8px", background: detail?.logoUrl ? "transparent" : (COLOR_GRADIENTS[selectedColor] ?? COLOR_GRADIENTS.blue), flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
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

                {/* Meta list */}
                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {[
                    { label: "Created", value: detail?.createdAt ? new Date(detail.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—" },
                    { label: "Members", value: String(detail?.memberCount ?? "—") },
                    { label: "Boards", value: String(detail?.boardCount ?? "—") },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>{label}</span>
                      <span style={{ fontSize: "var(--text-xs)", fontWeight: 500, color: "oklch(var(--color-ink-2))" }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>{/* end right column */}

        </div>{/* end two-column grid */}

        {/* ── Danger Zone — full width, OWNER only ── */}
        {isOwner && (
          <div style={{ ...sectionCard, marginTop: "24px", borderColor: "oklch(var(--color-error) / 0.3)" }}>
            <div style={{ ...sectionHeader, borderBottomColor: "oklch(var(--color-error) / 0.2)" }}>
              <h2 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600, color: "oklch(var(--color-error))" }}>Danger Zone</h2>
            </div>
            <div style={{ ...sectionBody, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
              <div>
                <p style={{ margin: "0 0 3px", fontSize: "var(--text-sm)", fontWeight: 500 }}>Delete this workspace</p>
                <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>Permanently remove this workspace and all its boards. This cannot be undone.</p>
              </div>
              <button onClick={() => setShowDeleteDialog(true)} style={dangerBtn}
                onMouseEnter={(e) => { e.currentTarget.style.background = "oklch(var(--color-error))"; e.currentTarget.style.color = "#fff" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "oklch(var(--color-error))" }}>
                Delete workspace
              </button>
            </div>
            {deleteError && <div style={{ padding: "0 20px 16px" }}><p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>{deleteError}</p></div>}
          </div>
        )}

      </div>{/* end padding wrapper */}
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
