import { useState, useRef, useEffect } from "react"
import type { ListSummary } from "../../api/lists"
import { listsApi } from "../../api/lists"

interface Props {
  list: ListSummary
  canEdit: boolean
  onRenamed: (id: string, name: string) => void
  onDeleted: (id: string) => void
}

export default function ListColumn({ list, canEdit, onRenamed, onDeleted }: Props) {
  const [renaming, setRenaming] = useState(false)
  const [nameInput, setNameInput] = useState(list.name)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [menuOpen, setMenuOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renaming) inputRef.current?.select()
  }, [renaming])

  const commitRename = async () => {
    const trimmed = nameInput.trim()
    if (!trimmed || trimmed === list.name) {
      setRenaming(false)
      setNameInput(list.name)
      return
    }
    setSaving(true)
    try {
      const updated = await listsApi.update(list.id, trimmed)
      onRenamed(list.id, updated.name)
      setRenaming(false)
    } catch {
      setNameInput(list.name)
      setRenaming(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setMenuOpen(false)
    setDeleting(true)
    setDeleteError("")
    try {
      await listsApi.deleteList(list.id)
      onDeleted(list.id)
    } catch (err) {
      setDeleteError((err as Error).message || "Failed to delete list")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 272,
        flexShrink: 0,
        background: "oklch(var(--color-paper-2))",
        borderRadius: "var(--radius-card)",
        border: "1px solid oklch(var(--color-border))",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "10px 12px 8px",
        }}
      >
        {renaming ? (
          <input
            ref={inputRef}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename()
              if (e.key === "Escape") {
                setNameInput(list.name)
                setRenaming(false)
              }
            }}
            disabled={saving}
            maxLength={100}
            style={{
              flex: 1,
              border: "1px solid oklch(var(--color-accent))",
              borderRadius: "var(--radius-input)",
              padding: "2px 6px",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              fontFamily: "var(--font-body)",
              background: "oklch(var(--color-paper))",
              color: "oklch(var(--color-ink))",
              outline: "none",
            }}
          />
        ) : (
          <button
            onClick={() => canEdit && setRenaming(true)}
            style={{
              flex: 1,
              textAlign: "left",
              background: "none",
              border: "none",
              padding: "2px 4px",
              borderRadius: "var(--radius-badge)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              fontFamily: "var(--font-body)",
              color: "oklch(var(--color-ink))",
              cursor: canEdit ? "pointer" : "default",
              lineHeight: 1.4,
            }}
            title={canEdit ? "Click to rename" : list.name}
          >
            {list.name}
          </button>
        )}

        <span
          style={{
            fontSize: "var(--text-xs)",
            color: "oklch(var(--color-ink-3))",
            fontVariantNumeric: "tabular-nums",
            flexShrink: 0,
          }}
        >
          {list.cardCount}
        </span>

        {canEdit && (
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              onClick={() => !deleting && setMenuOpen((v) => !v)}
              aria-label="List options"
              disabled={deleting}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 26,
                height: 26,
                borderRadius: "var(--radius-badge)",
                border: "none",
                background: "none",
                color: "oklch(var(--color-ink-3))",
                cursor: deleting ? "not-allowed" : "pointer",
                fontSize: 16,
                lineHeight: 1,
                opacity: deleting ? 0.5 : 1,
              }}
            >
              {deleting ? "…" : "···"}
            </button>
            {menuOpen && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 4px)",
                  background: "oklch(var(--color-paper))",
                  border: "1px solid oklch(var(--color-border))",
                  borderRadius: "var(--radius-card)",
                  boxShadow: "0 4px 12px oklch(0% 0 0 / 0.12)",
                  zIndex: 20,
                  minWidth: 140,
                  padding: "4px 0",
                }}
              >
                <button
                  onClick={() => { setMenuOpen(false); setRenaming(true) }}
                  style={menuItemStyle}
                >
                  Rename
                </button>
                <button
                  onClick={handleDelete}
                  style={{ ...menuItemStyle, color: "oklch(var(--color-error))" }}
                >
                  Delete list
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {deleteError && (
        <p style={{ margin: "0 12px 8px", fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>
          {deleteError}
        </p>
      )}

      {/* Card area placeholder — Feature #9 */}
      <div
        style={{
          minHeight: 32,
          flex: 1,
          padding: "0 8px 8px",
        }}
      />
    </div>
  )
}

const menuItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "none",
  border: "none",
  padding: "7px 14px",
  fontSize: "var(--text-sm)",
  fontFamily: "var(--font-body)",
  color: "oklch(var(--color-ink))",
  cursor: "pointer",
}
