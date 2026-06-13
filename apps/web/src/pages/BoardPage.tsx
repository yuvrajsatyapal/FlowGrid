import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { AnimatePresence } from "framer-motion"
import { useParams, Link, useSearchParams } from "react-router-dom"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core"
import { arrayMove } from "@dnd-kit/sortable"
import { type ListSummary } from "../api/lists"
import { type CardSummary } from "../api/cards"
import ListColumn from "../components/boards/ListColumn"
import CreateListInline from "../components/boards/CreateListInline"
import CardItem from "../components/boards/CardItem"
import CardDetailModal from "../components/boards/CardDetailModal"
import BoardPresence from "../components/boards/BoardPresence"
import BoardAccessPanel from "../components/boards/BoardAccessPanel"
import BoardCalendarView from "../components/boards/BoardCalendarView"
import BoardTimelineView from "../components/boards/BoardTimelineView"
import KeyboardShortcutsModal from "../components/KeyboardShortcutsModal"
import { useBoardPresence } from "../features/board/presence/useBoardPresence"
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts"
import { useWindowWidth } from "../hooks/useWindowWidth"
import { computeBlockedCardIds } from "../utils/dependencies"
import { useQueryClient } from "@tanstack/react-query"
import { useBoardDetail } from "../features/board/queries/useBoardDetail"
import { useBoardLists } from "../features/board/queries/useBoardLists"
import { useBoardCards } from "../features/board/queries/useBoardCards"
import { useBoardDependencyGraph } from "../features/board/queries/useBoardDependencyGraph"
import { useBoardMembers } from "../features/board/queries/useBoardMembers"
import { useReorderCards } from "../features/board/mutations/useReorderCards"
import { useMoveCard } from "../features/board/mutations/useMoveCard"
import { useCreateList } from "../features/board/mutations/useCreateList"
import { useCardCacheSync } from "../features/board/cache/useCardCacheSync"
import { useBoardRealtimeSync } from "../features/board/cache/useBoardRealtimeSync"
import { boardKeys } from "../features/board/queries/keys"
import { MAX_CARDS_PER_LIST } from "@flowgrid/types"
import { useAuth } from "../contexts/AuthContext"
import { getInitials, getAvatarBg } from "../utils/avatar"

type BoardView = "kanban" | "calendar" | "timeline"

const VIEW_ICONS = {
  kanban: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="3.5" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="5.25" y="1" width="3.5" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9.5" y="1" width="3.5" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  calendar: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1" y="2.5" width="12" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1 5.5h12M4.5 1v3M9.5 1v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  timeline: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M1 7h12M1 4h7M1 10h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="9" cy="7" r="1.5" fill="currentColor" />
    </svg>
  ),
}

const LOCK_ICON = <span aria-hidden="true" style={{ fontSize: "12px", lineHeight: 1 }}>🔒</span>

const GLOBE_ICON = <span aria-hidden="true" style={{ fontSize: "12px", lineHeight: 1 }}>🌐</span>

const DEFAULT_COVER = "#64748b"

function pagerBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "5px 12px",
    borderRadius: "var(--radius-button)",
    border: "1px solid oklch(var(--color-border))",
    background: "oklch(var(--color-paper-2))",
    color: disabled ? "oklch(var(--color-ink-3))" : "oklch(var(--color-ink-2))",
    fontSize: "var(--text-xs)",
    fontWeight: 600,
    fontFamily: "var(--font-body)",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
  }
}

