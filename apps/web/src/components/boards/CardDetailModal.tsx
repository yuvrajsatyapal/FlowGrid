import { useState, useEffect, useRef, useCallback } from "react"
import { motion } from "framer-motion"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import type { Priority } from "@flowgrid/types"
import type { CardSummary, CardLabel } from "../../api/cards"
import { cardsApi } from "../../api/cards"
import { cardDependenciesApi } from "../../api/cardDependencies"
import { setCardComplete } from "../../utils/dependencies"
import { labelsApi, type LabelSummary } from "../../api/labels"
import { workspacesApi, type WorkspaceMember } from "../../api/workspaces"
import { getInitials, getAvatarBg } from "../../utils/avatar"
import { useAuth } from "../../contexts/AuthContext"
import { useWindowWidth } from "../../hooks/useWindowWidth"
import { AttachmentSection } from "./AttachmentSection"
import ChecklistSection from "./ChecklistSection"
import DependenciesSection from "./DependenciesSection"
import WatchersSection from "./WatchersSection"

interface Props {
  card: CardSummary
  boardId: string
  workspaceId: string
  canEdit: boolean
  userRole?: string
  listName?: string
  listColor?: string
  onClose: () => void
  onCardUpdated: (updated: CardSummary) => void
  onCardDeleted?: (id: string) => void
  /** Propagate a label rename/recolor to every card on the board */
  onLabelUpdated?: (label: LabelSummary) => void
  /** Propagate a label deletion to every card on the board */
  onLabelDeleted?: (labelId: string) => void
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
]

function randomLabelColor() {
  return LABEL_COLORS[Math.floor(Math.random() * LABEL_COLORS.length)].value
}

// Derive short task ID from card ID (last 4 chars uppercased)
function taskShortId(id: string): string {
  return `TASK-${id.replace(/-/g, "").slice(-4).toUpperCase()}`
}

// Icons for header buttons
const TRASH_ICON = (
  <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M2 3.5h10M5.5 3.5V2.5a1 1 0 011-1h1a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 3.5l.5 8a1 1 0 001 1h5a1 1 0 001-1l.5-8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 6v4M8 6v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
)

const iconBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  borderRadius: "var(--radius-button)",
  border: "none",
  background: "transparent",
  color: "oklch(var(--color-ink-3))",
  cursor: "pointer",
  transition: "background var(--dur-fast), color var(--dur-fast)",
  flexShrink: 0,
}

// Compact icon button used for the per-label edit / delete actions in the picker
const labelIconBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 24,
  height: 24,
  borderRadius: 4,
  border: "none",
  background: "transparent",
  color: "oklch(var(--color-ink-3))",
  cursor: "pointer",
  flexShrink: 0,
}

