import { useEffect, useState, useCallback, useRef } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useParams, Link, useNavigate } from "react-router-dom"
import { workspacesApi, type WorkspaceDetail } from "../api/workspaces"
import { boardsApi, type BoardSummary } from "../api/boards"
import { activitiesApi } from "../api/activities"
import { cardsApi, type UpcomingCard } from "../api/cards"
import BoardCard from "../components/boards/BoardCard"
import CreateBoardModal from "../components/boards/CreateBoardModal"
import EditBoardModal from "../components/boards/EditBoardModal"
import type { ActivityResponse } from "@flowgrid/types"
import { getInitials, getAvatarBg } from "../utils/avatar"
import { useAuth } from "../contexts/AuthContext"
import { useWorkspaceSocket } from "../hooks/useWorkspaceSocket"

// ── Icons ──────────────────────────────────────────────────────────────────────

const MEMBERS_ICON = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <circle cx="5" cy="4.5" r="2.25" stroke="currentColor" strokeWidth="1.1" />
    <path d="M0.5 12c0-2.49 2.01-4.5 4.5-4.5s4.5 2.01 4.5 4.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    <circle cx="11" cy="4.5" r="1.5" stroke="currentColor" strokeWidth="1.1" />
    <path d="M13 11c0-1.24-.8-2.3-1.9-2.66" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
  </svg>
)

const PLUS_ICON = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

const SEARCH_ICON = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.25" />
    <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
  </svg>
)

const GRID_ICON = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.25" />
    <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.25" />
    <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.25" />
    <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.25" />
  </svg>
)

const LIST_ICON = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <line x1="1" y1="3.5" x2="13" y2="3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    <line x1="1" y1="10.5" x2="13" y2="10.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
  </svg>
)

const FLAG_ICON = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M2 1.5v9M2 1.5l6 2-6 2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const CHEVRON_LEFT = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const CHEVRON_RIGHT = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const ACTIVITY_ICON = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <polyline points="1,6 3,3 5,8 7,4 9,6 11,6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
)

// ── Style helpers ──────────────────────────────────────────────────────────────

const secondaryBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "8px 14px",
  borderRadius: "var(--radius-button)",
  border: "1px solid oklch(var(--color-border))",
  background: "oklch(var(--color-paper-2))",
  color: "oklch(var(--color-ink-2))",
  fontSize: "var(--text-sm)",
  fontWeight: 500,
  cursor: "pointer",
  textDecoration: "none",
  whiteSpace: "nowrap",
  fontFamily: "var(--font-body)",
  transition: "background var(--dur-fast)",
}

const inviteBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "8px 16px",
  borderRadius: "var(--radius-button)",
  border: "1px solid oklch(var(--color-accent) / 0.3)",
  background: "oklch(var(--color-accent-muted))",
  color: "oklch(var(--color-accent))",
  fontSize: "var(--text-sm)",
  fontWeight: 500,
  cursor: "pointer",
  textDecoration: "none",
  whiteSpace: "nowrap",
  fontFamily: "var(--font-body)",
  transition: "background var(--dur-fast)",
}

