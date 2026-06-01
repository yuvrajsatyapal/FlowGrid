import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { motion } from "framer-motion"
import type { Priority } from "@flowgrid/types"
import type { CardSummary } from "../../api/cards"
import { getInitials, getAvatarBg } from "../../utils/avatar"

interface Props {
  card: CardSummary
  /** When true, renders as the DragOverlay clone — no transform/ref needed */
  overlay?: boolean
  onCardClick?: (cardId: string) => void
}

const PRIORITY_DOT: Record<Priority, string | null> = {
  NONE: null,
  LOW: "oklch(0.62 0.17 237)",
  MEDIUM: "oklch(0.77 0.15 85)",
  HIGH: "oklch(0.67 0.19 48)",
  URGENT: "oklch(0.59 0.22 27)",
}

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

function getDueDateStyle(iso: string): { color: string; overdue: boolean } {
  const now = new Date()
  const due = new Date(iso)
  const hoursUntilDue = (due.getTime() - now.getTime()) / 36e5

  if (due < now) {
    return { color: "oklch(var(--color-error))", overdue: true }
  }
  if (hoursUntilDue <= 48) {
    return { color: "oklch(var(--color-warning))", overdue: false }
  }
  return { color: "oklch(var(--color-ink-3))", overdue: false }
}

function WarningIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M5 1L9.33 8.5H0.67L5 1Z" fill="currentColor" />
      <path d="M5 4.5V6.5" stroke="white" strokeWidth="1" strokeLinecap="round" />
      <circle cx="5" cy="7.5" r="0.5" fill="white" />
    </svg>
  )
}

export default function CardItem({ card, overlay = false, onCardClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  })

  const dotColor = PRIORITY_DOT[card.priority]
  const hasMetadata = card.assignee !== null || card.dueDate !== null || card.labels.length > 0

  // ≤3 labels: show all; 4+ labels: first 2 + "+N"
  const showAll = card.labels.length <= 3
  const visibleLabels = showAll ? card.labels : card.labels.slice(0, 2)
  const overflowCount = showAll ? 0 : card.labels.length - 2

  const prioritySuffix = card.priority !== "NONE" ? ` — ${card.priority.toLowerCase()} priority` : ""

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={{
        transform: overlay ? undefined : CSS.Transform.toString(transform),
        transition: overlay ? undefined : transition,
        opacity: isDragging && !overlay ? 0.35 : 1,
        cursor: overlay ? "grabbing" : "grab",
        touchAction: "none",
      }}
      {...(overlay ? {} : { ...attributes, ...listeners })}
    >
      <motion.div
        role="article"
        aria-label={`${card.title}${prioritySuffix}`}
        title={card.title}
        onClick={(e) => {
          if (overlay || isDragging) return
          e.stopPropagation()
          onCardClick?.(card.id)
        }}
        whileHover={(!overlay && !isDragging) ? { y: -2, boxShadow: "0 4px 12px oklch(0% 0 0 / 0.10)" } : undefined}
        whileTap={(!overlay && !isDragging) ? { scale: 0.98 } : undefined}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        style={{
          background: "oklch(var(--color-paper))",
          borderRadius: "var(--radius-card)",
          border: "1px solid oklch(var(--color-border))",
          padding: "8px 10px",
          marginBottom: 4,
          boxShadow: overlay ? "0 8px 24px oklch(0% 0 0 / 0.16)" : undefined,
        }}
        onMouseEnter={(e) => {
          if (overlay || isDragging) return
          const el = e.currentTarget as HTMLDivElement
          el.style.borderColor = "oklch(var(--color-accent-muted))"
        }}
        onMouseLeave={(e) => {
          if (overlay || isDragging) return
          const el = e.currentTarget as HTMLDivElement
          el.style.borderColor = ""
        }}
      >
        {/* Row 1: priority dot + title */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
          {dotColor && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: dotColor,
                flexShrink: 0,
                marginTop: 4,
              }}
            />
          )}
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              color: "oklch(var(--color-ink))",
              lineHeight: 1.4,
              flex: 1,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              wordBreak: "break-word",
            }}
          >
            {card.title}
          </span>
        </div>

        {/* Row 2: labels + due date + avatar — only when at least one exists */}
        {hasMetadata && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
            {card.labels.length > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  flex: 1,
                  overflow: "hidden",
                  flexWrap: "nowrap",
                }}
              >
                {visibleLabels.map((label) => (
                  <span
                    key={label.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      padding: "1px 5px",
                      borderRadius: "var(--radius-badge)",
                      border: "1px solid oklch(var(--color-border))",
                      background: "oklch(var(--color-paper-2))",
                      maxWidth: 80,
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        flexShrink: 0,
                        background: label.color || "oklch(var(--color-ink-3))",
                      }}
                    />
                    <span
                      style={{
                        fontSize: "var(--text-xs)",
                        color: "oklch(var(--color-ink-2))",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {label.name}
                    </span>
                  </span>
                ))}
                {overflowCount > 0 && (
                  <span
                    style={{
                      fontSize: "var(--text-xs)",
                      color: "oklch(var(--color-ink-3))",
                      padding: "1px 4px",
                      borderRadius: "var(--radius-badge)",
                      border: "1px solid oklch(var(--color-border))",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    +{overflowCount}
                  </span>
                )}
              </div>
            )}

            {card.dueDate && (
              <DueDateChip dueDate={card.dueDate} hasLabels={card.labels.length > 0} />
            )}

            {card.assignee && (
              <AssigneeAvatar
                id={card.assignee.id}
                name={card.assignee.name}
                avatarUrl={card.assignee.avatarUrl}
              />
            )}
          </div>
        )}
      </motion.div>
    </div>
  )
}

function DueDateChip({ dueDate, hasLabels }: { dueDate: string; hasLabels: boolean }) {
  const { color, overdue } = getDueDateStyle(dueDate)
  return (
    <time
      dateTime={dueDate}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 3,
        fontFamily: "var(--font-body)",
        fontSize: "var(--text-xs)",
        color,
        whiteSpace: "nowrap",
        flexShrink: 0,
        marginLeft: hasLabels ? undefined : "auto",
      }}
    >
      {overdue && <WarningIcon />}
      {formatDueDate(dueDate)}
    </time>
  )
}

function AssigneeAvatar({ id, name, avatarUrl }: { id: string; name: string | null; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name ?? "Assignee"}
        width={20}
        height={20}
        style={{
          borderRadius: "50%",
          objectFit: "cover",
          display: "block",
          flexShrink: 0,
        }}
      />
    )
  }
  return (
    <div
      aria-label={name ?? "Assigned user"}
      style={{
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: getAvatarBg(id),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        color: "#fff",
        fontSize: 9,
        fontWeight: 600,
        fontFamily: "var(--font-body)",
        letterSpacing: "0.5px",
        userSelect: "none",
      }}
    >
      {getInitials(name)}
    </div>
  )
}
