import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { motion } from "framer-motion"
import type { Priority } from "@flowgrid/types"
import type { CardSummary } from "../../api/cards"
import { getInitials, getAvatarBg } from "../../utils/avatar"

interface Props {
  card: CardSummary
  listName?: string
  isDoneList?: boolean
  /** True when the card is blocked by an incomplete dependency */
  blocked?: boolean
  /** Min height for the card so a full list fills the column; omitted for the drag overlay */
  minHeight?: number
  /** When true, renders as the DragOverlay clone — no transform/ref needed */
  overlay?: boolean
  /** When true, card is read-only: no click, no metadata — only label, title, description */
  isViewer?: boolean
  onCardClick?: (cardId: string) => void
}

const PRIORITY_DOT: Record<Priority, string | null> = {
  NONE: null,
  LOW: "oklch(0.62 0.17 237)",
  MEDIUM: "oklch(0.77 0.15 85)",
  HIGH: "oklch(0.67 0.19 48)",
  URGENT: "oklch(0.59 0.22 27)",
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const PAPERCLIP_ICON = (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
    <path d="M8.5 4.5L4.5 8.5a2.5 2.5 0 01-3.5-3.5l4-4a1.5 1.5 0 012 2L3 7a.5.5 0 01-.7-.7L6 2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
  </svg>
)

const FLAG_ICON = (
  <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden="true">
    <path d="M1.5 1.5v6M1.5 1.5l5 1.5-5 1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDueDate(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const sameYear = date.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date)
}

function formatCompletedDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AssigneeAvatar({ id, name, avatarUrl }: { id: string; name: string | null; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <img src={avatarUrl} alt={name ?? "Assignee"} width={22} height={22}
        style={{ borderRadius: "50%", objectFit: "cover", display: "block", flexShrink: 0 }} />
    )
  }
  return (
    <div
      aria-label={name ?? "Assigned user"}
      title={name ?? undefined}
      style={{
        width: 22, height: 22, borderRadius: "50%",
        background: getAvatarBg(id),
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, color: "#fff", fontSize: 9, fontWeight: 700,
        fontFamily: "var(--font-body)", userSelect: "none",
      }}
    >
      {getInitials(name)}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CardItem({ card, isDoneList = false, blocked = false, minHeight, overlay = false, isViewer = false, onCardClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })

  const firstLabel = card.labels[0] ?? null
  const prioritySuffix = card.priority !== "NONE" ? ` — ${card.priority.toLowerCase()} priority` : ""
  const isComplete = card.completedAt != null
  const done = isComplete || isDoneList

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={{
        transform: overlay ? undefined : CSS.Transform.toString(transform),
        transition: overlay ? undefined : transition,
        opacity: isDragging && !overlay ? 0.35 : 1,
        cursor: overlay ? "grabbing" : isViewer ? "default" : "grab",
        touchAction: "none",
        // Fill the slot in a full list (parent stretches to the column height); a no-op in a
        // content-sized partial list, where cards just take their minHeight.
        flex: overlay ? undefined : "1 1 0",
        display: overlay ? undefined : "flex",
        flexDirection: "column",
        minHeight: overlay ? undefined : minHeight,
      }}
      {...(overlay ? {} : { ...attributes, ...listeners })}
    >
      <motion.div
        role="article"
        aria-label={`${card.title}${prioritySuffix}`}
        title={card.title}
        onClick={(e) => {
          if (overlay || isDragging || isViewer) return
          e.stopPropagation()
          onCardClick?.(card.id)
        }}
        whileHover={(!overlay && !isDragging && !isViewer) ? { y: -2 } : undefined}
        whileTap={(!overlay && !isDragging && !isViewer) ? { scale: 0.98 } : undefined}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        style={{
          background: "oklch(var(--color-paper))",
          borderRadius: "var(--radius-card)",
          border: "1px solid oklch(var(--color-border))",
          padding: "13px 14px 14px",
          flex: overlay ? undefined : 1,
          minHeight: overlay ? undefined : minHeight,
          boxShadow: overlay ? "0 8px 24px oklch(0% 0 0 / 0.16)" : "0 1px 2px oklch(0% 0 0 / 0.04)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          overflow: "hidden",
        }}
        onMouseEnter={(e) => {
          if (overlay || isDragging || isViewer) return
          ;(e.currentTarget as HTMLDivElement).style.borderColor = "oklch(var(--color-accent-muted))"
        }}
        onMouseLeave={(e) => {
          if (overlay || isDragging || isViewer) return
          ;(e.currentTarget as HTMLDivElement).style.borderColor = ""
        }}
      >
        {/* Two-column body: left content + right stats/avatar */}
        <div style={{ display: "flex", gap: 8, flex: 1, minWidth: 0 }}>

          {/* Left column: label → title → description → badges */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            {firstLabel && (
              <span
                style={{
                  alignSelf: "flex-start",
                  padding: "1px 6px",
                  borderRadius: "var(--radius-badge)",
                  background: `${firstLabel.color}28`,
                  border: `1px solid ${firstLabel.color}50`,
                  fontSize: "0.5625rem",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: firstLabel.color || "oklch(var(--color-ink-3))",
                  maxWidth: 120,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {firstLabel.name}
              </span>
            )}

            <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              {PRIORITY_DOT[card.priority] && (
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: PRIORITY_DOT[card.priority]!,
                    flexShrink: 0,
                    marginTop: 5,
                  }}
                />
              )}
              <span
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--text-base)",
                  fontWeight: 600,
                  color: done ? "oklch(var(--color-ink-3))" : "oklch(var(--color-ink))",
                  lineHeight: 1.45,
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  wordBreak: "break-word",
                  textDecoration: done ? "line-through" : "none",
                }}
              >
                {card.title}
              </span>
            </div>

            {card.description && (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span
                  style={{
                    fontSize: "0.5625rem",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "oklch(var(--color-ink-3))",
                  }}
                >
                  Description
                </span>
                <span
                  style={{
                    fontSize: "0.625rem",
                    color: "oklch(var(--color-ink-3))",
                    lineHeight: 1.5,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: !isViewer && blocked && !isComplete ? 2 : 3,
                    WebkitBoxOrient: "vertical",
                    wordBreak: "break-word",
                  }}
                >
                  {card.description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}
                </span>
              </div>
            )}

            {!isViewer && blocked && !isComplete && (
              <span
                style={{
                  alignSelf: "flex-start",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  padding: "1px 6px",
                  borderRadius: "var(--radius-badge)",
                  background: "oklch(var(--color-error) / 0.12)",
                  color: "oklch(var(--color-error))",
                  fontSize: "0.5625rem",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                }}
              >
                🔒 Blocked
              </span>
            )}

            {!isViewer && done && (
              <span style={{ fontSize: "0.5625rem", color: "oklch(var(--color-ink-3))", letterSpacing: "0.04em" }}>
                Completed {formatCompletedDate(card.completedAt ?? card.updatedAt)}
              </span>
            )}
          </div>

          {/* Right column: stats stacked at top, avatar pinned to bottom — hidden for viewers */}
          {!isViewer && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
              {card.dueDate && (
                <span style={{ display: "flex", alignItems: "center", gap: 2, fontSize: "0.6875rem", fontWeight: 600, color: "oklch(var(--color-error))", whiteSpace: "nowrap" }}>
                  {FLAG_ICON} {formatDueDate(card.dueDate)}
                </span>
              )}
              {card.checklistTotal > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: 2, fontSize: "0.6875rem", color: card.checklistDone === card.checklistTotal ? "oklch(var(--color-success))" : "oklch(var(--color-ink-3))" }}>
                  ✓ {card.checklistDone}/{card.checklistTotal}
                </span>
              )}
              {card.attachmentCount > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: 2, fontSize: "0.6875rem", color: "oklch(var(--color-ink-3))" }}>
                  {PAPERCLIP_ICON} {card.attachmentCount}
                </span>
              )}
              <div style={{ flex: 1 }} />
              {card.assignee && (
                <AssigneeAvatar id={card.assignee.id} name={card.assignee.name} avatarUrl={card.assignee.avatarUrl} />
              )}
            </div>
          )}

        </div>
      </motion.div>
    </div>
  )
}
