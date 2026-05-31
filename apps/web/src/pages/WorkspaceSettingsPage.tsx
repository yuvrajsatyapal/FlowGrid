import { useEffect, useRef, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
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

  const [nameFocused, setNameFocused] = useState(false)
  const [descFocused, setDescFocused] = useState(false)
  const saveSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      })
      .catch((err: Error) => setLoadError(err.message || "Failed to load workspace"))
      .finally(() => setLoading(false))
  }, [workspaceId])

  const isOwner = detail?.role === "OWNER"
  const canEdit = detail?.role === "OWNER" || detail?.role === "ADMIN"

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

  return (
    <div
      style={{
        padding: "32px 36px",
        maxWidth: "640px",
        color: "oklch(var(--color-ink))",
        fontFamily: "var(--font-body)",
      }}
    >
      {/* Page header */}
      <div style={{ marginBottom: "28px" }}>
        <h1
          style={{
            margin: 0,
            fontSize: "var(--text-xl)",
            fontWeight: 600,
            letterSpacing: "-0.02em",
            fontFamily: "var(--font-display)",
          }}
        >
          Workspace settings
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))" }}>
          {detail?.name}
        </p>
      </div>

      {/* General section */}
      <div style={sectionCard}>
        <div style={sectionHeader}>
          <h2 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600 }}>General</h2>
        </div>
        <div style={sectionBody}>
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label
                htmlFor="ws-name"
                style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink-2))" }}
              >
                Workspace name
              </label>
              <input
                id="ws-name"
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setSaveSuccess(false) }}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setNameFocused(false)}
                disabled={!canEdit || saving}
                maxLength={100}
                style={{
                  ...inputStyle,
                  borderColor: nameFocused ? "oklch(var(--color-accent))" : "oklch(var(--color-border))",
                  boxShadow: nameFocused ? "0 0 0 3px oklch(var(--color-accent-muted))" : "none",
                  opacity: !canEdit ? 0.6 : 1,
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label
                htmlFor="ws-description"
                style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink-2))" }}
              >
                Description{" "}
                <span style={{ fontWeight: 400, color: "oklch(var(--color-ink-3))" }}>(optional)</span>
              </label>
              <textarea
                id="ws-description"
                value={description}
                onChange={(e) => { setDescription(e.target.value); setSaveSuccess(false) }}
                onFocus={() => setDescFocused(true)}
                onBlur={() => setDescFocused(false)}
                disabled={!canEdit || saving}
                rows={2}
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

            {saveError && (
              <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>
                {saveError}
              </p>
            )}

            {canEdit && (
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <button
                  type="submit"
                  disabled={saving || name.trim().length === 0}
                  style={{
                    ...primaryBtn,
                    opacity: saving || name.trim().length === 0 ? 0.5 : 1,
                    cursor: saving || name.trim().length === 0 ? "not-allowed" : "pointer",
                  }}
                  onMouseEnter={(e) => { if (!saving) e.currentTarget.style.background = "oklch(var(--color-accent-hover))" }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "oklch(var(--color-accent))" }}
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
                {saveSuccess && (
                  <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-success))" }}>
                    Saved
                  </span>
                )}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Danger zone — OWNER only */}
      {isOwner && (
        <div
          style={{
            ...sectionCard,
            marginTop: "24px",
            borderColor: "oklch(var(--color-error) / 0.3)",
          }}
        >
          <div
            style={{
              ...sectionHeader,
              borderBottomColor: "oklch(var(--color-error) / 0.2)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600, color: "oklch(var(--color-error))" }}>
              Danger zone
            </h2>
          </div>
          <div
            style={{
              ...sectionBody,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
            }}
          >
            <div>
              <p style={{ margin: "0 0 3px", fontSize: "var(--text-sm)", fontWeight: 500 }}>
                Delete this workspace
              </p>
              <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                Permanently remove this workspace and all its boards. This cannot be undone.
              </p>
            </div>
            <button
              onClick={() => setShowDeleteDialog(true)}
              style={dangerBtn}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "oklch(var(--color-error))"
                e.currentTarget.style.color = "#fff"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent"
                e.currentTarget.style.color = "oklch(var(--color-error))"
              }}
            >
              Delete workspace
            </button>
          </div>
          {deleteError && (
            <div style={{ padding: "0 20px 16px" }}>
              <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>
                {deleteError}
              </p>
            </div>
          )}
        </div>
      )}

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
