import { useState, useEffect, useRef, useCallback } from "react"
import { motion } from "framer-motion"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import type { Socket } from "socket.io-client"
import type { Priority } from "@flowgrid/types"
import type { CardSummary, CardLabel } from "../../api/cards"
import { cardsApi } from "../../api/cards"
import { labelsApi, type LabelSummary } from "../../api/labels"
import { workspacesApi, type WorkspaceMember } from "../../api/workspaces"
import { getInitials, getAvatarBg } from "../../utils/avatar"
import { useAuth } from "../../contexts/AuthContext"
import { CommentThread } from "./CommentThread"
import { ActivityFeed } from "./ActivityFeed"
import { AttachmentSection } from "./AttachmentSection"

interface Props {
  card: CardSummary
  boardId: string
  workspaceId: string
  canEdit: boolean
  userRole?: string // workspace role — used for comment moderation
  socket?: Socket | null
  onClose: () => void
  onCardUpdated: (updated: CardSummary) => void
}

type SaveState = "idle" | "saving" | "saved" | "error"

const PRIORITY_OPTIONS: { value: Priority; label: string; color: string | null }[] = [
  { value: "NONE", label: "None", color: null },
  { value: "LOW", label: "Low", color: "oklch(0.62 0.17 237)" },
  { value: "MEDIUM", label: "Medium", color: "oklch(0.77 0.15 85)" },
  { value: "HIGH", label: "High", color: "oklch(0.67 0.19 48)" },
  { value: "URGENT", label: "Urgent", color: "oklch(0.59 0.22 27)" },
]

const LABEL_COLORS = [
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Green", value: "#10b981" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Purple", value: "#a855f7" },
  { name: "Slate", value: "#64748b" },
]

