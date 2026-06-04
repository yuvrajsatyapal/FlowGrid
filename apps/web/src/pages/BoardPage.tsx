import { useEffect, useState, useCallback, useRef } from "react"
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
import { boardsApi, type BoardDetail } from "../api/boards"
import { listsApi, type ListSummary } from "../api/lists"
import { cardsApi, type CardSummary } from "../api/cards"
import ListColumn from "../components/boards/ListColumn"
import CreateListInline from "../components/boards/CreateListInline"
import CardItem from "../components/boards/CardItem"
import CardDetailModal from "../components/boards/CardDetailModal"
import BoardPresence from "../components/boards/BoardPresence"
import BoardCalendarView from "../components/boards/BoardCalendarView"
import BoardTimelineView from "../components/boards/BoardTimelineView"
import KeyboardShortcutsModal from "../components/KeyboardShortcutsModal"
import { useBoardSocket } from "../hooks/useBoardSocket"
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts"
import { cardDependenciesApi } from "../api/cardDependencies"
import { computeBlockedCardIds } from "../utils/dependencies"
import { MAX_CARDS_PER_LIST } from "@flowgrid/types"

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

const LOCK_ICON = (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
    <rect x="2" y="5.5" width="9" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
    <path d="M3.5 5.5V4A3 3 0 0 1 9.5 4v1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
  </svg>
)

