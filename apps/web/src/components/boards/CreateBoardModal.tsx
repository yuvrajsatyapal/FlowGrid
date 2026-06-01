import { useState, useRef, useEffect } from "react"
import { motion } from "framer-motion"
import type { BoardVisibility } from "@flowgrid/types"
import { boardsApi, type BoardSummary } from "../../api/boards"

const COVER_COLORS = [
  { hex: "#3b82f6", label: "Blue" },
  { hex: "#6366f1", label: "Indigo" },
  { hex: "#14b8a6", label: "Teal" },
  { hex: "#10b981", label: "Emerald" },
  { hex: "#f59e0b", label: "Amber" },
  { hex: "#ef4444", label: "Red" },
  { hex: "#64748b", label: "Slate" },
  { hex: "#0ea5e9", label: "Sky" },
]

interface Props {
  workspaceId: string
  onCreated: (board: BoardSummary) => void
  onClose: () => void
}

export default function CreateBoardModal({ workspaceId, onCreated, onClose }: Props) {
  const [name, setName] = useState("")
  const [visibility, setVisibility] = useState<BoardVisibility>("WORKSPACE")
  const [coverColor, setCoverColor] = useState<string | null>(COVER_COLORS[0].hex)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const overlayRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError("Board name is required")
      return
    }
    setError("")
    setSubmitting(true)
    try {
      const board = await boardsApi.create({ workspaceId, name: trimmed, visibility, coverColor })
      onCreated(board)
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to create board")
    } finally {
      setSubmitting(false)
    }
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    <motion.div
      ref={overlayRef}
      onClick={handleOverlayClick}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(0% 0 0 / 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: "16px",
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-board-title"
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.97 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        style={{
          background: "oklch(var(--color-paper))",
          borderRadius: "var(--radius-modal)",
          border: "1px solid oklch(var(--color-border))",
          width: "100%",
          maxWidth: "420px",
          padding: "24px",
          boxShadow: "0 20px 60px oklch(0% 0 0 / 0.20)",
        }}
      >
        {/* Cover preview */}
        <div
          style={{
            height: "72px",
            borderRadius: "var(--radius-card)",
            background: coverColor ?? "#64748b",
            marginBottom: "20px",
          }}
        />

        <h2
          id="create-board-title"
          style={{
            margin: "0 0 20px",
            fontSize: "var(--text-base)",
            fontWeight: 600,
            color: "oklch(var(--color-ink))",
            fontFamily: "var(--font-display)",
          }}
        >
          Create board
        </h2>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Name */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label
              htmlFor="board-name"
              style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "oklch(var(--color-ink-2))", letterSpacing: "0.04em", textTransform: "uppercase" }}
            >
              Board name *
            </label>
            <input
              id="board-name"
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
              maxLength={100}
              disabled={submitting}
              style={{
                padding: "8px 12px",
                borderRadius: "var(--radius-input)",
                border: error ? "1px solid oklch(var(--color-error))" : "1px solid oklch(var(--color-border))",
                background: "oklch(var(--color-paper-2))",
                color: "oklch(var(--color-ink))",
                fontSize: "var(--text-sm)",
                fontFamily: "var(--font-body)",
                outline: "none",
                width: "100%",
                boxSizing: "border-box",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "oklch(var(--color-focus))"
                e.currentTarget.style.boxShadow = "0 0 0 3px oklch(var(--color-accent-muted))"
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = error ? "oklch(var(--color-error))" : "oklch(var(--color-border))"
                e.currentTarget.style.boxShadow = "none"
              }}
            />
            {error && (
              <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>{error}</span>
            )}
          </div>

          {/* Cover color */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "oklch(var(--color-ink-2))", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Cover color
            </span>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {COVER_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  title={c.label}
                  aria-label={`Cover color: ${c.label}${coverColor === c.hex ? " (selected)" : ""}`}
                  onClick={() => setCoverColor(c.hex)}
                  disabled={submitting}
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "var(--radius-badge)",
                    background: c.hex,
                    border: coverColor === c.hex ? "2px solid oklch(var(--color-ink))" : "2px solid transparent",
                    cursor: "pointer",
                    outline: "none",
                    padding: 0,
                    flexShrink: 0,
                    transition: "transform var(--dur-fast)",
                    transform: coverColor === c.hex ? "scale(1.15)" : "scale(1)",
                  }}
                />
              ))}
              <button
                type="button"
                title="No color"
                aria-label={`No cover color${coverColor === null ? " (selected)" : ""}`}
                onClick={() => setCoverColor(null)}
                disabled={submitting}
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "var(--radius-badge)",
                  background: "oklch(var(--color-paper-3))",
                  border: coverColor === null ? "2px solid oklch(var(--color-ink))" : "2px solid oklch(var(--color-border))",
                  cursor: "pointer",
                  outline: "none",
                  padding: 0,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "oklch(var(--color-ink-3))",
                  fontSize: "14px",
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Visibility */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label
              htmlFor="board-visibility"
              style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "oklch(var(--color-ink-2))", letterSpacing: "0.04em", textTransform: "uppercase" }}
            >
              Visibility
            </label>
            <select
              id="board-visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as BoardVisibility)}
              disabled={submitting}
              style={{
                padding: "8px 12px",
                borderRadius: "var(--radius-input)",
                border: "1px solid oklch(var(--color-border))",
                background: "oklch(var(--color-paper-2))",
                color: "oklch(var(--color-ink))",
                fontSize: "var(--text-sm)",
                fontFamily: "var(--font-body)",
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="WORKSPACE">Workspace (all members)</option>
              <option value="PRIVATE">Private (invite only)</option>
              <option value="PUBLIC">Public (anyone with link)</option>
            </select>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "4px" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: "8px 16px",
                borderRadius: "var(--radius-button)",
                border: "1px solid oklch(var(--color-border))",
                background: "transparent",
                color: "oklch(var(--color-ink-2))",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "var(--font-body)",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              style={{
                padding: "8px 18px",
                borderRadius: "var(--radius-button)",
                border: "none",
                background: submitting || !name.trim() ? "oklch(var(--color-muted))" : "oklch(var(--color-accent))",
                color: submitting || !name.trim() ? "oklch(var(--color-ink-3))" : "#fff",
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                cursor: submitting || !name.trim() ? "not-allowed" : "pointer",
                fontFamily: "var(--font-body)",
                transition: "background var(--dur-fast)",
              }}
            >
              {submitting ? "Creating…" : "Create board"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