function paginationBtn(disabled: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    padding: "8px 18px",
    borderRadius: "var(--radius-button)",
    border: "1px solid oklch(var(--color-border))",
    background: disabled ? "transparent" : "oklch(var(--color-paper-2))",
    color: disabled ? "oklch(var(--color-ink-3))" : "oklch(var(--color-ink-2))",
    fontSize: "var(--text-sm)",
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    fontFamily: "var(--font-body)",
    transition: "background var(--dur-fast)",
  }
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 15
const PAGE_SIZE_LIST = 10

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function dueDateLabel(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((date.getTime() - now.setHours(0, 0, 0, 0)) / 86400000)
  if (diffDays === 0) return "TODAY"
  if (diffDays === 1) return "TOMORROW"
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function dueDateColor(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((date.getTime() - now.setHours(0, 0, 0, 0)) / 86400000)
  if (diffDays <= 0) return "oklch(var(--color-error))"
  if (diffDays === 1) return "oklch(var(--color-warning, 0.75 0.15 80))"
  return "oklch(var(--color-accent))"
}

function formatActivityText(activity: ActivityResponse): React.ReactNode {
  const name = activity.user?.name ?? "Someone"
  const meta = activity.metadata as Record<string, string>
  const actionMap: Record<string, string> = {
    card_created: "created card",
    card_updated: "updated",
    card_moved: "moved a card",
    card_deleted: "deleted a card",
    comment_added: "commented on",
    label_added: "added a label to",
    label_removed: "removed a label from",
    checklist_item_checked: "completed a checklist item in",
    attachment_added: "added an attachment to",
    assignee_changed: "changed assignee in",
    due_date_set: "set a due date on",
    due_date_changed: "changed due date on",
    title_changed: "renamed",
    priority_changed: "changed priority of",
    card_completed: "completed",
    card_reopened: "reopened",
  }
  const verb = actionMap[activity.action] ?? activity.action.replace(/_/g, " ")
  const cardName = activity.cardTitle ?? meta.cardTitle ?? meta.title ?? ""
  return (
    <>
      <strong>{name}</strong> {verb}{cardName ? <> <strong style={{ fontWeight: 600 }}>{cardName}</strong></> : ""}
    </>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

type FilterType = "all" | "pinned"
type ViewType = "grid" | "list"

function getPinnedKey(workspaceId: string): string {
  return `flowgrid:pinned:${workspaceId}`
}

function loadPinned(workspaceId: string): Set<string> {
  try {
    const raw = localStorage.getItem(getPinnedKey(workspaceId))
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function savePinned(workspaceId: string, ids: Set<string>): void {
  try {
    localStorage.setItem(getPinnedKey(workspaceId), JSON.stringify([...ids]))
  } catch { /* ignore */ }
}

// ── Board search shortcut hint ─────────────────────────────────────────────────

const LS_BOARD_HINT_COUNT = "flowgrid:boardSearchShortcutHintCount"
const LS_BOARD_SHORTCUT_USED = "flowgrid:hasUsedBoardSearchShortcut"

function getBoardHintCount(): number {
  try { return parseInt(localStorage.getItem(LS_BOARD_HINT_COUNT) ?? "0", 10) || 0 } catch { return 0 }
}
function setBoardHintCount(n: number): void {
  try { localStorage.setItem(LS_BOARD_HINT_COUNT, String(n)) } catch {}
}
function isBoardShortcutLearned(): boolean {
  try { return localStorage.getItem(LS_BOARD_SHORTCUT_USED) === "true" } catch { return false }
}
function markBoardShortcutLearned(): void {
  try { localStorage.setItem(LS_BOARD_SHORTCUT_USED, "true") } catch {}
}

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)

function BoardSearchShortcutHint({ variant, onDismiss }: { variant: 1 | 2; onDismiss: () => void }) {
  const shortcutKey = IS_MAC ? "⌘K" : "Ctrl+K"
  const altPlatform = IS_MAC ? "Ctrl+K on Windows/Linux" : "⌘K on macOS"

  useEffect(() => {
    const ms = variant === 1 ? 5000 : 4000
    const id = setTimeout(onDismiss, ms)
    return () => clearTimeout(id)
  }, [variant, onDismiss])

  const kbdStyle: React.CSSProperties = {
    display: "inline-block",
    padding: "1px 5px",
    borderRadius: "4px",
    border: "1px solid oklch(var(--color-border))",
    fontSize: "11px",
    fontFamily: "var(--font-body)",
    background: "oklch(var(--color-paper-2))",
    lineHeight: 1.4,
    verticalAlign: "middle",
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 9999,
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        padding: "11px 13px",
        borderRadius: "var(--radius-card, 10px)",
        background: "oklch(var(--color-paper))",
        border: "1px solid oklch(var(--color-border))",
        boxShadow: "0 8px 24px oklch(0% 0 0 / 0.12)",
        maxWidth: "272px",
        fontFamily: "var(--font-body)",
        pointerEvents: "auto",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {variant === 1 ? (
          <>
            <p style={{ margin: "0 0 3px", fontSize: "13px", fontWeight: 600, color: "oklch(var(--color-ink))", lineHeight: 1.4 }}>
              Tip: Press <kbd style={kbdStyle}>{shortcutKey}</kbd> to search boards instantly.
            </p>
            <p style={{ margin: 0, fontSize: "11.5px", color: "oklch(var(--color-ink-3))" }}>
              Use {altPlatform}
            </p>
          </>
        ) : (
          <>
            <p style={{ margin: "0 0 2px", fontSize: "13px", color: "oklch(var(--color-ink-2))", lineHeight: 1.4 }}>
              Search is also available with <kbd style={kbdStyle}>{shortcutKey}</kbd>
            </p>
            <p style={{ margin: 0, fontSize: "11.5px", color: "oklch(var(--color-ink-3))" }}>
              (or {altPlatform})
            </p>
          </>
        )}
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss hint"
        style={{
          padding: "1px",
          border: "none",
          background: "none",
          cursor: "pointer",
          color: "oklch(var(--color-ink-3))",
          display: "flex",
          flexShrink: 0,
          marginTop: "1px",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </motion.div>
  )
}

export default function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [detail, setDetail] = useState<WorkspaceDetail | null>(null)
  const [boards, setBoards] = useState<BoardSummary[]>([])
  const [activities, setActivities] = useState<ActivityResponse[]>([])
  const [upcomingCards, setUpcomingCards] = useState<UpcomingCard[]>([])
  const pendingBoardsRefetch = useRef(false)
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() =>
    workspaceId ? loadPinned(workspaceId) : new Set()
  )

  const [loadingWorkspace, setLoadingWorkspace] = useState(true)
  const [loadingBoards, setLoadingBoards] = useState(true)
  const [error, setError] = useState("")
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingBoard, setEditingBoard] = useState<BoardSummary | null>(null)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<FilterType>("all")
  const [view, setView] = useState<ViewType>(() => {
    try { return (localStorage.getItem("flowgrid:boardsView") as ViewType) ?? "grid" } catch { return "grid" }
  })
  const [page, setPage] = useState(1)

  const boardSearchRef = useRef<HTMLInputElement>(null)
  const [searchInputFocused, setSearchInputFocused] = useState(false)
  const [hintToShow, setHintToShow] = useState<1 | 2 | null>(null)
  const hintToShowRef = useRef<1 | 2 | null>(null)

  const handleDismissHint = useCallback(() => {
    hintToShowRef.current = null
    setHintToShow(null)
  }, [])

  function handleBoardSearchFocus() {
    if (hintToShowRef.current !== null) return
    if (isBoardShortcutLearned()) return
    const count = getBoardHintCount()
    if (count >= 2) return
    const next = (count + 1) as 1 | 2
    setBoardHintCount(next)
    hintToShowRef.current = next
    setHintToShow(next)
  }

  // When the user presses Cmd+K on the Boards page, AppLayout opens the card SearchModal.
  // Observe that event here to mark the shortcut as learned and dismiss any pending hint.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        markBoardShortcutLearned()
        hintToShowRef.current = null
        setHintToShow(null)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const canManage = detail?.role === "OWNER" || detail?.role === "ADMIN"

  // Reset to page 1 whenever search, filter, or view changes
  useEffect(() => { setPage(1) }, [search, filter, view])

  const filteredBoards = boards
    .filter((b) => b.name.toLowerCase().includes(search.trim().toLowerCase()))
    .filter((b) => {
      if (filter === "pinned") return pinnedIds.has(b.id)
      return true
    })

  // Use different page sizes per view
  const currentPageSize = view === "list" ? PAGE_SIZE_LIST : PAGE_SIZE
  // Count the "New board" slot as a grid item so pagination triggers when the page is full
  const effectiveItemCount = filteredBoards.length + (canManage ? 1 : 0)
  const totalPages = Math.max(1, Math.ceil(effectiveItemCount / currentPageSize))
  const showPagination = effectiveItemCount > currentPageSize
  const isLastPage = page === totalPages
  const paginatedBoards = showPagination
    ? filteredBoards.slice((page - 1) * currentPageSize, page * currentPageSize)
    : filteredBoards

  // Keep page in bounds after board deletion
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  function handleTogglePin(boardId: string) {
    if (!workspaceId) return
    setPinnedIds((prev) => {
      const next = new Set(prev)
      if (next.has(boardId)) {
        next.delete(boardId)
      } else {
        next.add(boardId)
      }
      savePinned(workspaceId, next)
      return next
    })
  }

  function handleBoardUpdated(updated: BoardSummary) {
    const prev = boards.find((b) => b.id === updated.id)
    const visibilityChanged = prev && prev.visibility !== updated.visibility
    setBoards((bs) => bs.map((b) => (b.id === updated.id ? updated : b)))
    setEditingBoard((eb) => (eb && eb.id === updated.id ? updated : eb))
    // Visibility change means member data is stale — defer refetch until modal closes
    if (visibilityChanged) pendingBoardsRefetch.current = true
  }

  function handleBoardDeletedFromModal(boardId: string) {
    setBoards((prev) => prev.filter((b) => b.id !== boardId))
    setPinnedIds((prev) => {
      const next = new Set(prev)
      next.delete(boardId)
      if (workspaceId) savePinned(workspaceId, next)
      return next
    })
    setEditingBoard(null)
  }

  const handleViewChange = (v: ViewType) => {
    setView(v)
    try { localStorage.setItem("flowgrid:boardsView", v) } catch { /* ignore */ }
  }

  const fetchDetail = useCallback(async () => {
    if (!workspaceId) return
    setDetail(null)
    setLoadingWorkspace(true)
    setError("")
    try {
      const d = await workspacesApi.getOne(workspaceId)
      setDetail(d)
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to load workspace")
    } finally {
      setLoadingWorkspace(false)
    }
  }, [workspaceId])

  const fetchBoards = useCallback(async () => {
    if (!workspaceId) return
    setBoards([])
    setLoadingBoards(true)
    try {
      const list = await boardsApi.list(workspaceId)
      setBoards(list)
    } catch {
      setBoards([])
    } finally {
      setLoadingBoards(false)
    }
  }, [workspaceId])

  const fetchSideData = useCallback(async () => {
    if (!workspaceId) return
    try {
      const [acts, upcoming] = await Promise.all([
        activitiesApi.listWorkspace(workspaceId, 10),
        cardsApi.upcoming(workspaceId, 14),
      ])
      setActivities(acts)
      setUpcomingCards(upcoming)
    } catch {
      // Non-critical; ignore
    }
  }, [workspaceId])

  useEffect(() => {
    fetchDetail()
    fetchBoards()
    fetchSideData()
  }, [fetchDetail, fetchBoards, fetchSideData])

  // Stable ref so socket handlers always see the latest detail without re-subscribing
  const detailRef = useRef(detail)
  detailRef.current = detail

  useWorkspaceSocket(workspaceId, {
    onBoardUpdated: ({ id, name, visibility, coverColor, updatedAt }) => {
      setBoards((prev) => {
        const existing = prev.find((b) => b.id === id)
        if (!existing) {
          // Board not in our list — if it became WORKSPACE-visible, refetch to pick it up
          if (visibility === "WORKSPACE") void fetchBoards()
          return prev
        }
        const role = detailRef.current?.role
        const isPrivileged = role === "OWNER" || role === "ADMIN"
        // If board became PRIVATE and user has no privilege, remove it
        if (visibility === "PRIVATE" && existing.visibility !== "PRIVATE" && !isPrivileged) {
          return prev.filter((b) => b.id !== id)
        }
        return prev.map((b) =>
          b.id === id ? { ...b, name, visibility: visibility as BoardSummary["visibility"], coverColor, updatedAt } : b,
        )
      })
    },
    onBoardCreated: ({ board }) => {
      setBoards((prev) => {
        if (prev.some((b) => b.id === board.id)) return prev
        return [...prev, board]
      })
    },
    onBoardDeleted: ({ id }) => {
      setBoards((prev) => prev.filter((b) => b.id !== id))
    },
  })

  function handleBoardCreated(board: BoardSummary) {
    setShowCreateModal(false)
    navigate(`/${workspaceId}/${board.id}`)
  }

  if (loadingWorkspace) {
    return (
      <div style={centerStyle}>
        <span className="animate-pulse" style={{ color: "oklch(var(--color-ink-2))", fontSize: "var(--text-sm)" }}>
          Loading…
        </span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={centerStyle}>
        <p style={{ color: "oklch(var(--color-error))", fontSize: "var(--text-sm)" }}>{error}</p>
      </div>
    )
  }

  const wsName = detail?.name ?? "Workspace"
  const recentActivities = activities.slice(0, 5)
  const recentDeadlines = upcomingCards.slice(0, 5)

  return (
    <>
      <div
        style={{
          padding: "32px 36px",
          color: "oklch(var(--color-ink))",
          fontFamily: "var(--font-body)",
        }}
      >
        {/* ── Workspace Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
            marginBottom: "28px",
          }}
        >
          <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <h1
                  style={{
                    margin: 0,
                    fontSize: "var(--text-3xl)",
                    fontWeight: 700,
                    letterSpacing: "var(--display-tracking)",
                    fontFamily: "var(--font-display)",
                    lineHeight: 1.15,
                  }}
                >
                  {wsName}
                </h1>
                {detail?.role && (
                  <span
                    style={{
                      fontSize: "0.6rem",
                      fontWeight: 700,
                      letterSpacing: "0.09em",
                      textTransform: "uppercase",
                      padding: "3px 8px",
                      borderRadius: "var(--radius-badge)",
                      background: "oklch(var(--color-accent-muted))",
                      color: "oklch(var(--color-accent))",
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    {detail.role}
                  </span>
                )}
              </div>

              {detail && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginTop: "6px",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      fontSize: "var(--text-sm)",
                      color: "oklch(var(--color-ink-3))",
                    }}
                  >
                    {MEMBERS_ICON}
                    {detail.memberCount} {detail.memberCount === 1 ? "Member" : "Members"}
                  </span>
                  <span style={{ color: "oklch(var(--color-border))", fontSize: "var(--text-sm)" }}>·</span>
                  <span style={{ fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-3))" }}>
                    {boards.length} active {boards.length === 1 ? "board" : "boards"}
                  </span>
                </div>
              )}
          </div>

          {workspaceId && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
              <Link to={`/${workspaceId}/members`} style={inviteBtn}>
                {MEMBERS_ICON}
                Invite Members
              </Link>
              <Link to={`/${workspaceId}/settings`} style={secondaryBtn}>
                Settings
              </Link>
            </div>
          )}
        </div>

        {/* ── Search + Filter Toolbar ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "20px",
            flexWrap: "wrap",
          }}
        >
          {/* Search input */}
          <div style={{ position: "relative", flex: "1 1 200px", maxWidth: "320px" }}>
            <span
              style={{
                position: "absolute",
                left: "11px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "oklch(var(--color-ink-3))",
                display: "flex",
                pointerEvents: "none",
              }}
            >
              {SEARCH_ICON}
            </span>
            <input
              ref={boardSearchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => { setSearchInputFocused(true); handleBoardSearchFocus() }}
              onBlur={() => setSearchInputFocused(false)}
              placeholder="Search boards…"
              style={{
                width: "100%",
                padding: "9px 12px 9px 34px",
                borderRadius: "var(--radius-input)",
                border: searchInputFocused
                  ? "1px solid oklch(var(--color-accent))"
                  : "1px solid oklch(var(--color-border))",
                boxShadow: searchInputFocused
                  ? "0 0 0 2px oklch(var(--color-accent) / 0.15)"
                  : "none",
                background: "oklch(var(--color-paper-2))",
                color: "oklch(var(--color-ink))",
                fontSize: "var(--text-sm)",
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "var(--font-body)",
                transition: "border-color var(--dur-fast), box-shadow var(--dur-fast)",
              }}
            />
          </div>

          {/* Filter chips */}
          <div
            style={{
              display: "flex",
              borderRadius: "var(--radius-input)",
              border: "1px solid oklch(var(--color-border))",
              background: "oklch(var(--color-paper-2))",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {([ ["all", "All"], ["pinned", "Pinned"] ] as [FilterType, string][]).map(([f, label]) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "7px 16px",
                  border: "none",
                  background: filter === f ? "oklch(var(--color-paper-3))" : "transparent",
                  color: filter === f ? "oklch(var(--color-accent))" : "oklch(var(--color-ink-3))",
                  fontSize: "var(--text-sm)",
                  fontWeight: filter === f ? 600 : 400,
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                  transition: "background var(--dur-fast), color var(--dur-fast)",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {/* Board count badge */}
          {!loadingBoards && filteredBoards.length > 0 && (
            <span
              style={{
                fontSize: "var(--text-xs)",
                color: "oklch(var(--color-ink-3))",
                padding: "4px 10px",
                borderRadius: "100px",
                background: "oklch(var(--color-paper-3))",
                flexShrink: 0,
                fontWeight: 500,
              }}
            >
              {filteredBoards.length} {filteredBoards.length === 1 ? "board" : "boards"}
            </span>
          )}

          {/* View toggle */}
          <div
            style={{
              display: "flex",
              borderRadius: "var(--radius-input)",
              border: "1px solid oklch(var(--color-border))",
              background: "oklch(var(--color-paper-2))",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {([ ["grid", GRID_ICON], ["list", LIST_ICON] ] as [ViewType, React.ReactNode][]).map(([v, icon]) => (
              <button
                key={v}
                onClick={() => handleViewChange(v)}
                aria-label={`${v} view`}
                style={{
                  padding: "7px 10px",
                  border: "none",
                  background: view === v ? "oklch(var(--color-paper-3))" : "transparent",
                  color: view === v ? "oklch(var(--color-accent))" : "oklch(var(--color-ink-3))",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  transition: "background var(--dur-fast), color var(--dur-fast)",
                }}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        {/* ── Board Grid / List ── */}
        <div style={{ marginBottom: "48px" }}>
          {loadingBoards ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: "16px",
              }}
            >
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  style={{
                    height: "168px",
                    borderRadius: "var(--radius-card)",
                    background: "oklch(var(--color-paper-2))",
                    opacity: 0.5 + i * 0.05,
                    animation: "pulse 1.8s ease-in-out infinite",
                  }}
                />
              ))}
            </div>
          ) : filteredBoards.length === 0 ? (
            /* Empty states */
            <div
              style={{
                border: "1px dashed oklch(var(--color-border))",
                borderRadius: "var(--radius-card)",
                padding: "56px 24px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
                color: "oklch(var(--color-ink-3))",
              }}
            >
              {boards.length === 0 ? (
                <>
                  <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600, color: "oklch(var(--color-ink-2))" }}>
                    No boards yet
                  </p>
                  <p style={{ margin: 0, fontSize: "var(--text-xs)", textAlign: "center", maxWidth: "280px", lineHeight: 1.6 }}>
                    {canManage
                      ? "Create your first board to start organizing tasks."
                      : "No boards have been created in this workspace yet."}
                  </p>
                  {canManage && (
                    <button
                      onClick={() => setShowCreateModal(true)}
                      style={{
                        marginTop: "4px",
                        padding: "9px 20px",
                        borderRadius: "var(--radius-button)",
                        border: "none",
                        background: "oklch(var(--color-accent))",
                        color: "#fff",
                        fontSize: "var(--text-sm)",
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "var(--font-body)",
                      }}
                    >
                      Create first board
                    </button>
                  )}
                </>
              ) : filter === "pinned" ? (
                <>
                  <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600, color: "oklch(var(--color-ink-2))" }}>
                    No pinned boards
                  </p>
                  <p style={{ margin: 0, fontSize: "var(--text-xs)", textAlign: "center", maxWidth: "280px", lineHeight: 1.6 }}>
                    Hover over any board and click the pin icon to keep it here for quick access.
                  </p>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))" }}>
                  No boards match your search.
                </p>
              )}
            </div>
          ) : view === "grid" ? (
            /* Grid view */
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: "16px",
              }}
            >
              {paginatedBoards.map((board) => (
                <BoardCard
                  key={board.id}
                  board={board}
                  workspaceId={workspaceId!}
                  isPinned={pinnedIds.has(board.id)}
                  onTogglePin={handleTogglePin}
                  onEdit={canManage ? setEditingBoard : undefined}
                />
              ))}
              {canManage && (!showPagination || isLastPage) && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    borderRadius: "var(--radius-card)",
                    border: "1px dashed oklch(var(--color-border))",
                    background: "transparent",
                    minHeight: "168px",
                    color: "oklch(var(--color-ink-3))",
                    fontSize: "var(--text-sm)",
                    fontWeight: 500,
                    transition: "border-color var(--dur-base), background var(--dur-base), color var(--dur-base)",
                    boxSizing: "border-box",
                    padding: "16px",
                    textAlign: "center",
                  }}
                  onMouseEnter={(e) => {
                    ;(e.currentTarget as HTMLButtonElement).style.borderColor = "oklch(var(--color-accent))"
                    ;(e.currentTarget as HTMLButtonElement).style.color = "oklch(var(--color-accent))"
                    ;(e.currentTarget as HTMLButtonElement).style.background = "oklch(var(--color-accent-muted))"
                  }}
                  onMouseLeave={(e) => {
                    ;(e.currentTarget as HTMLButtonElement).style.borderColor = "oklch(var(--color-border))"
                    ;(e.currentTarget as HTMLButtonElement).style.color = "oklch(var(--color-ink-3))"
                    ;(e.currentTarget as HTMLButtonElement).style.background = "transparent"
                  }}
                  aria-label="Create new board"
                >
                  {PLUS_ICON}
                  New board
                </button>
              )}
            </div>
          ) : (
            /* List view */
            <div
              style={{
                border: "1px solid oklch(var(--color-border))",
                borderRadius: "var(--radius-card)",
                overflow: "hidden",
              }}
            >
              {paginatedBoards.map((board, idx) => (
                <div
                  key={board.id}
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    borderBottom: idx < paginatedBoards.length - 1
                      ? "1px solid oklch(var(--color-border))"
                      : "none",
                  }}
                  onMouseEnter={(e) => {
                    const btn = e.currentTarget.firstElementChild as HTMLElement | null
                    if (btn) btn.style.background = "oklch(var(--color-paper-2))"
                  }}
                  onMouseLeave={(e) => {
                    const btn = e.currentTarget.firstElementChild as HTMLElement | null
                    if (btn) btn.style.background = "oklch(var(--color-paper))"
                  }}
                >
                  <button
                    onClick={() => navigate(`/${workspaceId}/${board.id}`)}
                    style={{
                      all: "unset",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                      padding: "12px 16px",
                      paddingRight: "72px",
                      background: "oklch(var(--color-paper))",
                      transition: "background var(--dur-fast)",
                      boxSizing: "border-box",
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {/* Color swatch */}
                    <div
                      style={{
                        width: 10,
                        height: 36,
                        borderRadius: "3px",
                        background: board.coverColor ?? "#64748b",
                        flexShrink: 0,
                      }}
                    />
                    {/* Name */}
                    <span
                      style={{
                        flex: 1,
                        fontSize: "var(--text-sm)",
                        fontWeight: 600,
                        color: "oklch(var(--color-ink))",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {board.name}
                    </span>
                  </button>

                  {/* [Pin][Delete] actions — always visible in list view */}
                  <div
                    style={{
                      position: "absolute",
                      right: "12px",
                      display: "flex",
                      gap: "6px",
                      alignItems: "center",
                    }}
                  >
                    <button
                      onClick={() => handleTogglePin(board.id)}
                      aria-label={pinnedIds.has(board.id) ? "Unpin board" : "Pin board"}
                      title={pinnedIds.has(board.id) ? "Unpin" : "Pin board"}
                      style={{
                        width: "30px",
                        height: "30px",
                        borderRadius: "var(--radius-badge)",
                        border: "none",
                        background: pinnedIds.has(board.id) ? "oklch(var(--color-accent))" : "oklch(var(--color-paper-3))",
                        color: pinnedIds.has(board.id) ? "#fff" : "oklch(var(--color-ink-2))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        transition: "background var(--dur-fast), color var(--dur-fast)",
                        flexShrink: 0,
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path
                          d="M9.5 2L14 6.5L11.5 9L9 11.5L6.5 9L4 11.5L2.5 10L5 7.5L2.5 5L5 2.5L7 4.5L9.5 2Z"
                          fill={pinnedIds.has(board.id) ? "currentColor" : "none"}
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    {canManage && (
                    <button
                      onClick={() => setEditingBoard(board)}
                      aria-label="Edit board"
                      title="Edit board"
                      style={{
                        width: "30px",
                        height: "30px",
                        borderRadius: "var(--radius-badge)",
                        border: "none",
                        background: "oklch(var(--color-paper-3))",
                        color: "oklch(var(--color-ink-2))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        transition: "background var(--dur-fast), color var(--dur-fast)",
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "oklch(var(--color-accent) / 0.15)"
                        e.currentTarget.style.color = "oklch(var(--color-accent))"
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "oklch(var(--color-paper-3))"
                        e.currentTarget.style.color = "oklch(var(--color-ink-2))"
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10l7.5-7.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M10.5 3.5l2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    )}
                  </div>
                </div>
              ))}

              {canManage && (!showPagination || isLastPage) && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "12px 16px",
                    background: "oklch(var(--color-paper))",
                    color: "oklch(var(--color-ink-3))",
                    fontSize: "var(--text-sm)",
                    transition: "color var(--dur-fast), background var(--dur-fast)",
                    boxSizing: "border-box",
                    width: "100%",
                  }}
                  onMouseEnter={(e) => {
                    ;(e.currentTarget as HTMLButtonElement).style.color = "oklch(var(--color-accent))"
                    ;(e.currentTarget as HTMLButtonElement).style.background = "oklch(var(--color-paper-2))"
                  }}
                  onMouseLeave={(e) => {
                    ;(e.currentTarget as HTMLButtonElement).style.color = "oklch(var(--color-ink-3))"
                    ;(e.currentTarget as HTMLButtonElement).style.background = "oklch(var(--color-paper))"
                  }}
                >
                  {PLUS_ICON} New board
                </button>
              )}
            </div>
          )}

          {/* ── Pagination ── */}
          {showPagination && !loadingBoards && filteredBoards.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "16px",
                marginTop: "28px",
              }}
            >
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={paginationBtn(page === 1)}
              >
                {CHEVRON_LEFT}
                Previous
              </button>

              <span
                style={{
                  fontSize: "var(--text-sm)",
                  color: "oklch(var(--color-ink-2))",
                  fontWeight: 500,
                  minWidth: "100px",
                  textAlign: "center",
                }}
              >
                Page {page} of {totalPages}
              </span>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={paginationBtn(page === totalPages)}
              >
                Next
                {CHEVRON_RIGHT}
              </button>
            </div>
          )}
        </div>

        {/* ── Bottom: Recent Activity + Upcoming Deadlines ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "20px",
            alignItems: "start",
          }}
        >
          {/* Recent Activity */}
          <div
            style={{
              border: "1px solid oklch(var(--color-border))",
              borderRadius: "var(--radius-card)",
              background: "oklch(var(--color-paper))",
              overflow: "hidden",
            }}
          >
            {/* Widget header */}
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid oklch(var(--color-border))",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span style={{ color: "oklch(var(--color-accent))", display: "flex" }}>
                {ACTIVITY_ICON}
              </span>
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  letterSpacing: "0.09em",
                  textTransform: "uppercase",
                  color: "oklch(var(--color-ink-3))",
                  fontFamily: "var(--font-body)",
                }}
              >
                Recent Activity
              </span>
            </div>

            {activities.length === 0 ? (
              <div
                style={{
                  padding: "28px 18px",
                  fontSize: "var(--text-sm)",
                  color: "oklch(var(--color-ink-3))",
                  textAlign: "center",
                }}
              >
                No recent activity yet.
              </div>
            ) : (
              <>
                {recentActivities.map((act) => (
                  <div
                    key={act.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                      padding: "10px 18px",
                      borderBottom: "1px solid oklch(var(--color-border) / 0.5)",
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        flexShrink: 0,
                        background: act.user ? getAvatarBg(act.user.id) : "oklch(var(--color-paper-3))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        marginTop: "1px",
                      }}
                    >
                      {act.user?.avatarUrl ? (
                        <img src={act.user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <span style={{ fontSize: "9px", fontWeight: 700, color: "#fff" }}>
                          {getInitials(act.user?.name ?? "?")}
                        </span>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-2))", lineHeight: 1.45 }}>
                        {formatActivityText(act)}
                      </p>
                      <span style={{ fontSize: "0.625rem", color: "oklch(var(--color-ink-3))", marginTop: "2px", display: "block" }}>
                        {timeAgo(act.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}

                {/* View all link */}
                <div style={{ padding: "11px 18px", borderTop: "1px solid oklch(var(--color-border) / 0.5)" }}>
                  <Link
                    to={`/${workspaceId}/activity`}
                    style={{
                      fontSize: "var(--text-xs)",
                      fontWeight: 500,
                      color: "oklch(var(--color-accent))",
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    View all activity →
                  </Link>
                </div>
              </>
            )}
          </div>

          {/* Upcoming Deadlines */}
          <div
            style={{
              border: "1px solid oklch(var(--color-border))",
              borderRadius: "var(--radius-card)",
              background: "oklch(var(--color-paper))",
              overflow: "hidden",
            }}
          >
            {/* Widget header */}
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid oklch(var(--color-border))",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span style={{ color: "oklch(var(--color-accent))", display: "flex" }}>
                {FLAG_ICON}
              </span>
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  letterSpacing: "0.09em",
                  textTransform: "uppercase",
                  color: "oklch(var(--color-ink-3))",
                  fontFamily: "var(--font-body)",
                }}
              >
                Upcoming Deadlines
              </span>
            </div>

            {upcomingCards.length === 0 ? (
              <div
                style={{
                  padding: "28px 18px",
                  fontSize: "var(--text-sm)",
                  color: "oklch(var(--color-ink-3))",
                  textAlign: "center",
                }}
              >
                No upcoming deadlines.
              </div>
            ) : (
              <>
                {recentDeadlines.map((card) => {
                  const label = dueDateLabel(card.dueDate)
                  const color = dueDateColor(card.dueDate)
                  return (
                    <button
                      key={card.id}
                      onClick={() => navigate(`/${workspaceId}/${card.boardId}`)}
                      style={{
                        all: "unset",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "10px 18px",
                        width: "100%",
                        boxSizing: "border-box",
                        borderBottom: "1px solid oklch(var(--color-border) / 0.5)",
                        cursor: "pointer",
                        transition: "background var(--dur-fast)",
                      }}
                      onMouseEnter={(e) => {
                        ;(e.currentTarget as HTMLButtonElement).style.background = "oklch(var(--color-paper-2))"
                      }}
                      onMouseLeave={(e) => {
                        ;(e.currentTarget as HTMLButtonElement).style.background = "transparent"
                      }}
                    >
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: color,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          flex: 1,
                          fontSize: "var(--text-xs)",
                          color: "oklch(var(--color-ink-2))",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontWeight: 500,
                        }}
                      >
                        {card.title}
                      </span>
                      <span
                        style={{
                          fontSize: "0.625rem",
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                          color,
                          flexShrink: 0,
                          padding: "2px 7px",
                          borderRadius: "var(--radius-badge)",
                          background: `${color.replace(")", " / 0.12)")}`,
                        }}
                      >
                        {label}
                      </span>
                    </button>
                  )
                })}

                {/* View all link */}
                <div style={{ padding: "11px 18px", borderTop: "1px solid oklch(var(--color-border) / 0.5)" }}>
                  <Link
                    to={`/${workspaceId}/deadlines`}
                    style={{
                      fontSize: "var(--text-xs)",
                      fontWeight: 500,
                      color: "oklch(var(--color-accent))",
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    View all deadlines →
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {hintToShow !== null && (
          <BoardSearchShortcutHint
            key="shortcut-hint"
            variant={hintToShow}
            onDismiss={handleDismissHint}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCreateModal && workspaceId && (
          <CreateBoardModal
            key="create-board"
            workspaceId={workspaceId}
            currentUserId={user?.id ?? ""}
            onCreated={handleBoardCreated}
            onClose={() => setShowCreateModal(false)}
          />
        )}
        {editingBoard && workspaceId && (
          <EditBoardModal
            key="edit-board"
            board={editingBoard}
            workspaceId={workspaceId}
            currentUserId={user?.id ?? ""}
            canDelete={detail?.role === "OWNER"}
            onUpdated={handleBoardUpdated}
            onDeleted={handleBoardDeletedFromModal}
            onClose={() => {
              setEditingBoard(null)
              if (pendingBoardsRefetch.current) {
                pendingBoardsRefetch.current = false
                void fetchBoards()
              }
            }}
          />
        )}
      </AnimatePresence>
    </>
  )
}

const centerStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}
