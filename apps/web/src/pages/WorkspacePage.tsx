import { useEffect, useState, useCallback } from "react"
import { AnimatePresence } from "framer-motion"
import { useParams, Link, useNavigate } from "react-router-dom"
import { workspacesApi, type WorkspaceDetail } from "../api/workspaces"
import { boardsApi, type BoardSummary } from "../api/boards"
import { activitiesApi } from "../api/activities"
import { cardsApi, type UpcomingCard } from "../api/cards"
import BoardCard from "../components/boards/BoardCard"
import CreateBoardModal from "../components/boards/CreateBoardModal"
import type { ActivityResponse } from "@flowgrid/types"
import { getInitials, getAvatarBg } from "../utils/avatar"

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

const CLOCK_ICON = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.1" />
    <path d="M6 3.5V6l1.5 1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const FLAG_ICON = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M2 1.5v9M2 1.5l6 2-6 2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// ── Shared button styles ───────────────────────────────────────────────────────

const primaryBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "8px 14px",
  borderRadius: "var(--radius-button)",
  border: "none",
  background: "oklch(var(--color-accent))",
  color: "#fff",
  fontSize: "var(--text-sm)",
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
  whiteSpace: "nowrap",
  fontFamily: "var(--font-body)",
  transition: "background var(--dur-fast)",
}

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

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  }
  const verb = actionMap[activity.action] ?? activity.action.replace(/_/g, " ")
  const target = meta.cardTitle ?? meta.title ?? ""
  return (
    <>
      <strong>{name}</strong> {verb}{target ? ` "${target}"` : ""}
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

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

export default function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()

  const [detail, setDetail] = useState<WorkspaceDetail | null>(null)
  const [boards, setBoards] = useState<BoardSummary[]>([])
  const [activities, setActivities] = useState<ActivityResponse[]>([])
  const [upcomingCards, setUpcomingCards] = useState<UpcomingCard[]>([])
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() =>
    workspaceId ? loadPinned(workspaceId) : new Set()
  )

  const [loadingWorkspace, setLoadingWorkspace] = useState(true)
  const [loadingBoards, setLoadingBoards] = useState(true)

  const [error, setError] = useState("")
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<FilterType>("all")
  const [view, setView] = useState<ViewType>(() => {
    try { return (localStorage.getItem("flowgrid:boardsView") as ViewType) ?? "grid" } catch { return "grid" }
  })

  const canManage = detail?.role === "OWNER" || detail?.role === "ADMIN"

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

  const filteredBoards = boards
    .filter((b) => b.name.toLowerCase().includes(search.trim().toLowerCase()))
    .filter((b) => {
      if (filter === "pinned") return pinnedIds.has(b.id)
      return true
    })

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

  function handleBoardCreated(board: BoardSummary) {
    setBoards((prev) => [...prev, board])
    setShowCreateModal(false)
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

  return (
    <>
      <div style={{ padding: "32px 36px", color: "oklch(var(--color-ink))", fontFamily: "var(--font-body)" }}>
        {/* Workspace header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "28px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: "var(--text-3xl)",
                  fontWeight: 700,
                  letterSpacing: "var(--display-tracking)",
                  fontFamily: "var(--font-display)",
                }}
              >
                {detail?.name ?? "Workspace"}
              </h1>
              {detail?.role && (
                <span
                  style={{
                    fontSize: "0.625rem",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
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
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-3))" }}>
                  {MEMBERS_ICON}
                  {detail.memberCount} {detail.memberCount === 1 ? "Member" : "Members"}
                </span>
                <span style={{ color: "oklch(var(--color-ink-3))" }}>·</span>
                <span style={{ fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-3))" }}>
                  {boards.length} active {boards.length === 1 ? "board" : "boards"}
                </span>
              </div>
            )}
          </div>

          {workspaceId && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Link to={`/${workspaceId}/members`} style={secondaryBtn}>
                {MEMBERS_ICON}
                Invite Members
              </Link>
              <Link to={`/${workspaceId}/settings`} style={secondaryBtn}>
                Settings
              </Link>
            </div>
          )}
        </div>

        {/* Search + filter chips + view toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 200px", maxWidth: "340px" }}>
            <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "oklch(var(--color-ink-3))", display: "flex" }}>
              {SEARCH_ICON}
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search boards…"
              style={{
                width: "100%",
                padding: "9px 12px 9px 34px",
                borderRadius: "var(--radius-input)",
                border: "1px solid oklch(var(--color-border))",
                background: "oklch(var(--color-paper-2))",
                color: "oklch(var(--color-ink))",
                fontSize: "var(--text-sm)",
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "var(--font-body)",
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
            {([
              ["all", "All"],
              ["pinned", "Pinned"],
            ] as [FilterType, string][]).map(([f, label]) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "7px 14px",
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

          {/* Spacer */}
          <div style={{ flex: 1 }} />

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
            {([["grid", GRID_ICON], ["list", LIST_ICON]] as [ViewType, React.ReactNode][]).map(([v, icon]) => (
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

        {/* Boards section */}
        <div style={{ marginBottom: "40px" }}>
          {loadingBoards ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "14px" }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ height: "140px", borderRadius: "var(--radius-card)", background: "oklch(var(--color-paper-2))", opacity: 0.6 }} />
              ))}
            </div>
          ) : filteredBoards.length === 0 ? (
            <div
              style={{
                border: "1px dashed oklch(var(--color-border))",
                borderRadius: "var(--radius-card)",
                padding: "48px 24px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
                color: "oklch(var(--color-ink-3))",
              }}
            >
              {boards.length === 0 ? (
                <>
                  <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink-2))" }}>No boards yet</p>
                  <p style={{ margin: 0, fontSize: "var(--text-xs)", textAlign: "center", maxWidth: "280px" }}>
                    {canManage ? "Create your first board to start organizing tasks." : "No boards have been created in this workspace yet."}
                  </p>
                  {canManage && (
                    <button
                      onClick={() => setShowCreateModal(true)}
                      style={{ marginTop: "4px", padding: "8px 18px", borderRadius: "var(--radius-button)", border: "none", background: "oklch(var(--color-accent))", color: "#fff", fontSize: "var(--text-sm)", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}
                    >
                      Create first board
                    </button>
                  )}
                </>
              ) : filter === "pinned" ? (
                <>
                  <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink-2))" }}>No pinned boards</p>
                  <p style={{ margin: 0, fontSize: "var(--text-xs)", textAlign: "center", maxWidth: "280px" }}>
                    Hover over any board and click the pin icon to keep it here for quick access.
                  </p>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))" }}>No boards match your search.</p>
              )}
            </div>
          ) : view === "grid" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "14px" }}>
              {filteredBoards.map((board) => (
                <BoardCard
                  key={board.id}
                  board={board}
                  workspaceId={workspaceId!}
                  isPinned={pinnedIds.has(board.id)}
                  onTogglePin={handleTogglePin}
                />
              ))}
              {canManage && (
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
                    minHeight: "140px",
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
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {filteredBoards.map((board) => (
                <div key={board.id} style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <button
                    onClick={() => navigate(`/${workspaceId}/${board.id}`)}
                    style={{
                      all: "unset",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "10px 14px",
                      borderRadius: "var(--radius-card)",
                      border: "1px solid oklch(var(--color-border))",
                      background: "oklch(var(--color-paper))",
                      transition: "background var(--dur-fast)",
                      boxSizing: "border-box",
                      flex: 1,
                      minWidth: 0,
                    }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = "oklch(var(--color-paper-2))"
                      const pin = (e.currentTarget as HTMLButtonElement).nextElementSibling as HTMLElement | null
                      if (pin) pin.style.opacity = "1"
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = "oklch(var(--color-paper))"
                      const pin = (e.currentTarget as HTMLButtonElement).nextElementSibling as HTMLElement | null
                      if (pin && !pinnedIds.has(board.id)) pin.style.opacity = "0"
                    }}
                  >
                    {/* Color swatch */}
                    <div style={{ width: 10, height: 32, borderRadius: "3px", background: board.coverColor ?? "#64748b", flexShrink: 0 }} />
                    {/* Name */}
                    <span style={{ flex: 1, fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {board.name}
                    </span>
                    {/* Visibility */}
                    <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))", flexShrink: 0 }}>
                      {board.visibility === "PRIVATE" ? "Private" : board.visibility === "PUBLIC" ? "Public" : "Workspace"}
                    </span>
                    {/* List count */}
                    <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))", flexShrink: 0, minWidth: 60, textAlign: "right" }}>
                      {board.listCount} {board.listCount === 1 ? "list" : "lists"}
                    </span>
                    {/* Updated */}
                    <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))", flexShrink: 0, minWidth: 70, textAlign: "right" }}>
                      {timeAgo(board.updatedAt)}
                    </span>
                  </button>
                  {/* Pin button for list row */}
                  <button
                    onClick={() => handleTogglePin(board.id)}
                    aria-label={pinnedIds.has(board.id) ? "Unpin board" : "Pin board"}
                    title={pinnedIds.has(board.id) ? "Unpin" : "Pin board"}
                    style={{
                      position: "absolute",
                      right: "10px",
                      width: "24px",
                      height: "24px",
                      borderRadius: "var(--radius-badge)",
                      border: "none",
                      background: pinnedIds.has(board.id) ? "oklch(var(--color-accent))" : "oklch(var(--color-paper-3))",
                      color: pinnedIds.has(board.id) ? "#fff" : "oklch(var(--color-ink-3))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      opacity: pinnedIds.has(board.id) ? 1 : 0,
                      transition: "opacity var(--dur-fast), background var(--dur-fast)",
                      flexShrink: 0,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M9.5 2L14 6.5L11.5 9L9 11.5L6.5 9L4 11.5L2.5 10L5 7.5L2.5 5L5 2.5L7 4.5L9.5 2Z"
                        fill={pinnedIds.has(board.id) ? "currentColor" : "none"}
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              ))}
              {canManage && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 14px",
                    borderRadius: "var(--radius-card)",
                    border: "1px dashed oklch(var(--color-border))",
                    color: "oklch(var(--color-ink-3))",
                    fontSize: "var(--text-sm)",
                    transition: "color var(--dur-fast)",
                    boxSizing: "border-box",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "oklch(var(--color-accent))" }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "oklch(var(--color-ink-3))" }}
                >
                  {PLUS_ICON} New board
                </button>
              )}
            </div>
          )}
        </div>

        {/* Bottom two-column section: Recent Activity + Upcoming Deadlines */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", alignItems: "start" }}>
          {/* Recent Activity */}
          <div
            style={{
              border: "1px solid oklch(var(--color-border))",
              borderRadius: "var(--radius-card)",
              background: "oklch(var(--color-paper-2))",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid oklch(var(--color-border))",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "oklch(var(--color-ink-3))",
                  fontFamily: "var(--font-body)",
                }}
              >
                Recent Activity
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                {CLOCK_ICON} Live
              </span>
            </div>
            {activities.length === 0 ? (
              <div style={{ padding: "24px 18px", fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-3))", textAlign: "center" }}>
                No recent activity yet.
              </div>
            ) : (
              <div>
                {activities.map((act) => (
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
                    {/* Avatar */}
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
                        <span style={{ fontSize: "9px", fontWeight: 700, color: "#fff" }}>{getInitials(act.user?.name ?? "?")}</span>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-2))", lineHeight: 1.4 }}>
                        {formatActivityText(act)}
                      </p>
                      <span style={{ fontSize: "0.625rem", color: "oklch(var(--color-ink-3))", marginTop: "2px", display: "block" }}>
                        {timeAgo(act.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Deadlines */}
          <div
            style={{
              border: "1px solid oklch(var(--color-border))",
              borderRadius: "var(--radius-card)",
              background: "oklch(var(--color-paper-2))",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid oklch(var(--color-border))",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span style={{ color: "oklch(var(--color-accent))", display: "flex" }}>{FLAG_ICON}</span>
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "oklch(var(--color-ink-3))",
                  fontFamily: "var(--font-body)",
                }}
              >
                Upcoming Deadlines
              </span>
            </div>
            {upcomingCards.length === 0 ? (
              <div style={{ padding: "24px 18px", fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-3))", textAlign: "center" }}>
                No upcoming deadlines.
              </div>
            ) : (
              <div>
                {upcomingCards.map((card) => {
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
                        gap: "8px",
                        padding: "10px 18px",
                        width: "100%",
                        boxSizing: "border-box",
                        borderBottom: "1px solid oklch(var(--color-border) / 0.5)",
                        cursor: "pointer",
                        transition: "background var(--dur-fast)",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "oklch(var(--color-paper-3))" }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent" }}
                    >
                      <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>•</span>
                      <span style={{ flex: 1, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-2))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {card.title}
                      </span>
                      <span
                        style={{
                          fontSize: "0.625rem",
                          fontWeight: 700,
                          letterSpacing: "0.05em",
                          color,
                          flexShrink: 0,
                          padding: "2px 6px",
                          borderRadius: "var(--radius-badge)",
                          background: `${color}18`,
                        }}
                      >
                        {label}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showCreateModal && workspaceId && (
          <CreateBoardModal
            key="create-board"
            workspaceId={workspaceId}
            onCreated={handleBoardCreated}
            onClose={() => setShowCreateModal(false)}
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
