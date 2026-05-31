import { useEffect, useState } from "react"
import { useParams, Link } from "react-router-dom"
import { boardsApi, type BoardDetail } from "../api/boards"

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!boardId) return
    setLoading(true)
    setError("")
    boardsApi
      .getOne(boardId)
      .then(setBoard)
      .catch((err: unknown) => {
        const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
        setError(axiosErr?.response?.data?.error?.message ?? "Board not found")
      })
      .finally(() => setLoading(false))
  }, [boardId])

  if (loading) {
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
              style={{
                fontSize: "var(--text-sm)",
                color: "oklch(var(--color-accent))",
                textDecoration: "none",
              }}
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
      {/* Board header with cover color strip */}
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

      {/* Lists area — Feature #8 */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "oklch(var(--color-ink-3))",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <p
            style={{
              margin: "0 0 6px",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              color: "oklch(var(--color-ink-2))",
            }}
          >
            Lists coming soon
          </p>
          <p style={{ margin: 0, fontSize: "var(--text-xs)" }}>
            Lists and cards will be added in the next update.
          </p>
        </div>
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
