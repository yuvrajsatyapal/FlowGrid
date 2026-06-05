import { useState } from "react"
import { useNavigate } from "react-router-dom"
import type { BoardSummary } from "../../api/boards"
import { getInitials, getAvatarBg } from "../../utils/avatar"

const DEFAULT_COVER = "#64748b"

const LockIcon = () => (
  <svg width="10" height="10" viewBox="0 0 11 11" fill="none" aria-hidden="true">
    <rect x="1.5" y="4.5" width="8" height="6" rx="1.25" stroke="currentColor" strokeWidth="1.1" />
    <path d="M3 4.5V3.25a2.5 2.5 0 0 1 5 0V4.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
  </svg>
)

const GlobeIcon = () => (
  <svg width="10" height="10" viewBox="0 0 11 11" fill="none" aria-hidden="true">
    <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.1" />
    <ellipse cx="5.5" cy="5.5" rx="1.8" ry="4" stroke="currentColor" strokeWidth="1.1" />
    <line x1="1.5" y1="5.5" x2="9.5" y2="5.5" stroke="currentColor" strokeWidth="1.1" />
  </svg>
)

const BoardGlyph = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="3" width="7" height="18" rx="2" fill="rgba(255,255,255,0.25)" />
    <rect x="13" y="3" width="8" height="11" rx="2" fill="rgba(255,255,255,0.25)" />
    <rect x="13" y="17" width="8" height="4" rx="2" fill="rgba(255,255,255,0.15)" />
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
}

export default function BoardCard({ board, workspaceId, isPinned, onTogglePin }: Props) {
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
          border: "1px solid oklch(var(--color-border))",
          overflow: "hidden",
          background: "oklch(var(--color-paper))",
          transition: "box-shadow var(--dur-base), border-color var(--dur-base), transform var(--dur-fast)",
          boxSizing: "border-box",
          width: "100%",
          textAlign: "left",
          boxShadow: hovered ? "var(--shadow-card)" : "none",
          transform: hovered ? "translateY(-2px)" : "none",
        }}
        aria-label={`Open board: ${board.name}`}
      >
        {/* Cover strip */}
        <div
          style={{
            height: "60px",
            background: coverBg,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.95,
          }}
        >
          <BoardGlyph />
        </div>

        {/* Content */}
        <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
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

          {/* Footer row */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "auto" }}>
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

            <div style={{ flex: 1 }} />

            {/* Member avatars cluster */}
            {(board.members?.length ?? 0) > 0 && (
              <div style={{ display: "flex", alignItems: "center" }}>
                {visibleMembers.map((m, i) => (
                  <div
                    key={m.id}
                    title={m.name ?? undefined}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      border: "1.5px solid oklch(var(--color-paper))",
                      marginLeft: i === 0 ? 0 : -5,
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
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      border: "1.5px solid oklch(var(--color-paper))",
                      marginLeft: -5,
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

          {/* Meta row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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

      {/* Pin button — shown on hover or when already pinned */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onTogglePin(board.id)
        }}
        aria-label={isPinned ? "Unpin board" : "Pin board"}
        title={isPinned ? "Unpin" : "Pin board"}
        style={{
          position: "absolute",
          top: "8px",
          right: "8px",
          width: "26px",
          height: "26px",
          borderRadius: "var(--radius-badge)",
          border: "none",
          background: isPinned
            ? "oklch(var(--color-accent))"
            : "oklch(var(--color-paper) / 0.9)",
          backdropFilter: "blur(4px)",
          color: isPinned ? "#fff" : "oklch(var(--color-ink-2))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          opacity: hovered || isPinned ? 1 : 0,
          transition: "opacity var(--dur-fast), background var(--dur-fast), color var(--dur-fast)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
        }}
      >
        <PinIcon filled={isPinned} />
      </button>
    </div>
  )
}
