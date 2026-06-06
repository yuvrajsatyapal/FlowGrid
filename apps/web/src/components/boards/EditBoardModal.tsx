import { useState, useRef, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import type { BoardVisibility } from "@flowgrid/types"
import { boardsApi, type BoardSummary } from "../../api/boards"
import { workspacesApi } from "../../api/workspaces"
import { getInitials, getAvatarBg } from "../../utils/avatar"

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

const NAME_DEBOUNCE_MS = 600

interface WorkspaceMemberOption {
  userId: string
  name: string | null
  email: string
  avatarUrl: string | null
}

type SaveStatus = "idle" | "saving" | "saved"

interface Props {
  board: BoardSummary
  workspaceId: string
  currentUserId: string
  /** Whether the current user can delete the board (workspace OWNER) */
  canDelete: boolean
  onUpdated: (board: BoardSummary) => void
  onDeleted: (boardId: string) => void
  onClose: () => void
}

export default function EditBoardModal({ board, workspaceId, currentUserId, canDelete, onUpdated, onDeleted, onClose }: Props) {
  const [name, setName] = useState(board.name)
  const [visibility, setVisibility] = useState<BoardVisibility>(board.visibility)
  const [coverColor, setCoverColor] = useState<string | null>(board.coverColor)
  const [error, setError] = useState("")
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Member picker — invite members who don't already have access (auto-applies)
  const [allMembers, setAllMembers] = useState<WorkspaceMemberOption[]>([])
  const [existingMemberIds, setExistingMemberIds] = useState<Set<string>>(new Set())
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [memberSearch, setMemberSearch] = useState("")
  const [addingMember, setAddingMember] = useState<string | null>(null)

  const overlayRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  // Last values successfully persisted — used to skip no-op saves
  const savedRef = useRef({ name: board.name, visibility: board.visibility, coverColor: board.coverColor })

  useEffect(() => {
    nameInputRef.current?.focus()
    nameInputRef.current?.select()
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  // Persist a partial change to the board and reflect it in the parent list.
  const persist = useCallback(
    async (fields: { name?: string; visibility?: BoardVisibility; coverColor?: string | null }) => {
      setSaveStatus("saving")
      setError("")
      try {
        const updated = await boardsApi.update(board.id, fields)
        savedRef.current = { name: updated.name, visibility: updated.visibility, coverColor: updated.coverColor }
        onUpdated({
          ...board,
          name: updated.name,
          visibility: updated.visibility,
          coverColor: updated.coverColor,
          updatedAt: updated.updatedAt,
        })
        setSaveStatus("saved")
      } catch (err: unknown) {
        setError((err as Error).message || "Failed to save changes")
        setSaveStatus("idle")
      }
    },
    [board, onUpdated],
  )

  // Auto-save the name after the user stops typing (debounced); skip empty/unchanged.
  useEffect(() => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === savedRef.current.name) return
    const t = setTimeout(() => { void persist({ name: trimmed }) }, NAME_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [name, persist])

  // Cover color + visibility save immediately on change
  function handleCoverChange(next: string | null) {
    setCoverColor(next)
    if (next !== savedRef.current.coverColor) void persist({ coverColor: next })
  }

  function handleVisibilityChange(next: BoardVisibility) {
    setVisibility(next)
    if (next !== savedRef.current.visibility) void persist({ visibility: next })
  }

  // Load workspace members + existing board members for the invite picker
  const loadMembers = useCallback(async () => {
    setLoadingMembers(true)
    try {
      const [members, boardMembers] = await Promise.all([
        workspacesApi.listMembers(workspaceId),
        board.visibility === "PRIVATE" || visibility === "PRIVATE"
          ? boardsApi.listMembers(board.id)
          : Promise.resolve([]),
      ])
      setExistingMemberIds(new Set(boardMembers.map((m) => m.userId)))
      setAllMembers(
        members
          .filter((m) => m.userId !== currentUserId)
          .map((m) => ({ userId: m.userId, name: m.name, email: m.email, avatarUrl: m.avatarUrl })),
      )
    } catch {
      // Non-critical — picker stays empty
    } finally {
      setLoadingMembers(false)
    }
  }, [workspaceId, currentUserId, board.id, board.visibility, visibility])

  useEffect(() => {
    if (visibility === "PRIVATE") {
      void loadMembers()
    } else {
      setMemberSearch("")
    }
  }, [visibility, loadMembers])

  // Candidates = workspace members not already on the board
  const candidates = allMembers.filter((m) => !existingMemberIds.has(m.userId))
  const filteredMembers = candidates.filter((m) => {
    const q = memberSearch.toLowerCase()
    return (m.name ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
  })

  async function handleInvite(userId: string) {
    setAddingMember(userId)
    setError("")
    try {
      await boardsApi.addMember(board.id, userId)
      // Move to existing so they drop out of the candidates list
      setExistingMemberIds((prev) => new Set(prev).add(userId))
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to invite member")
    } finally {
      setAddingMember(null)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setError("")
    try {
      await boardsApi.deleteBoard(board.id)
      onDeleted(board.id)
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to delete board")
      setDeleting(false)
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
        zIndex: 210,
        padding: "16px",
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-board-title"
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.97 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        style={{
          background: "oklch(var(--color-paper))",
          borderRadius: "var(--radius-modal)",
          border: "1px solid oklch(var(--color-border))",
          width: "100%",
          maxWidth: "460px",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px oklch(0% 0 0 / 0.20)",
        }}
      >
        {/* Header row: title (left) · autosave status + close (right) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            padding: "16px 20px",
            borderBottom: "1px solid oklch(var(--color-border))",
          }}
        >
          <h2
            id="edit-board-title"
            style={{
              margin: 0,
              fontSize: "var(--text-base)",
              fontWeight: 600,
              color: "oklch(var(--color-ink))",
              fontFamily: "var(--font-display)",
            }}
          >
            Edit board
          </h2>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Auto-save status */}
            <span
              aria-live="polite"
              style={{
                fontSize: "var(--text-xs)",
                fontWeight: 500,
                whiteSpace: "nowrap",
                color: saveStatus === "saving" ? "oklch(var(--color-ink-3))" : "oklch(var(--color-success, 0.6 0.13 150))",
                opacity: saveStatus === "idle" ? 0 : 1,
                transition: "opacity var(--dur-fast)",
              }}
            >
              {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "✓ Saved" : ""}
            </span>

            {/* Close (X) */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "var(--radius-badge)",
                border: "none",
                background: "transparent",
                color: "oklch(var(--color-ink-3))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: "18px",
                lineHeight: 1,
                flexShrink: 0,
                transition: "background var(--dur-fast), color var(--dur-fast)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "oklch(var(--color-paper-3))"
                e.currentTarget.style.color = "oklch(var(--color-ink))"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent"
                e.currentTarget.style.color = "oklch(var(--color-ink-3))"
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Cover preview */}
          <div
            style={{
              height: "72px",
              borderRadius: "var(--radius-card)",
              background: coverColor ?? "#64748b",
            }}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Name */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label
              htmlFor="edit-board-name"
              style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "oklch(var(--color-ink-2))", letterSpacing: "0.04em", textTransform: "uppercase" }}
            >
              Board name *
            </label>
            <input
              id="edit-board-name"
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
              maxLength={100}
              disabled={deleting}
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
                  onClick={() => handleCoverChange(c.hex)}
                  disabled={deleting}
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
                onClick={() => handleCoverChange(null)}
                disabled={deleting}
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
              htmlFor="edit-board-visibility"
              style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "oklch(var(--color-ink-2))", letterSpacing: "0.04em", textTransform: "uppercase" }}
            >
              Visibility
            </label>
            <select
              id="edit-board-visibility"
              value={visibility}
              onChange={(e) => handleVisibilityChange(e.target.value as BoardVisibility)}
              disabled={deleting}
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
            </select>
          </div>

          {/* Member picker — shown when PRIVATE; inviting applies immediately */}
          {visibility === "PRIVATE" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "oklch(var(--color-ink-2))", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Invite members
              </span>

              <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                Inviting adds the member instantly. Manage existing members from the board's Access panel.
              </p>

              <input
                type="text"
                placeholder="Search members…"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                disabled={deleting || loadingMembers}
                style={{
                  padding: "7px 10px",
                  borderRadius: "var(--radius-input)",
                  border: "1px solid oklch(var(--color-border))",
                  background: "oklch(var(--color-paper-2))",
                  color: "oklch(var(--color-ink))",
                  fontSize: "var(--text-sm)",
                  fontFamily: "var(--font-body)",
                  outline: "none",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              />

              <div
                style={{
                  border: "1px solid oklch(var(--color-border))",
                  borderRadius: "var(--radius-card)",
                  maxHeight: "160px",
                  overflowY: "auto",
                  background: "oklch(var(--color-paper-2))",
                }}
              >
                {loadingMembers ? (
                  <div style={{ padding: "12px", textAlign: "center", fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                    Loading members…
                  </div>
                ) : filteredMembers.length === 0 ? (
                  <div style={{ padding: "12px", textAlign: "center", fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                    {memberSearch ? "No members match your search" : "Everyone already has access"}
                  </div>
                ) : (
                  filteredMembers.map((m, i) => (
                    <div
                      key={m.userId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        width: "100%",
                        padding: "8px 12px",
                        boxSizing: "border-box",
                        borderBottom: i < filteredMembers.length - 1 ? "1px solid oklch(var(--color-border) / 0.5)" : "none",
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: m.avatarUrl ? "transparent" : getAvatarBg(m.userId),
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                          flexShrink: 0,
                        }}
                      >
                        {m.avatarUrl ? (
                          <img src={m.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <span style={{ fontSize: "10px", fontWeight: 700, color: "#fff" }}>{getInitials(m.name ?? m.email)}</span>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {m.name ?? m.email}
                        </div>
                        {m.name && (
                          <div style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {m.email}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleInvite(m.userId)}
                        disabled={addingMember === m.userId || deleting}
                        aria-label={`Invite ${m.name ?? m.email}`}
                        style={{
                          padding: "3px 12px",
                          borderRadius: "var(--radius-badge)",
                          border: "1px solid oklch(var(--color-accent))",
                          background: "transparent",
                          color: "oklch(var(--color-accent))",
                          fontSize: "var(--text-xs)",
                          fontWeight: 500,
                          cursor: addingMember === m.userId ? "not-allowed" : "pointer",
                          opacity: addingMember === m.userId ? 0.5 : 1,
                          fontFamily: "var(--font-body)",
                          flexShrink: 0,
                        }}
                      >
                        {addingMember === m.userId ? "…" : "Invite"}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Danger Zone — delete board, separated by a divider */}
        {canDelete && (
          <div
            style={{
              padding: "16px 20px 20px",
              borderTop: "1px solid oklch(var(--color-border))",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <span
              style={{
                fontSize: "var(--text-xs)",
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "oklch(var(--color-error))",
              }}
            >
              Danger Zone
            </span>
            {confirmDelete ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "oklch(var(--color-ink))", fontWeight: 500 }}>
                  Delete "{board.name}"? This can't be undone.
                </p>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    style={{
                      flex: 1,
                      padding: "8px 16px",
                      borderRadius: "var(--radius-button)",
                      border: "1px solid oklch(var(--color-border))",
                      background: "transparent",
                      color: "oklch(var(--color-ink-2))",
                      fontSize: "var(--text-sm)",
                      fontWeight: 500,
                      cursor: deleting ? "not-allowed" : "pointer",
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    style={{
                      flex: 1,
                      padding: "8px 16px",
                      borderRadius: "var(--radius-button)",
                      border: "none",
                      background: "oklch(var(--color-error))",
                      color: "#fff",
                      fontSize: "var(--text-sm)",
                      fontWeight: 600,
                      cursor: deleting ? "not-allowed" : "pointer",
                      fontFamily: "var(--font-body)",
                      opacity: deleting ? 0.7 : 1,
                    }}
                  >
                    {deleting ? "Deleting…" : "Delete board"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={deleting}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 12px",
                  borderRadius: "var(--radius-button)",
                  border: "1px solid oklch(var(--color-error) / 0.4)",
                  background: "transparent",
                  color: "oklch(var(--color-error))",
                  fontSize: "var(--text-sm)",
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M2 4h12M5 4V2.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5V4M6 7v5M10 7v5M3 4l1 9.5a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5L13 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Delete board
              </button>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
