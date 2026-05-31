import { useEffect, useState, useCallback } from "react"
import { useParams, Link } from "react-router-dom"
import { boardsApi, type BoardDetail } from "../api/boards"
import { listsApi, type ListSummary } from "../api/lists"
import ListColumn from "../components/boards/ListColumn"
import CreateListInline from "../components/boards/CreateListInline"

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
  const [loadingBoard, setLoadingBoard] = useState(true)
  const [loadingLists, setLoadingLists] = useState(true)
  const [error, setError] = useState("")
  const [listsError, setListsError] = useState("")

  const canEdit = board?.role === "OWNER" || board?.role === "ADMIN"

  const loadLists = useCallback(async (bid: string) => {
    setLoadingLists(true)
    setListsError("")
    try {
      const data = await listsApi.list(bid)
      setLists(data)
    } catch (err) {
      setListsError((err as Error).message || "Failed to load lists")
    } finally {
      setLoadingLists(false)
    }
  }, [])

  useEffect(() => {
    if (!boardId) return
    setLoadingBoard(true)
    setError("")
    setBoard(null)
    setLists([])
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

  const handleCreateList = async (name: string) => {
    if (!boardId) return
    const newList = await listsApi.create(boardId, name)
    setLists((prev) => [...prev, newList])
  }

  const handleRenamed = (id: string, name: string) => {
    setLists((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)))
  }

  const handleDeleted = (id: string) => {
    setLists((prev) => prev.filter((l) => l.id !== id))
  }

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
          <>
            {lists.map((list) => (
              <ListColumn
                key={list.id}
                list={list}
                canEdit={canEdit}
                onRenamed={handleRenamed}
                onDeleted={handleDeleted}
              />
            ))}
            {canEdit && <CreateListInline onSubmit={handleCreateList} />}
            {!canEdit && lists.length === 0 && (
              <div style={{ color: "oklch(var(--color-ink-3))", fontSize: "var(--text-sm)" }}>
                This board has no lists yet.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const centerStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}