export default function BoardPage() {
  const { workspaceId, boardId } = useParams<{ workspaceId: string; boardId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()

  const qc = useQueryClient()

  const [activeCard, setActiveCard] = useState<CardSummary | null>(null)
  const [openCardId, setOpenCardId] = useState<string | null>(null)

  // Server state — owned by TanStack Query (read-only here). All writes go through
  // mutation hooks (Phase 3c) and useBoardRealtimeSync (Phase 3d); no setter shims.
  const boardQuery = useBoardDetail(boardId)
  const board = boardQuery.data ?? null
  const loadingBoard = boardQuery.isLoading
  const error = boardQuery.isError ? ((boardQuery.error as Error).message || "Board not found") : ""

  const listsQuery = useBoardLists(boardId)
  const lists = listsQuery.data ?? []
  const listsError = listsQuery.isError ? ((listsQuery.error as Error).message || "Failed to load lists") : ""

  const listIds = lists.map((l) => l.id)
  const cardsQuery = useBoardCards(boardId, listIds)
  const boardCards = cardsQuery.data ?? {}
  const loadingLists =
    listsQuery.isLoading ||
    cardsQuery.isLoading ||
    (lists.length > 0 && cardsQuery.data === undefined && !cardsQuery.isError)
  const [boardView, setBoardView] = useState<BoardView>("kanban")
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  // Board Access panel (PRIVATE boards only) — managed by BoardAccessPanel.
  const [accessPanelOpen, setAccessPanelOpen] = useState(false)
  // boardMembers feeds the header avatar cluster; the access panel owns its own copy.
  const boardMembers = useBoardMembers(boardId).data ?? []
  const reorderCards = useReorderCards(boardId ?? "")
  const moveCard = useMoveCard(boardId ?? "")
  const createList = useCreateList(boardId ?? "")
  const cardCache = useCardCacheSync(boardId ?? "")
  // Presence (workspace member roster + live online ids) — owned by useBoardPresence.
  const { allWsMembers, onlineMemberIds, reload: reloadPresence } = useBoardPresence(workspaceId)

  // Transient banner shown when a card-cap rule blocks an action (e.g. drag into a full list)
  const [capNotice, setCapNotice] = useState("")
  const capTimerRef = useRef<number | null>(null)
  const showCapNotice = useCallback((msg: string) => {
    setCapNotice(msg)
    if (capTimerRef.current) window.clearTimeout(capTimerRef.current)
    capTimerRef.current = window.setTimeout(() => setCapNotice(""), 3000)
  }, [])
  useEffect(() => () => { if (capTimerRef.current) window.clearTimeout(capTimerRef.current) }, [])

  // Column pagination — show a page of lists at a time (responsive count, no horizontal scroll)
  const [listPage, setListPage] = useState(0)
  const [colsWidth, setColsWidth] = useState(0)
  const [colsHeight, setColsHeight] = useState(0)
  const kanbanRef = useRef<HTMLDivElement>(null)

  // Dependency graph → set of blocked card ids (for the 🔒 Blocked badge)
  const depGraphQuery = useBoardDependencyGraph(boardId)
  const blockedCardIds = useMemo(
    () =>
      depGraphQuery.data
        ? computeBlockedCardIds(depGraphQuery.data.edges, depGraphQuery.data.completedCardIds)
        : new Set<string>(),
    [depGraphQuery.data],
  )
  const refreshDepGraph = useCallback(() => {
    void qc.invalidateQueries({ queryKey: boardKeys.depGraph(boardId ?? "") })
  }, [qc, boardId])

  const windowWidth = useWindowWidth()
  const headerIsSmall = windowWidth < 640
  const headerIsCompact = windowWidth < 768
  // Covers all iPads (mini 768, Air 820, Pro 11" 834/1194, Pro 12.9" 1024/1366) in any orientation.
  // At this range: hide Timeline tab + show icons only (no text) in the view switcher.
  const headerIsTablet = windowWidth < 1180
  const hideDescription = windowWidth < 1024

  // Auto-switch away from timeline on phones and all iPad sizes
  useEffect(() => {
    if (headerIsTablet && boardView === "timeline") setBoardView("kanban")
  }, [headerIsTablet, boardView])

  useKeyboardShortcuts([
    { key: "?", description: "Open keyboard shortcuts", handler: () => setShortcutsOpen(true) },
    { key: "1", description: "Kanban view", handler: () => setBoardView("kanban") },
    { key: "2", description: "Calendar view", handler: () => setBoardView("calendar") },
    { key: "3", description: "Timeline view", handler: () => { if (!headerIsTablet) setBoardView("timeline") } },
  ])

  const canEdit = board?.role === "OWNER" || board?.role === "ADMIN"
  const isViewer = board?.role === "VIEWER"

  // Whether the current user can manage board access (creator or workspace OWNER/ADMIN)
  const canManageAccess =
    board?.visibility === "PRIVATE" &&
    (board.createdById === user?.id || board.role === "OWNER" || board.role === "ADMIN")

  // Refresh the member roster + board-members query when the access panel opens.
  useEffect(() => {
    if (accessPanelOpen) {
      void reloadPresence()
      void qc.invalidateQueries({ queryKey: boardKeys.members(boardId ?? "") })
    }
  }, [accessPanelOpen, reloadPresence, qc, boardId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  // Board / lists / cards now load via TanStack Query (useBoardDetail/useBoardLists/
  // useBoardCards). Reset column pagination when switching boards.
  useEffect(() => {
    setListPage(0)
  }, [boardId])

  // Deep-link: open a specific card when arriving via ?card=<id> (e.g. from the Inbox).
  // Runs once cards are loaded; clears the param so closing the modal doesn't reopen it.
  useEffect(() => {
    const cardParam = searchParams.get("card")
    if (!cardParam) return
    const exists = Object.values(boardCards).flat().some((c) => c.id === cardParam)
    if (exists) {
      setOpenCardId(cardParam)
      searchParams.delete("card")
      setSearchParams(searchParams, { replace: true })
    }
  }, [boardCards, searchParams, setSearchParams])

  // ─── Modal helpers ──────────────────────────────────────────────────────────

  const openCard = openCardId
    ? Object.values(boardCards).flat().find((c) => c.id === openCardId) ?? null
    : null

  // ─── Column pagination ────────────────────────────────────────────────────────
  // Measure the kanban viewport so we can fit a whole number of columns per page
  // (no horizontal scroll), responsive to the screen size.
  useEffect(() => {
    if (boardView !== "kanban") return
    const el = kanbanRef.current
    if (!el) return
    const measure = () => {
      setColsWidth(el.clientWidth)
      setColsHeight(el.clientHeight)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [boardView, loadingLists, listsError])

  const COL_GAP = 12
  const COL_PAD = 16 // horizontal padding inside the kanban viewport (each side)
  const MIN_COL = 240
  const MAX_COL = 340
  const MAX_COLS_PER_PAGE = 4 // cap at 4 columns/page even on wide screens → roomier columns
  const colsAvail = Math.max(0, colsWidth - COL_PAD * 2)
  const colsPerPage = Math.max(
    1,
    Math.min(MAX_COLS_PER_PAGE, colsAvail > 0 ? Math.floor((colsAvail + COL_GAP) / (MIN_COL + COL_GAP)) : MAX_COLS_PER_PAGE),
  )
  // Single column (phones / narrow windows): fill the full available width so the list isn't
  // left-biased with a wide right margin from the MAX_COL cap. Filling colsAvail exactly also
  // centers it — equal COL_PAD margins each side, no leftover slack. Multi-column layouts
  // (tablet/desktop, colsPerPage >= 2) keep the MAX_COL cap unchanged.
  const colWidth =
    colsPerPage === 1
      ? colsAvail
      : Math.min(MAX_COL, Math.floor((colsAvail - (colsPerPage - 1) * COL_GAP) / colsPerPage))

  // Per-card height so a FULL list (MAX_CARDS_PER_LIST) fills the column top-to-bottom with no
  // leftover gap. A full list has no "Add a card" row, so the only vertical chrome is the
  // scroll-container padding + the list header. Each card adds CARD_GAP (its marginBottom).
  //   colHeight = CONTAINER_VPAD + LIST_HEADER + MAX * (slot + CARD_GAP)
  // Solve for slot so the column exactly fills the measured viewport (colsHeight).
  const CONTAINER_VPAD = 32 // kanban scroll container top+bottom padding (16 each)
  const LIST_HEADER = 44 // list title row (slightly generous → avoid a scrollbar)
  const CARD_GAP = 8 // matches CardItem marginBottom
  const CARD_MIN = 110
  const cardSlotHeight =
    colsHeight > 0
      ? Math.max(
          CARD_MIN,
          Math.floor((colsHeight - CONTAINER_VPAD - LIST_HEADER) / MAX_CARDS_PER_LIST) - CARD_GAP,
        )
      : CARD_MIN

  // Items to page through: each list, plus an "add list" tile at the end (when editable)
  type ColumnItem = { kind: "list"; list: ListSummary } | { kind: "add" }
  const columnItems: ColumnItem[] = [
    ...lists.map((l) => ({ kind: "list" as const, list: l })),
    ...(canEdit ? [{ kind: "add" as const }] : []),
  ]
  const totalListPages = Math.max(1, Math.ceil(columnItems.length / colsPerPage))
  const safeListPage = Math.min(listPage, totalListPages - 1)
  const visibleColumnItems = columnItems.slice(safeListPage * colsPerPage, safeListPage * colsPerPage + colsPerPage)

  useEffect(() => {
    if (listPage > totalListPages - 1) setListPage(totalListPages - 1)
  }, [listPage, totalListPages])

  // Card update / label propagation cache reconciliation now lives in
  // useCardCacheSync (cardCache.applyCardUpdate / applyLabelUpdate / applyLabelDelete).

  // ─── DnD helpers ────────────────────────────────────────────────────────────

  const findListIdForCard = (cardId: string): string | undefined =>
    Object.keys(boardCards).find((listId) => boardCards[listId].some((c) => c.id === cardId))

  const handleDragStart = ({ active }: DragStartEvent) => {
    const card = Object.values(boardCards)
      .flat()
      .find((c) => c.id === active.id)
    setActiveCard(card ?? null)
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveCard(null)
    if (!over || active.id === over.id) return

    const activeId = active.id as string
    const overId = over.id as string

    const sourceListId = findListIdForCard(activeId)
    if (!sourceListId) return

    // over.id is either a listId (dropped on empty list) or a cardId
    const destListId = boardCards[overId] !== undefined ? overId : findListIdForCard(overId)
    if (!destListId) return

    if (sourceListId === destListId) {
      const items = boardCards[sourceListId]
      const oldIndex = items.findIndex((c) => c.id === activeId)
      const newIndex = items.findIndex((c) => c.id === overId)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

      // Compute the new id order directly (no intermediate card-array build).
      // Optimistic reorder + rollback handled by the mutation hook (no invalidate).
      const orderedIds = arrayMove(
        items.map((c) => c.id),
        oldIndex,
        newIndex,
      )
      reorderCards.mutate({ listId: sourceListId, orderedIds })
    } else {
      const sourceCards = boardCards[sourceListId]
      const destCards = boardCards[destListId]
      const card = sourceCards.find((c) => c.id === activeId)
      if (!card) return

      // Enforce the per-list card cap on cross-list moves (mirrors the backend check)
      if (destCards.length >= MAX_CARDS_PER_LIST) {
        showCapNotice(`A list can hold at most ${MAX_CARDS_PER_LIST} cards. Delete a card in the target list first.`)
        return
      }

      const newSourceCards = sourceCards.filter((c) => c.id !== activeId)
      const insertAt =
        boardCards[overId] !== undefined
          ? destCards.length // dropped on list id → append
          : destCards.findIndex((c) => c.id === overId)

      const newDestCards = [...destCards]
      newDestCards.splice(insertAt === -1 ? destCards.length : insertAt, 0, {
        ...card,
        listId: destListId,
      })

      // Optimistic cross-list move + rollback handled by the mutation hook (no invalidate).
      moveCard.mutate({ cardId: activeId, sourceListId, destListId, newSourceCards, newDestCards })
    }
  }

  const handleDragCancel = () => setActiveCard(null)

  // ─── List / card mutations ───────────────────────────────────────────────────

  const handleCreateList = async (name: string) => {
    if (!boardId) return
    // Optimistic-free create + idempotent insert handled by the mutation hook.
    await createList.mutateAsync({ name })
  }

  // ─── Real-time socket ────────────────────────────────────────────────────────

  // Card/list socket reconciliation → query cache (idempotent + version-guarded).
  // Replaces the former inline useBoardSocket handlers and their dedup guards.
  useBoardRealtimeSync(boardId)

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loadingBoard) {
    return (
      <div style={centerStyle}>
        <span className="animate-pulse" style={{ color: "oklch(var(--color-ink-2))", fontSize: "var(--text-sm)" }}>
          Loading…
        </span>
      </div>
    )
  }

  if (error || !board) {
    const isAccessDenied = error.includes("don't have access") || error.includes("403")
    return (
      <div style={centerStyle}>
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          {isAccessDenied ? (
            <>
              <div style={{ fontSize: "2rem", marginBottom: "12px" }}>🔒</div>
              <p style={{ color: "oklch(var(--color-ink))", fontSize: "var(--text-base)", fontWeight: 600, margin: "0 0 6px" }}>
                Private board
              </p>
              <p style={{ color: "oklch(var(--color-ink-3))", fontSize: "var(--text-sm)", margin: "0 0 20px" }}>
                You don't have access to this board. Ask the board owner to invite you.
              </p>
            </>
          ) : (
            <p style={{ color: "oklch(var(--color-error))", fontSize: "var(--text-sm)", marginBottom: "12px" }}>
              {error || "Board not found"}
            </p>
          )}
          {workspaceId && (
            <Link
              to={`/${workspaceId}`}
              style={{ fontSize: "var(--text-sm)", color: "oklch(var(--color-accent))", textDecoration: "none" }}
            >
              ← Back to workspace
            </Link>
          )}
        </div>
      </div>
    )
  }

  const coverBg = board.coverColor ?? DEFAULT_COVER

  // Header avatar cluster shows the board's full membership (online or offline).
  // PRIVATE boards: explicit board members. WORKSPACE boards: every workspace member
  // (they implicitly have access). `onlineIds` flags who is currently logged in (a green
  // dot), kept live via the workspace presence socket.
  const headerMemberSource =
    board.visibility === "PRIVATE"
      ? boardMembers.map((m) => ({ userId: m.userId, name: m.name, avatarUrl: m.avatarUrl, memberSince: m.createdAt }))
      : allWsMembers.map((m) => ({ userId: m.userId, name: m.name, avatarUrl: m.avatarUrl, memberSince: undefined }))
  const onlineIds = onlineMemberIds

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "var(--font-body)" }}>
      {/* Board header */}
      <div
        style={{
          background: coverBg,
          padding: headerIsSmall ? "10px 16px" : headerIsCompact ? "14px 20px" : "20px 28px",
          display: "flex",
          alignItems: "center",
          gap: headerIsSmall ? "6px" : "10px",
          flexShrink: 0,
          minWidth: 0,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: headerIsSmall ? "var(--text-base)" : headerIsCompact ? "var(--text-lg)" : "var(--text-xl)",
            fontWeight: 700,
            color: "#fff",
            fontFamily: "var(--font-display)",
            letterSpacing: "-0.01em",
            textShadow: "0 1px 3px oklch(0% 0 0 / 0.25)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
            flexShrink: 1,
          }}
        >
          {board.name}
        </h1>

        {board.visibility === "PRIVATE" && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: headerIsSmall ? 0 : "4px",
              padding: headerIsSmall ? "3px 5px" : "3px 8px",
              borderRadius: "var(--radius-badge)",
              background: "oklch(0% 0 0 / 0.30)",
              color: "#fff",
              fontSize: "var(--text-xs)",
              fontWeight: 500,
              flexShrink: 0,
            }}
          >
            {LOCK_ICON}
            {!headerIsSmall && "Private"}
          </span>
        )}
        {board.visibility === "WORKSPACE" && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: headerIsSmall ? 0 : "4px",
              padding: headerIsSmall ? "3px 5px" : "3px 8px",
              borderRadius: "var(--radius-badge)",
              background: "oklch(0% 0 0 / 0.30)",
              color: "#fff",
              fontSize: "var(--text-xs)",
              fontWeight: 500,
              flexShrink: 0,
            }}
          >
            {GLOBE_ICON}
            {!headerIsSmall && "Workspace"}
          </span>
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: headerIsSmall ? 6 : 10, flexShrink: 0 }}>
          {/* View switcher */}
          <div
            role="group"
            aria-label="Board view"
            style={{
              display: "flex",
              gap: 2,
              background: "oklch(0% 0 0 / 0.20)",
              borderRadius: "var(--radius-badge)",
              padding: 2,
            }}
          >
            {(["kanban", "calendar", ...(headerIsTablet ? [] : ["timeline"])] as BoardView[]).map((v) => (
              <button
                key={v}
                aria-pressed={boardView === v}
                aria-label={v.charAt(0).toUpperCase() + v.slice(1)}
                onClick={() => setBoardView(v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: headerIsTablet ? 0 : 5,
                  padding: headerIsSmall ? "5px 7px" : "4px 10px",
                  borderRadius: "var(--radius-badge)",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "var(--text-xs)",
                  fontWeight: 500,
                  background: boardView === v ? "oklch(100% 0 0 / 0.18)" : "transparent",
                  color: "#fff",
                  transition: "background 0.15s",
                }}
              >
                {VIEW_ICONS[v]}
                {!headerIsTablet && (v.charAt(0).toUpperCase() + v.slice(1))}
              </button>
            ))}
          </div>

          {/* Member avatar cluster — all board members */}
          {(board.members?.length ?? 0) > 0 && (
            <div style={{ display: "flex", alignItems: "center" }}>
              {board.members.slice(0, headerIsSmall ? 2 : 3).map((m, i) => (
                <div
                  key={m.id}
                  title={m.name ?? undefined}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    border: `2.5px solid ${coverBg}`,
                    marginLeft: i === 0 ? 0 : -8,
                    background: m.avatarUrl ? "transparent" : getAvatarBg(m.id),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    flexShrink: 0,
                    boxSizing: "border-box",
                  }}
                >
                  {m.avatarUrl ? (
                    <img src={m.avatarUrl} alt={m.name ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontSize: "10px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-body)", userSelect: "none" }}>
                      {getInitials(m.name ?? "?")}
                    </span>
                  )}
                </div>
              ))}
              {board.memberCount > (headerIsSmall ? 2 : 3) && (
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    border: `2.5px solid ${coverBg}`,
                    marginLeft: -8,
                    background: "oklch(0% 0 0 / 0.28)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "10px",
                    fontWeight: 700,
                    color: "#fff",
                    flexShrink: 0,
                    boxSizing: "border-box",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  +{board.memberCount - (headerIsSmall ? 2 : 3)}
                </div>
              )}
            </div>
          )}

          {/* Board Access button + floating dropdown */}
          {canManageAccess && (
            <div style={{ position: "relative" }}>
                <button
                  onClick={() => setAccessPanelOpen((v) => !v)}
                  aria-pressed={accessPanelOpen}
                  aria-label="Manage board access"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: headerIsSmall ? "5px 7px" : "4px 10px",
                    borderRadius: "var(--radius-badge)",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "var(--text-xs)",
                    fontWeight: 500,
                    background: accessPanelOpen ? "oklch(100% 0 0 / 0.22)" : "oklch(0% 0 0 / 0.20)",
                    color: "#fff",
                    transition: "background 0.15s",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <circle cx="6" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.1" />
                    <path d="M1 10.5c0-2.21 2.24-4 5-4s5 1.79 5 4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                  </svg>
                  {!headerIsSmall && "Access"}
                </button>

                {accessPanelOpen && board.visibility === "PRIVATE" && (
                  <BoardAccessPanel
                    boardId={boardId ?? ""}
                    boardCreatorId={board.createdById}
                    allWsMembers={allWsMembers}
                    onClose={() => setAccessPanelOpen(false)}
                  />
                )}
            </div>
          )}

          <BoardPresence
            users={headerMemberSource}
            onlineIds={onlineIds}
            maxVisible={2}
            coverColor={coverBg}
          />
        </div>
      </div>

      {/* View-specific content */}
      {boardView === "calendar" && boardId ? (
        <div style={{ flex: 1, overflow: "hidden" }}>
          <BoardCalendarView boardId={boardId} onCardClick={(id) => setOpenCardId(id)} />
        </div>
      ) : boardView === "timeline" && boardId ? (
        <div style={{ flex: 1, overflow: "hidden" }}>
          <BoardTimelineView boardId={boardId} onCardClick={(id) => setOpenCardId(id)} />
        </div>
      ) : (
        /* Kanban columns (paginated — a page of lists at a time) */
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            position: "relative",
            // Mobile: the wrapper scrolls as one unit so the pager flows right after the
            // (content-sized) column. Desktop keeps the inner scroll + bottom-pinned pager.
            overflowY: headerIsCompact ? "auto" : undefined,
          }}
        >
          <div
            ref={kanbanRef}
            style={{
              // Mobile: grow to fill leftover height (flex-grow 1) but never shrink below content
              // (shrink 0) — on tall phones this expands to push the pager to the bottom edge (no
              // dead zone), while on short screens (iPhone SE) the cards already overflow so it
              // stays content-height and the wrapper scrolls exactly as before. Desktop: flex:1.
              flex: headerIsCompact ? "1 0 auto" : 1,
              overflowX: "hidden",
              // Mobile: overflow visible so this never owns a nested scroll — the wrapper scrolls
              // as one unit. Desktop keeps the inner scroll with the pager pinned below.
              overflowY: headerIsCompact ? "visible" : "auto",
              padding: `16px ${COL_PAD}px`,
              display: "flex",
              alignItems: "flex-start",
              gap: COL_GAP,
            }}
          >
          {loadingLists ? (
            <div style={{ display: "flex", gap: 12 }}>
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  style={{
                    width: 272,
                    height: 80,
                    flexShrink: 0,
                    borderRadius: "var(--radius-card)",
                    background: "oklch(var(--color-paper-2))",
                    opacity: 0.6,
                    animation: "pulse 1.5s ease-in-out infinite",
                  }}
                />
              ))}
            </div>
          ) : listsError ? (
            <div style={{ color: "oklch(var(--color-error))", fontSize: "var(--text-sm)" }}>
              {listsError}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              {visibleColumnItems.map((item) =>
                item.kind === "list" ? (
                  <ListColumn
                    key={item.list.id}
                    list={item.list}
                    canEdit={canEdit}
                    isViewer={isViewer}
                    cards={boardCards[item.list.id] ?? []}
                    onCardClick={isViewer ? undefined : (id) => setOpenCardId(id)}
                    width={colWidth}
                    cardSlotHeight={headerIsCompact ? undefined : cardSlotHeight}
                    blockedCardIds={blockedCardIds}
                    hideDescription={hideDescription}
                    mobile={headerIsSmall}
                  />
                ) : (
                  <CreateListInline key="__add_list__" onSubmit={handleCreateList} width={colWidth} />
                ),
              )}
              {!canEdit && lists.length === 0 && (
                <div style={{ color: "oklch(var(--color-ink-3))", fontSize: "var(--text-sm)" }}>
                  This board has no lists yet.
                </div>
              )}

              <DragOverlay dropAnimation={null}>
                {activeCard ? <CardItem card={activeCard} overlay hideDescription={hideDescription} /> : null}
              </DragOverlay>
            </DndContext>
          )}
          </div>

          {/* Card-cap notice — floats above the pager, auto-dismisses */}
          {capNotice && (
            <div
              role="status"
              style={{
                position: "absolute",
                left: "50%",
                bottom: 56,
                transform: "translateX(-50%)",
                maxWidth: "min(90%, 460px)",
                padding: "8px 14px",
                borderRadius: "var(--radius-button)",
                background: "oklch(var(--color-ink))",
                color: "oklch(var(--color-paper))",
                fontSize: "var(--text-xs)",
                fontWeight: 500,
                boxShadow: "0 6px 20px oklch(0% 0 0 / 0.22)",
                textAlign: "center",
                zIndex: 30,
              }}
            >
              {capNotice}
            </div>
          )}

          {/* Pagination controls — anchored at the bottom */}
          {!loadingLists && !listsError && totalListPages > 1 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: `8px ${COL_PAD}px 12px`,
                borderTop: "1px solid oklch(var(--color-border))",
                flexShrink: 0,
              }}
            >
              <button
                onClick={() => setListPage((p) => Math.max(0, p - 1))}
                disabled={safeListPage === 0}
                aria-label="Previous page"
                style={pagerBtnStyle(safeListPage === 0)}
              >
                ‹ Prev
              </button>
              <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))", minWidth: 92, textAlign: "center" }}>
                Page {safeListPage + 1} of {totalListPages}
              </span>
              <button
                onClick={() => setListPage((p) => Math.min(totalListPages - 1, p + 1))}
                disabled={safeListPage >= totalListPages - 1}
                aria-label="Next page"
                style={pagerBtnStyle(safeListPage >= totalListPages - 1)}
              >
                Next ›
              </button>
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {openCard && board && workspaceId && (
          <CardDetailModal
            key={openCard.id}
            card={openCard}
            boardId={board.id}
            workspaceId={workspaceId}
            canEdit={canEdit}
            userRole={board?.role}
            listName={lists.find((l) => l.id === openCard.listId)?.name}
            listColor={lists.find((l) => l.id === openCard.listId)?.color}
            onClose={() => { setOpenCardId(null); void refreshDepGraph() }}
            onCardUpdated={cardCache.applyCardUpdate}
            onLabelUpdated={cardCache.applyLabelUpdate}
            onLabelDeleted={cardCache.applyLabelDelete}
          />
        )}
      </AnimatePresence>

      <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  )
}

const centerStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}
