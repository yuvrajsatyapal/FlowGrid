import { useState } from "react"
import { useNavigate } from "react-router-dom"
import type { BoardSummary } from "../../api/boards"
import { getInitials, getAvatarBg } from "../../utils/avatar"

const DEFAULT_COVER = "#64748b"


const BoardGlyph = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="3" width="7" height="18" rx="2" fill="rgba(255,255,255,0.28)" />
    <rect x="13" y="3" width="8" height="11" rx="2" fill="rgba(255,255,255,0.28)" />
    <rect x="13" y="17" width="8" height="4" rx="2" fill="rgba(255,255,255,0.16)" />
  </svg>
)

const PinIcon = ({ filled }: { filled: boolean }) => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M9.5 2L14 6.5L11.5 9L9 11.5L6.5 9L4 11.5L2.5 10L5 7.5L2.5 5L5 2.5L7 4.5L9.5 2Z"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
)

const EditIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10l7.5-7.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10.5 3.5l2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

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

interface Props {
  board: BoardSummary
  workspaceId: string
  isPinned: boolean
  onTogglePin: (boardId: string) => void
  onEdit?: (board: BoardSummary) => void
}

export default function BoardCard({ board, workspaceId, isPinned, onTogglePin, onEdit }: Props) {
  const navigate = useNavigate()
  const coverBg = board.coverColor ?? DEFAULT_COVER
  const visibleMembers = (board.members ?? []).slice(0, 2)
  const extra = (board.memberCount ?? 0) - 2
  const [hovered, setHovered] = useState(false)

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={() => navigate(`/${workspaceId}/${board.id}`)}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          borderRadius: "var(--radius-card)",
          border: hovered
            ? "1px solid oklch(var(--color-accent) / 0.4)"
            : "1px solid oklch(var(--color-border))",
          overflow: "hidden",
          background: "oklch(var(--color-paper))",
          transition: "box-shadow var(--dur-base), border-color var(--dur-base), transform var(--dur-fast)",
          boxSizing: "border-box",
          width: "100%",
          textAlign: "left",
          boxShadow: hovered
            ? "0 4px 16px oklch(var(--color-ink) / 0.08), 0 1px 4px oklch(var(--color-ink) / 0.04)"
            : "none",
          transform: hovered ? "translateY(-2px)" : "none",
        }}
        aria-label={`Open board: ${board.name}`}
      >
        {/* Cover strip */}
        <div
          style={{
            height: "80px",
            background: coverBg,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to bottom, rgba(0,0,0,0) 40%, rgba(0,0,0,0.14) 100%)",
              pointerEvents: "none",
            }}
          />
          <BoardGlyph />
        </div>

        {/* Content */}
        <div style={{ padding: "13px 14px 14px", display: "flex", flexDirection: "column", gap: "9px", flex: 1 }}>
          {/* Board name */}
          <span
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "oklch(var(--color-ink))",
              lineHeight: 1.35,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {board.name}
          </span>

          {/* Visibility badge + member avatars */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "auto" }}>
            {board.visibility === "PRIVATE" ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "3px",
                  fontSize: "0.625rem",
                  fontWeight: 500,
                  color: "oklch(var(--color-ink-3))",
                  padding: "2px 7px",
                  borderRadius: "100px",
                  background: "oklch(var(--color-paper-3))",
                  lineHeight: 1.5,
                }}
              >
                🔒 Private
              </span>
            ) : (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "3px",
                  fontSize: "0.625rem",
                  fontWeight: 500,
                  color: "oklch(var(--color-ink-3))",
                  padding: "2px 7px",
                  borderRadius: "100px",
                  background: "oklch(var(--color-paper-3))",
                  lineHeight: 1.5,
                }}
              >
                🌐 Workspace
              </span>
            )}

            <div style={{ flex: 1 }} />

            {/* Member avatars cluster */}
            {(board.members?.length ?? 0) > 0 && (
              <div style={{ display: "flex", alignItems: "center" }}>
                {visibleMembers.map((m, i) => (
                  <div
                    key={m.id}
                    title={m.name ?? undefined}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      border: "1.5px solid oklch(var(--color-paper))",
                      marginLeft: i === 0 ? 0 : -6,
                      background: m.avatarUrl ? "transparent" : getAvatarBg(m.id),
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    {m.avatarUrl ? (
                      <img src={m.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: "7px", fontWeight: 700, color: "#fff" }}>{getInitials(m.name ?? "?")}</span>
                    )}
                  </div>
                ))}
                {extra > 0 && (
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      border: "1.5px solid oklch(var(--color-paper))",
                      marginLeft: -6,
                      background: "oklch(var(--color-paper-3))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "6px",
                      fontWeight: 700,
                      color: "oklch(var(--color-ink-2))",
                      flexShrink: 0,
                    }}
                  >
                    +{extra}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stats row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: "9px",
              borderTop: "1px solid oklch(var(--color-border) / 0.7)",
            }}
          >
            <span style={{ fontSize: "0.625rem", color: "oklch(var(--color-ink-3))" }}>
              {board.listCount} {board.listCount === 1 ? "list" : "lists"}
              {board.cardCount > 0 && ` · ${board.cardCount} cards`}
            </span>
            <span style={{ fontSize: "0.625rem", color: "oklch(var(--color-ink-3))" }}>
              {timeAgo(board.updatedAt)}
            </span>
          </div>
        </div>
      </button>

      {/* Action buttons: [pin][edit] — shown on hover */}
      <div
        style={{
          position: "absolute",
          top: "8px",
          right: "8px",
          display: "flex",
          gap: "4px",
          opacity: hovered || isPinned ? 1 : 0,
          transition: "opacity var(--dur-fast)",
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            onTogglePin(board.id)
          }}
          aria-label={isPinned ? "Unpin board" : "Pin board"}
          title={isPinned ? "Unpin" : "Pin board"}
          style={{
            width: "26px",
            height: "26px",
            borderRadius: "var(--radius-badge)",
            border: "none",
            background: isPinned
              ? "oklch(var(--color-accent))"
              : "oklch(var(--color-paper) / 0.92)",
            backdropFilter: "blur(4px)",
            color: isPinned ? "#fff" : "oklch(var(--color-ink-2))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "background var(--dur-fast), color var(--dur-fast)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.14)",
          }}
          onMouseEnter={(e) => {
            if (isPinned) {
              e.currentTarget.style.background = "oklch(var(--color-accent-hover))"
            } else {
              e.currentTarget.style.background = "oklch(var(--color-accent) / 0.15)"
              e.currentTarget.style.color = "oklch(var(--color-accent))"
            }
          }}
          onMouseLeave={(e) => {
            if (isPinned) {
              e.currentTarget.style.background = "oklch(var(--color-accent))"
            } else {
              e.currentTarget.style.background = "oklch(var(--color-paper) / 0.92)"
              e.currentTarget.style.color = "oklch(var(--color-ink-2))"
            }
          }}
        >
          <PinIcon filled={isPinned} />
        </button>

        {onEdit && <button
          onClick={(e) => {
            e.stopPropagation()
            onEdit(board)
          }}
          aria-label="Edit board"
          title="Edit board"
          style={{
            width: "26px",
            height: "26px",
            borderRadius: "var(--radius-badge)",
            border: "none",
            background: "oklch(var(--color-paper) / 0.92)",
            backdropFilter: "blur(4px)",
            color: "oklch(var(--color-ink-2))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "background var(--dur-fast), color var(--dur-fast)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.14)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "oklch(var(--color-accent) / 0.15)"
            e.currentTarget.style.color = "oklch(var(--color-accent))"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "oklch(var(--color-paper) / 0.92)"
            e.currentTarget.style.color = "oklch(var(--color-ink-2))"
          }}
        >
          <EditIcon />
        </button>}
      </div>
    </div>
  )
}