export default function CardDetailModal({ card, boardId, workspaceId, canEdit, userRole, listName, listColor, onClose, onCardUpdated, onCardDeleted, onLabelUpdated, onLabelDeleted }: Props) {
  const { user } = useAuth()
  const [localCard, setLocalCard] = useState<CardSummary>(card)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [saveError, setSaveError] = useState("")
  const [deleting, setDeleting] = useState(false)

  // Completion + dependency-blocked state
  const [completing, setCompleting] = useState(false)
  const [blockedByActive, setBlockedByActive] = useState(true) // pessimistic until first refreshBlocked resolves
  const [showBlockedWarning, setShowBlockedWarning] = useState(false)
  const isComplete = localCard.completedAt != null

  // Members and Viewers are locked out of editing when the card is blocked
  const isOwnerOrAdmin = userRole === "OWNER" || userRole === "ADMIN"
  const isBlockLocked = blockedByActive && !isOwnerOrAdmin
  const effectiveCanEdit = canEdit && !isBlockLocked
  // Assignees who are admins or members can check/uncheck items even without full edit rights
  const canToggleChecklist =
    effectiveCanEdit ||
    (!isBlockLocked && (userRole === "ADMIN" || userRole === "MEMBER") && !!user?.id && user.id === localCard.assigneeId)

  // Sidebar data
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [boardLabels, setBoardLabels] = useState<LabelSummary[]>([])

  // Label popover
  const [labelPopoverOpen, setLabelPopoverOpen] = useState(false)
  const [newLabelName, setNewLabelName] = useState("")
  const [newLabelColor, setNewLabelColor] = useState(randomLabelColor)
  const [creatingLabel, setCreatingLabel] = useState(false)

  // Edit / delete an existing board label (from inside the picker)
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null)
  const [editLabelName, setEditLabelName] = useState("")
  const [editLabelColor, setEditLabelColor] = useState(LABEL_COLORS[0].value)
  const [confirmDeleteLabelId, setConfirmDeleteLabelId] = useState<string | null>(null)
  const [labelBusy, setLabelBusy] = useState(false)

  // Local date state — prevents controlled input from snapping back to "" while
  // the async saveField call is in-flight and localCard hasn't updated yet.
  const [localStartDate, setLocalStartDate] = useState(() =>
    localCard.startDate ? new Date(localCard.startDate).toISOString().split("T")[0] : ""
  )
  const [localDueDate, setLocalDueDate] = useState(() =>
    localCard.dueDate ? new Date(localCard.dueDate).toISOString().split("T")[0] : ""
  )
  useEffect(() => {
    setLocalStartDate(localCard.startDate ? new Date(localCard.startDate).toISOString().split("T")[0] : "")
  }, [localCard.startDate])
  useEffect(() => {
    setLocalDueDate(localCard.dueDate ? new Date(localCard.dueDate).toISOString().split("T")[0] : "")
  }, [localCard.dueDate])

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

  const handleDelete = useCallback(async () => {
    if (deleting) return
    setDeleting(true)
    try {
      await cardsApi.deleteCard(localCard.id)
      onCardDeleted?.(localCard.id)
      onClose()
    } catch (err: unknown) {
      setDeleting(false)
      alert((err as Error).message || "Failed to delete card")
    }
  }, [deleting, localCard.id, onCardDeleted, onClose])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") void flushAndCloseRef.current()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  // Compute whether this card is currently blocked (any "blocked by" dependency not completed)
  const refreshBlocked = useCallback(async () => {
    try {
      const deps = await cardDependenciesApi.get(localCard.id)
      setBlockedByActive(deps.blockedBy.some((d) => !d.card.completed))
    } catch { /* non-critical */ }
  }, [localCard.id])

  useEffect(() => { void refreshBlocked() }, [refreshBlocked])

  const applyComplete = useCallback(async (complete: boolean) => {
    if (completing) return
    setCompleting(true)
    try {
      const updated = await setCardComplete(localCard.id, complete)
      setLocalCard((prev) => ({ ...prev, completedAt: updated.completedAt }))
      onCardUpdated(updated)
    } catch (err: unknown) {
      alert((err as Error).message || "Failed to update completion")
    } finally {
      setCompleting(false)
    }
  }, [completing, localCard.id, onCardUpdated])

  function handleToggleComplete() {
    if (!isComplete && blockedByActive) {
      setShowBlockedWarning(true)
      return
    }
    void applyComplete(!isComplete)
  }

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
    editable: effectiveCanEdit,
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

  async function handleStartDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    if (!val) {
      // User cleared the date (browser's × button or keyboard)
      setLocalStartDate("")
      await saveField({ startDate: null })
      return
    }
    // Guard against partial / invalid dates (Firefox fires onChange on each keystroke)
    const parsed = new Date(`${val}T00:00:00.000Z`)
    if (isNaN(parsed.getTime())) return
    setLocalStartDate(val) // optimistic — prevents revert during async save
    await saveField({ startDate: parsed.toISOString() })
  }

  async function handleDueDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    if (!val) {
      // User cleared the date
      setLocalDueDate("")
      await saveField({ dueDate: null })
      return
    }
    // Guard against partial / invalid dates
    const parsed = new Date(`${val}T00:00:00.000Z`)
    if (isNaN(parsed.getTime())) return
    setLocalDueDate(val) // optimistic — prevents revert during async save
    await saveField({ dueDate: parsed.toISOString() })
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
      setNewLabelColor(randomLabelColor())
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

  function startEditLabel(label: LabelSummary) {
    setConfirmDeleteLabelId(null)
    setEditingLabelId(label.id)
    setEditLabelName(label.name)
    setEditLabelColor(label.color)
  }

  function cancelEditLabel() {
    setEditingLabelId(null)
    setEditLabelName("")
  }

  async function handleSaveLabelEdit(label: LabelSummary) {
    const name = editLabelName.trim()
    if (!name) return
    if (name === label.name && editLabelColor === label.color) {
      cancelEditLabel()
      return
    }
    setLabelBusy(true)
    setSaveState("saving")
    setSaveError("")
    try {
      const updated = await labelsApi.update(label.id, { name, color: editLabelColor })
      setBoardLabels((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
      if (localCard.labels.some((l) => l.id === updated.id)) {
        const next: CardSummary = {
          ...localCard,
          labels: localCard.labels.map((l) => (l.id === updated.id ? { ...l, name: updated.name, color: updated.color } : l)),
        }
        setLocalCard(next)
        onCardUpdated(next)
      }
      onLabelUpdated?.(updated)
      cancelEditLabel()
      showSaved()
    } catch (err: unknown) {
      setSaveState("error")
      setSaveError((err as Error).message || "Failed to update label")
    } finally {
      setLabelBusy(false)
    }
  }

  async function handleDeleteLabel(labelId: string) {
    setLabelBusy(true)
    setSaveState("saving")
    setSaveError("")
    try {
      await labelsApi.remove(labelId)
      setBoardLabels((prev) => prev.filter((l) => l.id !== labelId))
      if (localCard.labels.some((l) => l.id === labelId)) {
        const next: CardSummary = { ...localCard, labels: localCard.labels.filter((l) => l.id !== labelId) }
        setLocalCard(next)
        onCardUpdated(next)
      }
      onLabelDeleted?.(labelId)
      setConfirmDeleteLabelId(null)
      if (editingLabelId === labelId) cancelEditLabel()
      showSaved()
    } catch (err: unknown) {
      setSaveState("error")
      setSaveError((err as Error).message || "Failed to delete label")
    } finally {
      setLabelBusy(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  // startDateValue / dueDateValue are now kept in localStartDate / localDueDate state

  const windowWidth = useWindowWidth()
  const isMobile = windowWidth < 640

  // On mobile, the four content sections render as collapsible summary rows.
  // Set holds the keys of currently-expanded sections (all collapsed by default).
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const toggleSection = (key: string) =>
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })

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
        className="surface-pop"
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
          boxShadow: "var(--shadow-pop, 0 20px 60px oklch(0% 0 0 / 0.20))",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            padding: "14px 20px 12px",
            borderBottom: "1px solid oklch(var(--color-border))",
          }}
        >
          {/* Top row: task badge + status pill + actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            {/* TASK-XXXX badge */}
            <span
              style={{
                fontSize: "0.625rem",
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                letterSpacing: "0.06em",
                padding: "2px 7px",
                borderRadius: "var(--radius-badge)",
                background: "oklch(var(--color-paper-3))",
                color: "oklch(var(--color-ink-3))",
                flexShrink: 0,
              }}
            >
              {taskShortId(localCard.id)}
            </span>

            {/* Status pill = list name */}
            {listName && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: "0.625rem",
                  fontWeight: 600,
                  padding: "2px 7px",
                  borderRadius: "var(--radius-badge)",
                  background: listColor ? `${listColor}22` : "oklch(var(--color-accent-muted))",
                  color: listColor ?? "oklch(var(--color-accent))",
                  flexShrink: 0,
                }}
              >
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: listColor ?? "oklch(var(--color-accent))", flexShrink: 0 }} />
                {listName}
              </span>
            )}

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Completion toggle */}
            {effectiveCanEdit && (
              isMobile ? (
                /* Mobile: icon-only 28×28 button */
                <button
                  onClick={handleToggleComplete}
                  disabled={completing}
                  aria-pressed={isComplete}
                  title={isComplete ? "Mark as incomplete" : "Mark as complete"}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "var(--radius-button)",
                    border: isComplete ? "none" : "1px solid oklch(var(--color-border))",
                    background: isComplete ? "oklch(var(--color-success))" : "transparent",
                    color: isComplete ? "#fff" : "oklch(var(--color-ink-2))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: completing ? "default" : "pointer",
                    opacity: completing ? 0.6 : 1,
                    flexShrink: 0,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M2.5 6.2l2.2 2.2L9.5 3.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : (
                /* Desktop: existing text button — unchanged */
                <button
                  onClick={handleToggleComplete}
                  disabled={completing}
                  aria-pressed={isComplete}
                  title={isComplete ? "Mark as incomplete" : "Mark as complete"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 12px",
                    borderRadius: "var(--radius-button)",
                    border: isComplete ? "none" : "1px solid oklch(var(--color-border))",
                    background: isComplete ? "oklch(var(--color-success))" : "transparent",
                    color: isComplete ? "#fff" : "oklch(var(--color-ink-2))",
                    fontSize: "var(--text-xs)",
                    fontWeight: 600,
                    fontFamily: "var(--font-body)",
                    cursor: completing ? "default" : "pointer",
                    opacity: completing ? 0.6 : 1,
                    flexShrink: 0,
                  }}
                >
                  <span style={{
                    width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                    border: isComplete ? "none" : "1.5px solid oklch(var(--color-ink-3))",
                    background: isComplete ? "rgba(255,255,255,0.25)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {isComplete && (
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M2.5 6.2l2.2 2.2L9.5 3.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  {isComplete ? "Completed" : "Mark as Complete"}
                </button>
              )
            )}

            {/* Delete card */}
            {effectiveCanEdit && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                aria-label="Delete card"
                title="Delete card"
                style={{ ...iconBtnStyle, cursor: deleting ? "default" : "pointer", opacity: deleting ? 0.5 : 1 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "oklch(var(--color-error) / 0.12)"; (e.currentTarget as HTMLButtonElement).style.color = "oklch(var(--color-error))" }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "oklch(var(--color-ink-3))" }}
              >
                {TRASH_ICON}
              </button>
            )}

            {/* Close */}
            <button
              onClick={flushAndClose}
              aria-label="Close"
              style={{ ...iconBtnStyle, fontSize: 16, fontWeight: 400 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "oklch(var(--color-paper-3))"; (e.currentTarget as HTMLButtonElement).style.color = "oklch(var(--color-ink))" }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "oklch(var(--color-ink-3))" }}
            >
              ×
            </button>
          </div>

          {/* Bottom row: title + save indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              id="card-modal-title"
              defaultValue={localCard.title}
              onBlur={handleTitleBlur}
              disabled={!effectiveCanEdit}
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
              onFocus={(e) => { e.currentTarget.style.background = "oklch(var(--color-paper-2))" }}
              onBlurCapture={(e) => { e.currentTarget.style.background = "transparent" }}
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
          </div>
        </div>

        {/* Block lock banner — shown to Members/Viewers when card has active blockers */}
        {isBlockLocked && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 20px",
              background: "oklch(var(--color-error) / 0.08)",
              borderBottom: "1px solid oklch(var(--color-error) / 0.20)",
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              color: "oklch(var(--color-error))",
              flexShrink: 0,
            }}
          >
            🔒 This card is blocked — resolve its dependencies before making changes
          </div>
        )}

        {/* ── Body ── */}
        {isMobile ? (
          <div style={{ display: "flex", flexDirection: "column" }}>

            {/* Row 1: Priority (left) + Due Date (right) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                borderBottom: "1px solid oklch(var(--color-border))",
              }}
            >
              {/* Priority cell */}
              <div
                style={{
                  padding: "12px 14px",
                  borderRight: "1px solid oklch(var(--color-border))",
                }}
              >
                <FieldLabel>Priority</FieldLabel>
                <select
                  value={localCard.priority}
                  onChange={handlePriorityChange}
                  disabled={!effectiveCanEdit}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: "var(--radius-input)",
                    border: "1px solid oklch(var(--color-border))",
                    background: "oklch(var(--color-paper-2))",
                    color: "oklch(var(--color-ink))",
                    fontSize: "var(--text-sm)",
                    fontFamily: "var(--font-body)",
                    cursor: effectiveCanEdit ? "pointer" : "default",
                  }}
                >
                  {PRIORITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Due Date cell */}
              <div style={{ padding: "12px 14px" }}>
                <FieldLabel>Due Date</FieldLabel>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="date"
                    value={localDueDate}
                    onChange={handleDueDateChange}
                    disabled={!effectiveCanEdit}
                    style={{
                      flex: 1,
                      padding: "6px 8px",
                      borderRadius: "var(--radius-input)",
                      border: "1px solid oklch(var(--color-border))",
                      background: "oklch(var(--color-paper-2))",
                      color: localDueDate ? "oklch(var(--color-ink))" : "oklch(var(--color-ink-3))",
                      fontSize: "var(--text-sm)",
                      fontFamily: "var(--font-body)",
                      cursor: effectiveCanEdit ? "pointer" : "default",
                      colorScheme: "dark",
                      minWidth: 0,
                    }}
                  />
                  {localDueDate && effectiveCanEdit && (
                    <button
                      onClick={() => { setLocalDueDate(""); void saveField({ dueDate: null }) }}
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
            </div>

            {/* Row 2: Start Date (left) + Assignee (right) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                borderBottom: "1px solid oklch(var(--color-border))",
              }}
            >
              {/* Start Date cell */}
              <div
                style={{
                  padding: "12px 14px",
                  borderRight: "1px solid oklch(var(--color-border))",
                }}
              >
                <FieldLabel>Start Date</FieldLabel>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="date"
                    value={localStartDate}
                    onChange={handleStartDateChange}
                    disabled={!effectiveCanEdit}
                    style={{
                      flex: 1,
                      padding: "6px 8px",
                      borderRadius: "var(--radius-input)",
                      border: "1px solid oklch(var(--color-border))",
                      background: "oklch(var(--color-paper-2))",
                      color: localStartDate ? "oklch(var(--color-ink))" : "oklch(var(--color-ink-3))",
                      fontSize: "var(--text-sm)",
                      fontFamily: "var(--font-body)",
                      cursor: effectiveCanEdit ? "pointer" : "default",
                      colorScheme: "dark",
                      minWidth: 0,
                    }}
                  />
                  {localStartDate && effectiveCanEdit && (
                    <button
                      onClick={() => { setLocalStartDate(""); void saveField({ startDate: null }) }}
                      aria-label="Clear start date"
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

              {/* Assignee cell */}
              <div style={{ padding: "12px 14px" }}>
                <FieldLabel>Assignee</FieldLabel>
                <select
                  value={localCard.assigneeId ?? ""}
                  onChange={handleAssigneeChange}
                  disabled={!effectiveCanEdit}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: "var(--radius-input)",
                    border: "1px solid oklch(var(--color-border))",
                    background: "oklch(var(--color-paper-2))",
                    color: "oklch(var(--color-ink))",
                    fontSize: "var(--text-sm)",
                    fontFamily: "var(--font-body)",
                    cursor: effectiveCanEdit ? "pointer" : "default",
                  }}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    // value must be the User.id (m.userId), NOT the WorkspaceMember record id (m.id)
                    // The backend validates assigneeId against workspaceMember.userId
                    <option key={m.id} value={m.userId}>
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
            </div>

            {/* Labels — full width */}
            <div style={{ padding: "12px 14px", borderBottom: "1px solid oklch(var(--color-border))" }}>
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
                      {effectiveCanEdit && (
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

              {/* Add label button + popover (mobile: fixed centered overlay) */}
              {effectiveCanEdit && (
                <div style={{ position: "relative" }}>
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

                  {/* Mobile label popover — fixed centered */}
                  {labelPopoverOpen && (
                    <>
                    <div
                      style={{ position: "fixed", inset: 0, zIndex: 399 }}
                      onClick={() => setLabelPopoverOpen(false)}
                    />
                    <div
                      style={{
                        position: "fixed",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        width: 240,
                        maxHeight: 320,
                        overflowY: "auto",
                        zIndex: 400,
                        padding: "10px",
                        background: "oklch(var(--color-paper))",
                        border: "1px solid oklch(var(--color-border))",
                        borderRadius: "var(--radius-card)",
                        boxShadow: "0 8px 24px oklch(0% 0 0 / 0.18)",
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

                            // Inline editor for this label
                            if (editingLabelId === label.id) {
                              return (
                                <div
                                  key={label.id}
                                  style={{
                                    display: "flex", flexDirection: "column", gap: 8,
                                    padding: 10,
                                    background: "oklch(var(--color-paper-2))",
                                    border: "1px solid oklch(var(--color-accent) / 0.5)",
                                    borderRadius: 8,
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: editLabelColor, flexShrink: 0 }} />
                                    <span style={{ flex: 1, fontSize: "0.625rem", fontWeight: 700, color: "oklch(var(--color-ink-3))", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                      Edit label
                                    </span>
                                  </div>
                                  <input
                                    value={editLabelName}
                                    onChange={(e) => setEditLabelName(e.target.value)}
                                    maxLength={32}
                                    autoFocus
                                    placeholder="Label name"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") { e.preventDefault(); handleSaveLabelEdit(label) }
                                      if (e.key === "Escape") cancelEditLabel()
                                    }}
                                    style={{
                                      width: "100%", boxSizing: "border-box",
                                      padding: "6px 8px", borderRadius: "var(--radius-input)",
                                      border: "1px solid oklch(var(--color-border))", background: "oklch(var(--color-paper))",
                                      color: "oklch(var(--color-ink))", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", outline: "none",
                                    }}
                                  />
                                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                    {LABEL_COLORS.map((c) => (
                                      <button
                                        key={c.value}
                                        type="button"
                                        aria-label={c.name}
                                        onClick={() => setEditLabelColor(c.value)}
                                        style={{
                                          width: 20, height: 20, borderRadius: "50%", background: c.value,
                                          border: editLabelColor === c.value ? "2px solid oklch(var(--color-ink))" : "2px solid oklch(var(--color-border))",
                                          cursor: "pointer", padding: 0, flexShrink: 0,
                                        }}
                                      />
                                    ))}
                                  </div>
                                  <div style={{ display: "flex", gap: 6 }}>
                                    <button
                                      onClick={() => handleSaveLabelEdit(label)}
                                      disabled={labelBusy || !editLabelName.trim()}
                                      style={{ flex: 1, padding: "6px 8px", borderRadius: "var(--radius-button)", border: "none", background: "oklch(var(--color-accent))", color: "#fff", fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "var(--font-body)", cursor: labelBusy || !editLabelName.trim() ? "not-allowed" : "pointer", opacity: labelBusy || !editLabelName.trim() ? 0.55 : 1 }}
                                    >
                                      {labelBusy ? "Saving…" : "Save"}
                                    </button>
                                    <button
                                      onClick={cancelEditLabel}
                                      disabled={labelBusy}
                                      style={{ flex: 1, padding: "6px 8px", borderRadius: "var(--radius-button)", border: "1px solid oklch(var(--color-border))", background: "oklch(var(--color-paper))", color: "oklch(var(--color-ink-2))", fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "var(--font-body)", cursor: "pointer" }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )
                            }

                            // Delete confirmation for this label
                            if (confirmDeleteLabelId === label.id) {
                              return (
                                <div key={label.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: 6, background: "oklch(var(--color-error) / 0.08)", borderRadius: 6 }}>
                                  <span style={{ flex: 1, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-2))" }}>
                                    Delete "{label.name}"?
                                  </span>
                                  <button
                                    onClick={() => handleDeleteLabel(label.id)}
                                    disabled={labelBusy}
                                    style={{ padding: "4px 8px", borderRadius: "var(--radius-button)", border: "none", background: "oklch(var(--color-error))", color: "#fff", fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "var(--font-body)", cursor: "pointer" }}
                                  >
                                    {labelBusy ? "…" : "Delete"}
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteLabelId(null)}
                                    disabled={labelBusy}
                                    style={{ padding: "4px 8px", borderRadius: "var(--radius-button)", border: "1px solid oklch(var(--color-border))", background: "none", color: "oklch(var(--color-ink-2))", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", cursor: "pointer" }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )
                            }

                            // Normal row: toggle assignment + edit + delete
                            return (
                              <div key={label.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                                <button
                                  onClick={() => handleLabelToggle(label)}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 8, flex: 1,
                                    background: assigned ? "oklch(var(--color-paper-2))" : "none",
                                    border: "none", borderRadius: 4,
                                    padding: "4px 6px", cursor: "pointer", textAlign: "left",
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
                                <button
                                  onClick={() => startEditLabel(label)}
                                  aria-label={`Edit label ${label.name}`}
                                  style={labelIconBtnStyle}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = "oklch(var(--color-paper-3))"; e.currentTarget.style.color = "oklch(var(--color-ink))" }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "oklch(var(--color-ink-3))" }}
                                >
                                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                    <path d="M9.5 2.5l2 2L5 11l-2.5.5L3 9l6.5-6.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => { setEditingLabelId(null); setConfirmDeleteLabelId(label.id) }}
                                  aria-label={`Delete label ${label.name}`}
                                  style={{ ...labelIconBtnStyle, color: "oklch(var(--color-error))" }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = "oklch(var(--color-error) / 0.12)" }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
                                >
                                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                    <path d="M2 3.5h10M5.5 3.5V2.5a1 1 0 011-1h1a1 1 0 011 1v1M3 3.5l.5 8a1 1 0 001 1h5a1 1 0 001-1l.5-8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </button>
                              </div>
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
                              background: "oklch(var(--color-accent))",
                              color: "#fff",
                              fontSize: "var(--text-xs)",
                              fontWeight: 600,
                              cursor: creatingLabel || !newLabelName.trim() ? "not-allowed" : "pointer",
                              opacity: creatingLabel || !newLabelName.trim() ? 0.55 : 1,
                              fontFamily: "var(--font-body)",
                            }}
                          >
                            {creatingLabel ? "Creating…" : "Create & assign"}
                          </button>
                        </form>
                      </div>
                    </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Description — full width */}
            <div style={{ padding: "16px 14px", borderBottom: "1px solid oklch(var(--color-border))" }}>
              <FieldLabel>Description</FieldLabel>
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
            </div>

            {/* Checklist — collapsible */}
            <MobileSectionRow
              icon="✓"
              title="Checklist"
              summary={localCard.checklistTotal > 0 ? `${localCard.checklistDone}/${localCard.checklistTotal}` : undefined}
              expanded={expandedSections.has("checklist")}
              onToggle={() => toggleSection("checklist")}
            >
              <ChecklistSection cardId={localCard.id} canEdit={effectiveCanEdit} canToggle={canToggleChecklist} />
            </MobileSectionRow>

            {/* Attachments — collapsible */}
            <MobileSectionRow
              icon="📎"
              title="Attachments"
              summary={localCard.attachmentCount > 0 ? `${localCard.attachmentCount} file${localCard.attachmentCount === 1 ? "" : "s"}` : undefined}
              expanded={expandedSections.has("attachments")}
              onToggle={() => toggleSection("attachments")}
            >
              <AttachmentSection cardId={localCard.id} canEdit={effectiveCanEdit} />
            </MobileSectionRow>

            {/* Watchers — collapsible */}
            {user && (
              <MobileSectionRow
                icon="👁"
                title="Watchers"
                expanded={expandedSections.has("watchers")}
                onToggle={() => toggleSection("watchers")}
              >
                <WatchersSection cardId={localCard.id} currentUserId={user.id} assigneeId={localCard.assigneeId} />
              </MobileSectionRow>
            )}

            {/* Dependencies — collapsible, last section */}
            <MobileSectionRow
              icon="🔗"
              title="Dependencies"
              expanded={expandedSections.has("dependencies")}
              onToggle={() => toggleSection("dependencies")}
              isLast
            >
              <DependenciesSection cardId={localCard.id} boardId={boardId} canEdit={effectiveCanEdit} onChanged={() => void refreshBlocked()} />
            </MobileSectionRow>

          </div>
        ) : (
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

              {/* Checklists */}
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid oklch(var(--color-border))" }}>
                <ChecklistSection cardId={localCard.id} canEdit={effectiveCanEdit} canToggle={canToggleChecklist} />
              </div>

              {/* Attachments */}
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid oklch(var(--color-border))" }}>
                <AttachmentSection cardId={localCard.id} canEdit={effectiveCanEdit} />
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
                  disabled={!effectiveCanEdit}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: "var(--radius-input)",
                    border: "1px solid oklch(var(--color-border))",
                    background: "oklch(var(--color-paper-2))",
                    color: "oklch(var(--color-ink))",
                    fontSize: "var(--text-sm)",
                    fontFamily: "var(--font-body)",
                    cursor: effectiveCanEdit ? "pointer" : "default",
                  }}
                >
                  {PRIORITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Start date */}
              <div>
                <FieldLabel>Start Date</FieldLabel>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="date"
                    value={localStartDate}
                    onChange={handleStartDateChange}
                    disabled={!effectiveCanEdit}
                    style={{
                      flex: 1,
                      padding: "6px 8px",
                      borderRadius: "var(--radius-input)",
                      border: "1px solid oklch(var(--color-border))",
                      background: "oklch(var(--color-paper-2))",
                      color: localStartDate ? "oklch(var(--color-ink))" : "oklch(var(--color-ink-3))",
                      fontSize: "var(--text-sm)",
                      fontFamily: "var(--font-body)",
                      cursor: effectiveCanEdit ? "pointer" : "default",
                      colorScheme: "dark",
                    }}
                  />
                  {localStartDate && effectiveCanEdit && (
                    <button
                      onClick={() => { setLocalStartDate(""); void saveField({ startDate: null }) }}
                      aria-label="Clear start date"
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

              {/* Due date */}
              <div>
                <FieldLabel>Due Date</FieldLabel>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="date"
                    value={localDueDate}
                    onChange={handleDueDateChange}
                    disabled={!effectiveCanEdit}
                    style={{
                      flex: 1,
                      padding: "6px 8px",
                      borderRadius: "var(--radius-input)",
                      border: "1px solid oklch(var(--color-border))",
                      background: "oklch(var(--color-paper-2))",
                      color: localDueDate ? "oklch(var(--color-ink))" : "oklch(var(--color-ink-3))",
                      fontSize: "var(--text-sm)",
                      fontFamily: "var(--font-body)",
                      cursor: effectiveCanEdit ? "pointer" : "default",
                      colorScheme: "dark",
                    }}
                  />
                  {localDueDate && effectiveCanEdit && (
                    <button
                      onClick={() => { setLocalDueDate(""); void saveField({ dueDate: null }) }}
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
                  disabled={!effectiveCanEdit}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: "var(--radius-input)",
                    border: "1px solid oklch(var(--color-border))",
                    background: "oklch(var(--color-paper-2))",
                    color: "oklch(var(--color-ink))",
                    fontSize: "var(--text-sm)",
                    fontFamily: "var(--font-body)",
                    cursor: effectiveCanEdit ? "pointer" : "default",
                  }}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    // value must be the User.id (m.userId), NOT the WorkspaceMember record id (m.id)
                    // The backend validates assigneeId against workspaceMember.userId
                    <option key={m.id} value={m.userId}>
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
                        {effectiveCanEdit && (
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

                {/* Add label button + popover (popover opens upward as an overlay so it
                    doesn't push the rest of the modal down) */}
                {effectiveCanEdit && (
                  <div style={{ position: "relative" }}>
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

                {/* Label popover */}
                {labelPopoverOpen && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "calc(100% + 6px)",
                      left: 0,
                      width: 240,
                      maxHeight: 320,
                      overflowY: "auto",
                      zIndex: 30,
                      padding: "10px",
                      background: "oklch(var(--color-paper))",
                      border: "1px solid oklch(var(--color-border))",
                      borderRadius: "var(--radius-card)",
                      boxShadow: "0 8px 24px oklch(0% 0 0 / 0.18)",
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

                          // Inline editor for this label
                          if (editingLabelId === label.id) {
                            return (
                              <div
                                key={label.id}
                                style={{
                                  display: "flex", flexDirection: "column", gap: 8,
                                  padding: 10,
                                  background: "oklch(var(--color-paper-2))",
                                  border: "1px solid oklch(var(--color-accent) / 0.5)",
                                  borderRadius: 8,
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: editLabelColor, flexShrink: 0 }} />
                                  <span style={{ flex: 1, fontSize: "0.625rem", fontWeight: 700, color: "oklch(var(--color-ink-3))", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                    Edit label
                                  </span>
                                </div>
                                <input
                                  value={editLabelName}
                                  onChange={(e) => setEditLabelName(e.target.value)}
                                  maxLength={32}
                                  autoFocus
                                  placeholder="Label name"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") { e.preventDefault(); handleSaveLabelEdit(label) }
                                    if (e.key === "Escape") cancelEditLabel()
                                  }}
                                  style={{
                                    width: "100%", boxSizing: "border-box",
                                    padding: "6px 8px", borderRadius: "var(--radius-input)",
                                    border: "1px solid oklch(var(--color-border))", background: "oklch(var(--color-paper))",
                                    color: "oklch(var(--color-ink))", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", outline: "none",
                                  }}
                                />
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                  {LABEL_COLORS.map((c) => (
                                    <button
                                      key={c.value}
                                      type="button"
                                      aria-label={c.name}
                                      onClick={() => setEditLabelColor(c.value)}
                                      style={{
                                        width: 20, height: 20, borderRadius: "50%", background: c.value,
                                        border: editLabelColor === c.value ? "2px solid oklch(var(--color-ink))" : "2px solid oklch(var(--color-border))",
                                        cursor: "pointer", padding: 0, flexShrink: 0,
                                      }}
                                    />
                                  ))}
                                </div>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button
                                    onClick={() => handleSaveLabelEdit(label)}
                                    disabled={labelBusy || !editLabelName.trim()}
                                    style={{ flex: 1, padding: "6px 8px", borderRadius: "var(--radius-button)", border: "none", background: "oklch(var(--color-accent))", color: "#fff", fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "var(--font-body)", cursor: labelBusy || !editLabelName.trim() ? "not-allowed" : "pointer", opacity: labelBusy || !editLabelName.trim() ? 0.55 : 1 }}
                                  >
                                    {labelBusy ? "Saving…" : "Save"}
                                  </button>
                                  <button
                                    onClick={cancelEditLabel}
                                    disabled={labelBusy}
                                    style={{ flex: 1, padding: "6px 8px", borderRadius: "var(--radius-button)", border: "1px solid oklch(var(--color-border))", background: "oklch(var(--color-paper))", color: "oklch(var(--color-ink-2))", fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "var(--font-body)", cursor: "pointer" }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )
                          }

                          // Delete confirmation for this label
                          if (confirmDeleteLabelId === label.id) {
                            return (
                              <div key={label.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: 6, background: "oklch(var(--color-error) / 0.08)", borderRadius: 6 }}>
                                <span style={{ flex: 1, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-2))" }}>
                                  Delete "{label.name}"?
                                </span>
                                <button
                                  onClick={() => handleDeleteLabel(label.id)}
                                  disabled={labelBusy}
                                  style={{ padding: "4px 8px", borderRadius: "var(--radius-button)", border: "none", background: "oklch(var(--color-error))", color: "#fff", fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "var(--font-body)", cursor: "pointer" }}
                                >
                                  {labelBusy ? "…" : "Delete"}
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteLabelId(null)}
                                  disabled={labelBusy}
                                  style={{ padding: "4px 8px", borderRadius: "var(--radius-button)", border: "1px solid oklch(var(--color-border))", background: "none", color: "oklch(var(--color-ink-2))", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", cursor: "pointer" }}
                                >
                                  Cancel
                                </button>
                              </div>
                            )
                          }

                          // Normal row: toggle assignment + edit + delete
                          return (
                            <div key={label.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                              <button
                                onClick={() => handleLabelToggle(label)}
                                style={{
                                  display: "flex", alignItems: "center", gap: 8, flex: 1,
                                  background: assigned ? "oklch(var(--color-paper-2))" : "none",
                                  border: "none", borderRadius: 4,
                                  padding: "4px 6px", cursor: "pointer", textAlign: "left",
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
                              <button
                                onClick={() => startEditLabel(label)}
                                aria-label={`Edit label ${label.name}`}
                                style={labelIconBtnStyle}
                                onMouseEnter={(e) => { e.currentTarget.style.background = "oklch(var(--color-paper-3))"; e.currentTarget.style.color = "oklch(var(--color-ink))" }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "oklch(var(--color-ink-3))" }}
                              >
                                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                  <path d="M9.5 2.5l2 2L5 11l-2.5.5L3 9l6.5-6.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                                </svg>
                              </button>
                              <button
                                onClick={() => { setEditingLabelId(null); setConfirmDeleteLabelId(label.id) }}
                                aria-label={`Delete label ${label.name}`}
                                style={{ ...labelIconBtnStyle, color: "oklch(var(--color-error))" }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = "oklch(var(--color-error) / 0.12)" }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
                              >
                                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                  <path d="M2 3.5h10M5.5 3.5V2.5a1 1 0 011-1h1a1 1 0 011 1v1M3 3.5l.5 8a1 1 0 001 1h5a1 1 0 001-1l.5-8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                            </div>
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
                            background: "oklch(var(--color-accent))",
                            color: "#fff",
                            fontSize: "var(--text-xs)",
                            fontWeight: 600,
                            cursor: creatingLabel || !newLabelName.trim() ? "not-allowed" : "pointer",
                            opacity: creatingLabel || !newLabelName.trim() ? 0.55 : 1,
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
                )}
              </div>

              {/* Watchers */}
              {user && (
                <div style={{ paddingTop: 16, borderTop: "1px solid oklch(var(--color-border))" }}>
                  <WatchersSection cardId={localCard.id} currentUserId={user.id} assigneeId={localCard.assigneeId} />
                </div>
              )}

              {/* Dependencies */}
              <div style={{ paddingTop: 16, borderTop: "1px solid oklch(var(--color-border))" }}>
                <DependenciesSection cardId={localCard.id} boardId={boardId} canEdit={effectiveCanEdit} onChanged={() => void refreshBlocked()} />
              </div>

            </div>
          </div>
        )}

        {/* Blocked-completion warning */}
        {showBlockedWarning && (
          <div
            onClick={(e) => { if (e.target === e.currentTarget) setShowBlockedWarning(false) }}
            style={{ position: "absolute", inset: 0, background: "oklch(0% 0 0 / 0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, borderRadius: "var(--radius-modal)", padding: 24 }}
          >
            <div className="surface-pop" style={{ width: "100%", maxWidth: 380, background: "oklch(var(--color-paper))", border: "1px solid oklch(var(--color-border))", borderRadius: "var(--radius-modal)", boxShadow: "var(--shadow-pop, 0 20px 60px oklch(0% 0 0 / 0.2))", padding: 20 }}>
              <h3 style={{ margin: "0 0 8px", fontSize: "var(--text-base)", fontWeight: 700, fontFamily: "var(--font-display)", color: "oklch(var(--color-ink))" }}>
                This task is blocked
              </h3>
              <p style={{ margin: "0 0 18px", fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))", lineHeight: 1.5 }}>
                This task is still waiting on one or more dependency cards. Are you sure you want to mark it as completed?
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  onClick={() => setShowBlockedWarning(false)}
                  style={{ padding: "8px 14px", borderRadius: "var(--radius-button)", border: "1px solid oklch(var(--color-border))", background: "oklch(var(--color-paper-2))", color: "oklch(var(--color-ink-2))", fontSize: "var(--text-sm)", fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-body)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setShowBlockedWarning(false); void applyComplete(true) }}
                  style={{ padding: "8px 14px", borderRadius: "var(--radius-button)", border: "none", background: "oklch(var(--color-accent))", color: "#fff", fontSize: "var(--text-sm)", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}
                >
                  Mark Complete Anyway
                </button>
              </div>
            </div>
          </div>
        )}
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

// Collapsible summary row for the mobile card detail. Shows an icon + title +
// a short summary on the right, with a chevron that rotates when expanded.
// The section's full content renders below the row only when open.
function MobileSectionRow({
  icon,
  title,
  summary,
  expanded,
  onToggle,
  isLast = false,
  children,
}: {
  icon: string
  title: string
  summary?: string
  expanded: boolean
  onToggle: () => void
  isLast?: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{ borderBottom: isLast ? "none" : "1px solid oklch(var(--color-border))" }}>
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "13px 14px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontFamily: "var(--font-body)",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "oklch(var(--color-ink))", flex: 1 }}>
          {title}
        </span>
        {summary && (
          <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))", flexShrink: 0 }}>
            {summary}
          </span>
        )}
        <span
          style={{
            fontSize: 11,
            color: "oklch(var(--color-ink-3))",
            flexShrink: 0,
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
            display: "inline-block",
          }}
          aria-hidden="true"
        >
          ▸
        </span>
      </button>
      {expanded && <div style={{ padding: "0 14px 16px" }}>{children}</div>}
    </div>
  )
}