export default function CardDetailModal({ card, boardId, workspaceId, canEdit, userRole, socket, onClose, onCardUpdated }: Props) {
  const { user } = useAuth()
  const [localCard, setLocalCard] = useState<CardSummary>(card)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [saveError, setSaveError] = useState("")

  // Sidebar data
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [boardLabels, setBoardLabels] = useState<LabelSummary[]>([])

  // Label popover
  const [labelPopoverOpen, setLabelPopoverOpen] = useState(false)
  const [newLabelName, setNewLabelName] = useState("")
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0].value)
  const [creatingLabel, setCreatingLabel] = useState(false)

  // Debounce ref for description
  const descDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingDescRef = useRef<string | null>(null)

  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // ─── Load sidebar data ────────────────────────────────────────────────────

  useEffect(() => {
    workspacesApi.listMembers(workspaceId).then(setMembers).catch(() => setMembers([]))
    labelsApi.list(boardId).then(setBoardLabels).catch(() => setBoardLabels([]))
  }, [workspaceId, boardId])

  // ─── Save helpers ─────────────────────────────────────────────────────────

  function showSaved() {
    setSaveState("saved")
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSaveState("idle"), 2000)
  }

  const saveField = useCallback(async (fields: Parameters<typeof cardsApi.update>[1]) => {
    setSaveState("saving")
    setSaveError("")
    try {
      const updated = await cardsApi.update(localCard.id, fields)
      setLocalCard(updated)
      onCardUpdated(updated)
      showSaved()
    } catch (err: unknown) {
      setSaveState("error")
      setSaveError((err as Error).message || "Failed to save")
    }
  }, [localCard.id, onCardUpdated])

  // ─── Escape key + backdrop ────────────────────────────────────────────────

  // Ref holds the latest flushAndClose so the keydown listener never captures a stale closure
  const flushAndCloseRef = useRef<() => Promise<void>>(async () => { onClose() })

  const flushAndClose = useCallback(async () => {
    if (descDebounceRef.current) {
      clearTimeout(descDebounceRef.current)
      descDebounceRef.current = null
      if (pendingDescRef.current !== null) {
        const desc = pendingDescRef.current
        pendingDescRef.current = null
        await saveField({ description: desc })
      }
    }
    onClose()
  }, [saveField, onClose])

  // Keep ref in sync with the latest callback
  useEffect(() => {
    flushAndCloseRef.current = flushAndClose
  })

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") void flushAndCloseRef.current()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) void flushAndClose()
  }

  // ─── TipTap editor ───────────────────────────────────────────────────────

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Add a description…" }),
    ],
    content: localCard.description ?? "",
    editable: canEdit,
    onUpdate({ editor: ed }) {
      const html = ed.getHTML()
      const isEmpty = ed.isEmpty
      pendingDescRef.current = isEmpty ? null : html

      if (descDebounceRef.current) clearTimeout(descDebounceRef.current)
      descDebounceRef.current = setTimeout(() => {
        descDebounceRef.current = null
        void saveField({ description: isEmpty ? null : html })
        pendingDescRef.current = null
      }, 800)
    },
  })

  // Cleanup on unmount — fire-and-forget flush (component is being destroyed, no UI to show errors)
  useEffect(() => {
    return () => {
      if (descDebounceRef.current) {
        clearTimeout(descDebounceRef.current)
        if (pendingDescRef.current !== null) {
          void cardsApi.update(localCard.id, { description: pendingDescRef.current })
        }
      }
      if (savedTimer.current) clearTimeout(savedTimer.current)
    }
    // localCard.id is stable for the lifetime of the modal — intentionally not in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Field handlers ───────────────────────────────────────────────────────

  async function handleTitleBlur(e: React.FocusEvent<HTMLInputElement>) {
    const val = e.currentTarget.value.trim()
    if (!val || val === localCard.title) return
    await saveField({ title: val })
  }

  async function handlePriorityChange(e: React.ChangeEvent<HTMLSelectElement>) {
    await saveField({ priority: e.target.value as Priority })
  }

  async function handleDueDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    await saveField({ dueDate: val ? new Date(val).toISOString() : null })
  }

  async function handleAssigneeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    await saveField({ assigneeId: val || null })
  }

  async function handleLabelToggle(label: LabelSummary) {
    const assigned = localCard.labels.some((l) => l.id === label.id)
    setSaveState("saving")
    try {
      if (assigned) {
        await cardsApi.removeLabel(localCard.id, label.id)
        const updated: CardSummary = { ...localCard, labels: localCard.labels.filter((l) => l.id !== label.id) }
        setLocalCard(updated)
        onCardUpdated(updated)
      } else {
        await cardsApi.addLabel(localCard.id, label.id)
        const newLabel: CardLabel = { id: label.id, name: label.name, color: label.color }
        const updated: CardSummary = { ...localCard, labels: [...localCard.labels, newLabel] }
        setLocalCard(updated)
        onCardUpdated(updated)
      }
      showSaved()
    } catch (err: unknown) {
      setSaveState("error")
      setSaveError((err as Error).message || "Failed to update label")
    }
  }

  async function handleCreateLabel(e: React.FormEvent) {
    e.preventDefault()
    if (!newLabelName.trim()) return
    setCreatingLabel(true)
    setSaveState("saving")
    setSaveError("")
    try {
      const created = await labelsApi.create(boardId, newLabelName.trim(), newLabelColor)
      setBoardLabels((prev) => [...prev, created])
      setNewLabelName("")
      setNewLabelColor(LABEL_COLORS[0].value)
      // Auto-assign the newly created label
      await cardsApi.addLabel(localCard.id, created.id)
      const newLabel: CardLabel = { id: created.id, name: created.name, color: created.color }
      const updated: CardSummary = { ...localCard, labels: [...localCard.labels, newLabel] }
      setLocalCard(updated)
      onCardUpdated(updated)
      showSaved()
    } catch (err: unknown) {
      setSaveState("error")
      setSaveError((err as Error).message || "Failed to create label")
    } finally {
      setCreatingLabel(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const dueDateValue = localCard.dueDate
    ? new Date(localCard.dueDate).toISOString().split("T")[0]
    : ""

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
        alignItems: "flex-start",
        justifyContent: "center",
        zIndex: 300,
        padding: "48px 16px 16px",
        overflowY: "auto",
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-modal-title"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        style={{
          background: "oklch(var(--color-paper))",
          borderRadius: "var(--radius-modal)",
          border: "1px solid oklch(var(--color-border))",
          width: "100%",
          maxWidth: 680,
          boxShadow: "0 20px 60px oklch(0% 0 0 / 0.20)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "16px 20px 12px",
            borderBottom: "1px solid oklch(var(--color-border))",
          }}
        >
          <input
            id="card-modal-title"
            defaultValue={localCard.title}
            onBlur={handleTitleBlur}
            disabled={!canEdit}
            style={{
              flex: 1,
              fontSize: "var(--text-base)",
              fontWeight: 600,
              fontFamily: "var(--font-display)",
              color: "oklch(var(--color-ink))",
              background: "transparent",
              border: "none",
              outline: "none",
              padding: "2px 4px",
              borderRadius: 4,
            }}
            onFocus={(e) => {
              e.currentTarget.style.background = "oklch(var(--color-paper-2))"
            }}
            onBlurCapture={(e) => {
              e.currentTarget.style.background = "transparent"
            }}
          />

          {/* Save indicator */}
          <span
            style={{
              fontSize: "var(--text-xs)",
              color: saveState === "error" ? "oklch(var(--color-error))" : "oklch(var(--color-ink-3))",
              minWidth: 56,
              textAlign: "right",
              flexShrink: 0,
            }}
          >
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && "Saved ✓"}
            {saveState === "error" && (saveError || "Error")}
          </span>

          <button
            onClick={flushAndClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "oklch(var(--color-ink-3))",
              fontSize: 18,
              lineHeight: 1,
              padding: "2px 4px",
              borderRadius: 4,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ display: "flex", gap: 0 }}>
          {/* Left: description */}
          <div
            style={{
              flex: 1,
              padding: "16px 20px 20px",
              borderRight: "1px solid oklch(var(--color-border))",
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: "var(--text-xs)",
                fontWeight: 600,
                color: "oklch(var(--color-ink-3))",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Description
            </div>
            <div
              style={{
                border: "1px solid oklch(var(--color-border))",
                borderRadius: "var(--radius-input)",
                background: "oklch(var(--color-paper-2))",
                padding: "10px 12px",
                minHeight: 120,
                fontSize: "var(--text-sm)",
                fontFamily: "var(--font-body)",
                color: "oklch(var(--color-ink))",
                lineHeight: 1.6,
              }}
            >
              <EditorContent editor={editor} />
            </div>

            {/* Attachments */}
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid oklch(var(--color-border))" }}>
              <AttachmentSection cardId={localCard.id} canEdit={canEdit} />
            </div>

            {/* Comments */}
            {user && (
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid oklch(var(--color-border))" }}>
                <CommentThread
                  cardId={localCard.id}
                  currentUserId={user.id}
                  currentUserRole={userRole ?? (canEdit ? "OWNER" : "MEMBER")}
                  socket={socket}
                />
              </div>
            )}

            {/* Activity */}
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid oklch(var(--color-border))" }}>
              <ActivityFeed cardId={localCard.id} />
            </div>
          </div>

          {/* Right: fields */}
          <div style={{ width: 220, flexShrink: 0, padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Priority */}
            <div>
              <FieldLabel>Priority</FieldLabel>
              <select
                value={localCard.priority}
                onChange={handlePriorityChange}
                disabled={!canEdit}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: "var(--radius-input)",
                  border: "1px solid oklch(var(--color-border))",
                  background: "oklch(var(--color-paper-2))",
                  color: "oklch(var(--color-ink))",
                  fontSize: "var(--text-sm)",
                  fontFamily: "var(--font-body)",
                  cursor: canEdit ? "pointer" : "default",
                }}
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Due date */}
            <div>
              <FieldLabel>Due Date</FieldLabel>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="date"
                  value={dueDateValue}
                  onChange={handleDueDateChange}
                  disabled={!canEdit}
                  style={{
                    flex: 1,
                    padding: "6px 8px",
                    borderRadius: "var(--radius-input)",
                    border: "1px solid oklch(var(--color-border))",
                    background: "oklch(var(--color-paper-2))",
                    color: dueDateValue ? "oklch(var(--color-ink))" : "oklch(var(--color-ink-3))",
                    fontSize: "var(--text-sm)",
                    fontFamily: "var(--font-body)",
                    cursor: canEdit ? "pointer" : "default",
                  }}
                />
                {dueDateValue && canEdit && (
                  <button
                    onClick={() => saveField({ dueDate: null })}
                    aria-label="Clear due date"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "oklch(var(--color-ink-3))",
                      fontSize: 16,
                      lineHeight: 1,
                      padding: "2px 4px",
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Assignee */}
            <div>
              <FieldLabel>Assignee</FieldLabel>
              <select
                value={localCard.assigneeId ?? ""}
                onChange={handleAssigneeChange}
                disabled={!canEdit}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: "var(--radius-input)",
                  border: "1px solid oklch(var(--color-border))",
                  background: "oklch(var(--color-paper-2))",
                  color: "oklch(var(--color-ink))",
                  fontSize: "var(--text-sm)",
                  fontFamily: "var(--font-body)",
                  cursor: canEdit ? "pointer" : "default",
                }}
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name ?? m.email}
                  </option>
                ))}
              </select>
              {localCard.assignee && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                  {localCard.assignee.avatarUrl ? (
                    <img
                      src={localCard.assignee.avatarUrl}
                      alt={localCard.assignee.name ?? "Assignee"}
                      width={20}
                      height={20}
                      style={{ borderRadius: "50%", objectFit: "cover", display: "block", flexShrink: 0 }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 20, height: 20, borderRadius: "50%",
                        background: getAvatarBg(localCard.assignee.id),
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, color: "#fff", fontSize: 9, fontWeight: 600,
                        fontFamily: "var(--font-body)",
                      }}
                    >
                      {getInitials(localCard.assignee.name)}
                    </div>
                  )}
                  <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-2))" }}>
                    {localCard.assignee.name ?? localCard.assignee.id}
                  </span>
                </div>
              )}
            </div>

            {/* Labels */}
            <div>
              <FieldLabel>Labels</FieldLabel>

              {/* Assigned labels */}
              {localCard.labels.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                  {localCard.labels.map((label) => (
                    <span
                      key={label.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        padding: "2px 6px",
                        borderRadius: "var(--radius-badge)",
                        border: "1px solid oklch(var(--color-border))",
                        background: "oklch(var(--color-paper-2))",
                        fontSize: "var(--text-xs)",
                        color: "oklch(var(--color-ink-2))",
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: label.color, flexShrink: 0 }} />
                      {label.name}
                      {canEdit && (
                        <button
                          onClick={() => handleLabelToggle({ id: label.id, name: label.name, color: label.color })}
                          aria-label={`Remove label ${label.name}`}
                          style={{
                            background: "none", border: "none", cursor: "pointer",
                            color: "oklch(var(--color-ink-3))", fontSize: 12, lineHeight: 1,
                            padding: 0, marginLeft: 2,
                          }}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {/* Add label button */}
              {canEdit && (
                <button
                  onClick={() => setLabelPopoverOpen((v) => !v)}
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "oklch(var(--color-accent))",
                    background: "none",
                    border: "1px solid oklch(var(--color-border))",
                    borderRadius: "var(--radius-badge)",
                    padding: "3px 8px",
                    cursor: "pointer",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  + Add label
                </button>
              )}

              {/* Label popover */}
              {labelPopoverOpen && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "10px",
                    background: "oklch(var(--color-paper))",
                    border: "1px solid oklch(var(--color-border))",
                    borderRadius: "var(--radius-card)",
                    boxShadow: "0 4px 16px oklch(0% 0 0 / 0.12)",
                  }}
                >
                  {/* Existing labels */}
                  {boardLabels.length === 0 ? (
                    <p style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))", margin: "0 0 8px" }}>
                      No labels yet.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                      {boardLabels.map((label) => {
                        const assigned = localCard.labels.some((l) => l.id === label.id)
                        return (
                          <button
                            key={label.id}
                            onClick={() => handleLabelToggle(label)}
                            style={{
                              display: "flex", alignItems: "center", gap: 8,
                              background: assigned ? "oklch(var(--color-paper-2))" : "none",
                              border: "none", borderRadius: 4,
                              padding: "4px 6px", cursor: "pointer", textAlign: "left",
                              width: "100%",
                            }}
                          >
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: label.color, flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink))" }}>
                              {label.name}
                            </span>
                            {assigned && (
                              <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-accent))" }}>✓</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Create label inline form */}
                  <div style={{ borderTop: "1px solid oklch(var(--color-border))", paddingTop: 8 }}>
                    <p style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "oklch(var(--color-ink-3))", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Create label
                    </p>
                    <form onSubmit={handleCreateLabel} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <input
                        value={newLabelName}
                        onChange={(e) => setNewLabelName(e.target.value)}
                        placeholder="Label name"
                        maxLength={32}
                        style={{
                          padding: "5px 8px",
                          borderRadius: "var(--radius-input)",
                          border: "1px solid oklch(var(--color-border))",
                          background: "oklch(var(--color-paper-2))",
                          color: "oklch(var(--color-ink))",
                          fontSize: "var(--text-xs)",
                          fontFamily: "var(--font-body)",
                          outline: "none",
                        }}
                      />
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {LABEL_COLORS.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            title={c.name}
                            onClick={() => setNewLabelColor(c.value)}
                            style={{
                              width: 18, height: 18, borderRadius: "50%",
                              background: c.value,
                              border: newLabelColor === c.value ? "2px solid oklch(var(--color-ink))" : "2px solid transparent",
                              cursor: "pointer", padding: 0,
                            }}
                          />
                        ))}
                      </div>
                      <button
                        type="submit"
                        disabled={creatingLabel || !newLabelName.trim()}
                        style={{
                          padding: "5px 10px",
                          borderRadius: "var(--radius-button)",
                          border: "none",
                          background: creatingLabel || !newLabelName.trim()
                            ? "oklch(var(--color-muted))"
                            : "oklch(var(--color-accent))",
                          color: creatingLabel || !newLabelName.trim()
                            ? "oklch(var(--color-ink-3))"
                            : "#fff",
                          fontSize: "var(--text-xs)",
                          fontWeight: 600,
                          cursor: creatingLabel || !newLabelName.trim() ? "not-allowed" : "pointer",
                          fontFamily: "var(--font-body)",
                        }}
                      >
                        {creatingLabel ? "Creating…" : "Create & assign"}
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "var(--text-xs)",
        fontWeight: 600,
        color: "oklch(var(--color-ink-3))",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  )
}