const GLOBE_ICON = (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
    <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.1" />
    <ellipse cx="6.5" cy="6.5" rx="2" ry="4.5" stroke="currentColor" strokeWidth="1.1" />
    <line x1="2" y1="6.5" x2="11" y2="6.5" stroke="currentColor" strokeWidth="1.1" />
  </svg>
)

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

  const [board, setBoard] = useState<BoardDetail | null>(null)
  const [lists, setLists] = useState<ListSummary[]>([])
  const [boardCards, setBoardCards] = useState<Record<string, CardSummary[]>>({})
  const [activeCard, setActiveCard] = useState<CardSummary | null>(null)
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const [loadingBoard, setLoadingBoard] = useState(true)
  const [loadingLists, setLoadingLists] = useState(true)
  const [error, setError] = useState("")
  const [listsError, setListsError] = useState("")
  const [boardView, setBoardView] = useState<BoardView>("kanban")
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

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
  const [blockedCardIds, setBlockedCardIds] = useState<Set<string>>(new Set())
  const refreshDepGraph = useCallback(async () => {
    if (!boardId) return
    try {
      const graph = await cardDependenciesApi.boardGraph(boardId)
      setBlockedCardIds(computeBlockedCardIds(graph.edges, graph.completedCardIds))
    } catch { /* non-critical */ }
  }, [boardId])

  useEffect(() => { void refreshDepGraph() }, [refreshDepGraph])

  useKeyboardShortcuts([
    { key: "?", description: "Open keyboard shortcuts", handler: () => setShortcutsOpen(true) },
    { key: "1", description: "Kanban view", handler: () => setBoardView("kanban") },
    { key: "2", description: "Calendar view", handler: () => setBoardView("calendar") },
    { key: "3", description: "Timeline view", handler: () => setBoardView("timeline") },
  ])

  const canEdit = board?.role === "OWNER" || board?.role === "ADMIN"

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const loadCards = useCallback(async (listIds: string[]) => {
    const results = await Promise.allSettled(
      listIds.map((id) => cardsApi.list(id).then((cards) => ({ id, cards }))),
    )
    setBoardCards((prev) => {
      const next = { ...prev }
      for (const r of results) {
        if (r.status === "fulfilled") next[r.value.id] = r.value.cards
      }
      return next
    })
  }, [])

  const loadLists = useCallback(
    async (bid: string) => {
      setLoadingLists(true)
      setListsError("")
      try {
        const data = await listsApi.list(bid)
        setLists(data)
        await loadCards(data.map((l) => l.id))
      } catch (err) {
        setListsError((err as Error).message || "Failed to load lists")
      } finally {
        setLoadingLists(false)
      }
    },
    [loadCards],
  )

  useEffect(() => {
    if (!boardId) return
    setLoadingBoard(true)
    setError("")
    setBoard(null)
    setLists([])
    setBoardCards({})
    setListPage(0)
    boardsApi
      .getOne(boardId)
      .then((b) => {
        setBoard(b)
        loadLists(boardId)
      })
      .catch((err: unknown) => {
        setError((err as Error).message || "Board not found")
        setLoadingBoard(false)
        setLoadingLists(false)
      })
      .finally(() => setLoadingBoard(false))
  }, [boardId, loadLists])

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
  const colWidth = Math.min(MAX_COL, Math.floor((colsAvail - (colsPerPage - 1) * COL_GAP) / colsPerPage))

  // Per-card height so a FULL list (MAX_CARDS_PER_LIST) fills the column top-to-bottom with no
  // leftover gap. A full list has no "Add a card" row, so the only vertical chrome is the
  // scroll-container padding + the list header. Each card adds CARD_GAP (its marginBottom).
  //   colHeight = CONTAINER_VPAD + LIST_HEADER + MAX * (slot + CARD_GAP)
  // Solve for slot so the column exactly fills the measured viewport (colsHeight).
  const CONTAINER_VPAD = 32 // kanban scroll container top+bottom padding (16 each)
  const LIST_HEADER = 44 // list title row (slightly generous → avoid a scrollbar)
  const CARD_GAP = 8 // matches CardItem marginBottom
  const CARD_MIN = 96
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

  const handleCardUpdated = useCallback((updated: CardSummary) => {
    setBoardCards((prev) => {
      const listCards = prev[updated.listId]
      if (!listCards) return prev
      return {
        ...prev,
        [updated.listId]: listCards.map((c) => (c.id === updated.id ? updated : c)),
      }
    })
    // Completion may have changed → recompute blocked badges
    void refreshDepGraph()
  }, [refreshDepGraph])

  // Label rename/recolor → update that label on every card across the board
  const handleLabelUpdated = useCallback((label: { id: string; name: string; color: string }) => {
    setBoardCards((prev) => {
      const next: Record<string, CardSummary[]> = {}
      for (const [lid, cards] of Object.entries(prev)) {
        next[lid] = cards.map((c) => ({
          ...c,
          labels: c.labels.map((l) => (l.id === label.id ? { ...l, name: label.name, color: label.color } : l)),
        }))
      }
      return next
    })
  }, [])

  // Label deletion → strip that label from every card across the board
  const handleLabelDeleted = useCallback((labelId: string) => {
    setBoardCards((prev) => {
      const next: Record<string, CardSummary[]> = {}
      for (const [lid, cards] of Object.entries(prev)) {
        next[lid] = cards.map((c) => ({
          ...c,
          labels: c.labels.filter((l) => l.id !== labelId),
        }))
      }
      return next
    })
  }, [])

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

      const reordered = arrayMove(items, oldIndex, newIndex)
      setBoardCards((prev) => ({ ...prev, [sourceListId]: reordered }))
      cardsApi.reorder(sourceListId, reordered.map((c) => c.id)).catch(() => {
        // Rollback on failure
        setBoardCards((prev) => ({ ...prev, [sourceListId]: items }))
      })
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

      setBoardCards((prev) => ({
        ...prev,
        [sourceListId]: newSourceCards,
        [destListId]: newDestCards,
      }))

      cardsApi
        .move(activeId, destListId, newDestCards.map((c) => c.id))
        .catch(() => {
          // Rollback on failure
          setBoardCards((prev) => ({
            ...prev,
            [sourceListId]: sourceCards,
            [destListId]: destCards,
          }))
        })
    }
  }

  const handleDragCancel = () => setActiveCard(null)

  // ─── List / card mutations ───────────────────────────────────────────────────

  const handleCreateList = async (name: string) => {
    if (!boardId) return
    const newList = await listsApi.create(boardId, name)
    // Guard against the socket onListCreated handler having already inserted this list
    // (socket event from the server arrives before the HTTP response in most cases)
    setLists((prev) => prev.some((l) => l.id === newList.id) ? prev : [...prev, newList])
    setBoardCards((prev) => prev[newList.id] ? prev : { ...prev, [newList.id]: [] })
  }

  const handleRenamed = (id: string, name: string) => {
    setLists((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)))
  }

  const handleDeleted = (id: string) => {
    setLists((prev) => prev.filter((l) => l.id !== id))
    setBoardCards((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const handleCardCreated = (listId: string, card: CardSummary) => {
    // Guard against the socket onCardCreated handler having already inserted this card
    setBoardCards((prev) => {
      const existing = prev[listId] ?? []
      if (existing.some((c) => c.id === card.id)) return prev
      return { ...prev, [listId]: [...existing, card] }
    })
  }

  // ─── Real-time socket ────────────────────────────────────────────────────────

  const { onlineUsers } = useBoardSocket(boardId, {
    onCardCreated: (card) => {
      // Dedup: sender already added the card via local handleCardCreated; skip if present
      setBoardCards((prev) => {
        const existing = prev[card.listId] ?? []
        if (existing.some((c) => c.id === card.id)) return prev
        return { ...prev, [card.listId]: [...existing, card] }
      })
    },
    onCardUpdated: (card) => {
      setBoardCards((prev) => {
        const listCards = prev[card.listId]
        if (!listCards) return prev
        return { ...prev, [card.listId]: listCards.map((c) => (c.id === card.id ? card : c)) }
      })
      void refreshDepGraph()
    },
    onCardMoved: (card) => {
      setBoardCards((prev) => {
        const next: Record<string, CardSummary[]> = {}
        for (const [lid, cards] of Object.entries(prev)) {
          next[lid] = cards.filter((c) => c.id !== card.id)
        }
        next[card.listId] = [...(next[card.listId] ?? []), card]
        return next
      })
    },
    onCardDeleted: ({ id }) => {
      setBoardCards((prev) => {
        const next: Record<string, CardSummary[]> = {}
        for (const [lid, cards] of Object.entries(prev)) {
          next[lid] = cards.filter((c) => c.id !== id)
        }
        return next
      })
      void refreshDepGraph()
    },
    onCardReordered: ({ listId, cardIds }) => {
      setBoardCards((prev) => {
        const existing = prev[listId]
        if (!existing) return prev
        const byId: Record<string, CardSummary> = {}
        for (const c of existing) byId[c.id] = c
        const reordered = cardIds.map((id) => byId[id]).filter((c): c is CardSummary => !!c)
        return { ...prev, [listId]: reordered }
      })
    },
    onListCreated: (list) => {
      // Dedup: sender already added the list via local handleCreateList
      setLists((prev) => {
        if (prev.some((l) => l.id === list.id)) return prev
        return [...prev, list]
      })
      setBoardCards((prev) => {
        if (prev[list.id]) return prev
        return { ...prev, [list.id]: [] }
      })
    },
    onListUpdated: (list) => {
      setLists((prev) => prev.map((l) => (l.id === list.id ? list : l)))
    },
    onListReordered: ({ lists: reordered }) => {
      setLists(reordered)
    },
    onListDeleted: ({ id }) => {
      setLists((prev) => prev.filter((l) => l.id !== id))
      setBoardCards((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    },
  })

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
    return (
      <div style={centerStyle}>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "oklch(var(--color-error))", fontSize: "var(--text-sm)", marginBottom: "12px" }}>
            {error || "Board not found"}
          </p>
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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "var(--font-body)" }}>
      {/* Board header */}
      <div
        style={{
          background: coverBg,
          padding: "20px 28px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexShrink: 0,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "var(--text-xl)",
            fontWeight: 700,
            color: "#fff",
            fontFamily: "var(--font-display)",
            letterSpacing: "-0.01em",
            textShadow: "0 1px 3px oklch(0% 0 0 / 0.25)",
          }}
        >
          {board.name}
        </h1>

        {board.visibility === "PRIVATE" && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              borderRadius: "var(--radius-badge)",
              background: "oklch(0% 0 0 / 0.30)",
              color: "#fff",
              fontSize: "var(--text-xs)",
              fontWeight: 500,
            }}
          >
            {LOCK_ICON}
            Private
          </span>
        )}
        {board.visibility === "PUBLIC" && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              borderRadius: "var(--radius-badge)",
              background: "oklch(0% 0 0 / 0.30)",
              color: "#fff",
              fontSize: "var(--text-xs)",
              fontWeight: 500,
            }}
          >
            {GLOBE_ICON}
            Public
          </span>
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
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
            {(["kanban", "calendar", "timeline"] as BoardView[]).map((v) => (
              <button
                key={v}
                aria-pressed={boardView === v}
                onClick={() => setBoardView(v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 10px",
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
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          <BoardPresence users={onlineUsers} />
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
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
          <div
            ref={kanbanRef}
            style={{
              flex: 1,
              overflowX: "hidden",
              overflowY: "auto",
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
                    cards={boardCards[item.list.id] ?? []}
                    onRenamed={handleRenamed}
                    onDeleted={handleDeleted}
                    onCardCreated={handleCardCreated}
                    onCardClick={(id) => setOpenCardId(id)}
                    width={colWidth}
                    cardSlotHeight={cardSlotHeight}
                    blockedCardIds={blockedCardIds}
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
                {activeCard ? <CardItem card={activeCard} overlay /> : null}
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
            listName={lists.find((l) => l.id === openCard.listId)?.name}
            onClose={() => { setOpenCardId(null); void refreshDepGraph() }}
            onCardUpdated={handleCardUpdated}
            onLabelUpdated={handleLabelUpdated}
            onLabelDeleted={handleLabelDeleted}
            onCardDeleted={(id) => {
              setBoardCards((prev) => {
                const next: Record<string, CardSummary[]> = {}
                for (const [lid, cards] of Object.entries(prev)) {
                  next[lid] = cards.filter((c) => c.id !== id)
                }
                return next
              })
              setOpenCardId(null)
            }}
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
