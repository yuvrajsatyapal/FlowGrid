import { useEffect, useState, useCallback } from "react"
import { useParams, Link } from "react-router-dom"
import { workspacesApi, type WorkspaceDetail } from "../api/workspaces"
import { boardsApi, type BoardSummary } from "../api/boards"
import BoardCard from "../components/boards/BoardCard"
import CreateBoardModal from "../components/boards/CreateBoardModal"

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

export default function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const [detail, setDetail] = useState<WorkspaceDetail | null>(null)
  const [boards, setBoards] = useState<BoardSummary[]>([])
  const [loadingWorkspace, setLoadingWorkspace] = useState(true)
  const [loadingBoards, setLoadingBoards] = useState(true)
  const [error, setError] = useState("")
  const [showCreateModal, setShowCreateModal] = useState(false)

  const canManage = detail?.role === "OWNER" || detail?.role === "ADMIN"

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

  useEffect(() => {
    fetchDetail()
    fetchBoards()
  }, [fetchDetail, fetchBoards])

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
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "28px" }}>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "var(--text-2xl)",
                fontWeight: 600,
                letterSpacing: "-0.02em",
                fontFamily: "var(--font-display)",
              }}
            >
              {detail?.name ?? "Workspace"}
            </h1>
            {detail?.description && (
              <p style={{ margin: "6px 0 0", fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))" }}>
                {detail.description}
              </p>
            )}
            {detail && (
              <div style={{ display: "flex", gap: "16px", marginTop: "10px" }}>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    fontSize: "var(--text-xs)",
                    color: "oklch(var(--color-ink-3))",
                  }}
                >
                  {MEMBERS_ICON}
                  {detail.memberCount} {detail.memberCount === 1 ? "member" : "members"}
                </span>
                <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                  {detail.role}
                </span>
              </div>
            )}
          </div>

          {workspaceId && (
            <Link
              to={`/${workspaceId}/settings`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 14px",
                borderRadius: "var(--radius-button)",
                border: "1px solid oklch(var(--color-border))",
                background: "transparent",
                color: "oklch(var(--color-ink-2))",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                textDecoration: "none",
                transition: "background var(--dur-fast)",
              }}
            >
              Settings
            </Link>
          )}
        </div>

        {/* Boards section */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "16px",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: "var(--text-base)",
                fontWeight: 600,
                color: "oklch(var(--color-ink))",
              }}
            >
              Boards
            </h2>

            {canManage && (
              <button
                onClick={() => setShowCreateModal(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 14px",
                  borderRadius: "var(--radius-button)",
                  border: "none",
                  background: "oklch(var(--color-accent))",
                  color: "#fff",
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                  transition: "background var(--dur-fast)",
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLButtonElement).style.background = "oklch(var(--color-accent-hover))"
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLButtonElement).style.background = "oklch(var(--color-accent))"
                }}
              >
                {PLUS_ICON}
                New board
              </button>
            )}
          </div>

          {loadingBoards ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: "14px",
              }}
            >
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    height: "110px",
                    borderRadius: "var(--radius-card)",
                    background: "oklch(var(--color-paper-2))",
                    opacity: 0.6,
                  }}
                />
              ))}
            </div>
          ) : boards.length === 0 ? (
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
              <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink-2))" }}>
                No boards yet
              </p>
              <p style={{ margin: 0, fontSize: "var(--text-xs)", textAlign: "center", maxWidth: "280px" }}>
                {canManage
                  ? "Create your first board to start organizing tasks."
                  : "No boards have been created in this workspace yet."}
              </p>
              {canManage && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  style={{
                    marginTop: "4px",
                    padding: "8px 18px",
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
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: "14px",
              }}
            >
              {boards.map((board) => (
                <BoardCard key={board.id} board={board} workspaceId={workspaceId!} />
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
                    minHeight: "110px",
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
          )}
        </div>
      </div>

      {showCreateModal && workspaceId && (
        <CreateBoardModal
          workspaceId={workspaceId}
          onCreated={handleBoardCreated}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </>
  )
}

const centerStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}
