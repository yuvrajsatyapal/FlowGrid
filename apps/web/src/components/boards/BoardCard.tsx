import { useNavigate } from "react-router-dom"
import type { BoardSummary } from "../../api/boards"

const DEFAULT_COVER = "#64748b"

const LockIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
    <rect x="1.5" y="4.5" width="8" height="6" rx="1.25" stroke="currentColor" strokeWidth="1.1" />
    <path d="M3 4.5V3.25a2.5 2.5 0 0 1 5 0V4.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
  </svg>
)

const GlobeIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
    <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.1" />
    <ellipse cx="5.5" cy="5.5" rx="1.8" ry="4" stroke="currentColor" strokeWidth="1.1" />
    <line x1="1.5" y1="5.5" x2="9.5" y2="5.5" stroke="currentColor" strokeWidth="1.1" />
  </svg>
)

interface Props {
  board: BoardSummary
  workspaceId: string
}

export default function BoardCard({ board, workspaceId }: Props) {
  const navigate = useNavigate()

  const coverBg = board.coverColor ?? DEFAULT_COVER

  return (
    <button
      onClick={() => navigate(`/${workspaceId}/${board.id}`)}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        borderRadius: "var(--radius-card)",
        border: "1px solid oklch(var(--color-border))",
        overflow: "hidden",
        background: "oklch(var(--color-paper))",
        transition: "box-shadow var(--dur-base), border-color var(--dur-base), transform var(--dur-fast)",
        boxSizing: "border-box",
        width: "100%",
        textAlign: "left",
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 16px oklch(0% 0 0 / 0.10)"
        ;(e.currentTarget as HTMLButtonElement).style.borderColor = "oklch(var(--color-border))"
        ;(e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.boxShadow = "none"
        ;(e.currentTarget as HTMLButtonElement).style.transform = "none"
      }}
      aria-label={`Open board: ${board.name}`}
    >
      {/* Cover strip */}
      <div
        style={{
          height: "52px",
          background: coverBg,
          flexShrink: 0,
        }}
      />

      {/* Content */}
      <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: "6px", flex: 1 }}>
        <span
          style={{
            fontSize: "var(--text-sm)",
            fontWeight: 600,
            color: "oklch(var(--color-ink))",
            lineHeight: "1.3",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {board.name}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "auto" }}>
          {board.visibility === "PRIVATE" && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "3px",
                fontSize: "var(--text-xs)",
                color: "oklch(var(--color-ink-3))",
              }}
            >
              <LockIcon />
              Private
            </span>
          )}
          {board.visibility === "PUBLIC" && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "3px",
                fontSize: "var(--text-xs)",
                color: "oklch(var(--color-ink-3))",
              }}
            >
              <GlobeIcon />
              Public
            </span>
          )}
          {board.listCount > 0 && (
            <span
              style={{
                fontSize: "var(--text-xs)",
                color: "oklch(var(--color-ink-3))",
                marginLeft: board.visibility === "WORKSPACE" ? "0" : "auto",
              }}
            >
              {board.listCount} {board.listCount === 1 ? "list" : "lists"}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
