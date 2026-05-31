import { useEffect, useState, useCallback } from "react"
import { useParams, Link } from "react-router-dom"
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

export default function BoardPage() {
  const { workspaceId, boardId } = useParams<{ workspaceId: string; boardId: string }>()

  const [board, setBoard] = useState<BoardDetail | null>(null)
  const [lists, setLists] = useState<ListSummary[]>([])
  const [boardCards, setBoardCards] = useState<Record<string, CardSummary[]>>({})
  const [activeCard, setActiveCard] = useState<CardSummary | null>(null)
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const [loadingBoard, setLoadingBoard] = useState(true)
  const [loadingLists, setLoadingLists] = useState(true)
  const [error, setError] = useState("")
  const [listsError, setListsError] = useState("")

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

  // ─── Modal helpers ──────────────────────────────────────────────────────────

  const openCard = openCardId
    ? Object.values(boardCards).flat().find((c) => c.id === openCardId) ?? null
    : null

  function handleCardUpdated(updated: CardSummary) {
    setBoardCards((prev) => {
      const listCards = prev[updated.listId]
      if (!listCards) return prev
      return {
        ...prev,
        [updated.listId]: listCards.map((c) => (c.id === updated.id ? updated : c)),
      }
    })
  }

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
    setLists((prev) => [...prev, newList])
    setBoardCards((prev) => ({ ...prev, [newList.id]: [] }))
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
    setBoardCards((prev) => ({ ...prev, [listId]: [...(prev[listId] ?? []), card] }))
  }

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
      </div>

      {/* Kanban columns area */}
      <div
        style={{
          flex: 1,
          overflowX: "auto",
          overflowY: "hidden",
          padding: "20px 24px",
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
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
            {lists.map((list) => (
              <ListColumn
                key={list.id}
                list={list}
                canEdit={canEdit}
                cards={boardCards[list.id] ?? []}
                onRenamed={handleRenamed}
                onDeleted={handleDeleted}
                onCardCreated={handleCardCreated}
                onCardClick={(id) => setOpenCardId(id)}
              />
            ))}
            {canEdit && <CreateListInline onSubmit={handleCreateList} />}
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

      {openCard && board && workspaceId && (
        <CardDetailModal
          card={openCard}
          boardId={board.id}
          workspaceId={workspaceId}
          canEdit={canEdit}
          onClose={() => setOpenCardId(null)}
          onCardUpdated={handleCardUpdated}
        />
      )}
    </div>
  )
}

const centerStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}
