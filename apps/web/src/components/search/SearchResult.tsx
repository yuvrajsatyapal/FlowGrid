import type { CardSearchResult, Priority } from "@flowgrid/types"

const PRIORITY_DOT: Record<Priority, string | null> = {
  NONE: null,
  LOW: "oklch(0.62 0.17 237)",
  MEDIUM: "oklch(0.77 0.15 85)",
  HIGH: "oklch(0.67 0.19 48)",
  URGENT: "oklch(0.59 0.22 27)",
}

function formatDueDate(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

interface Props {
  card: CardSearchResult
  isHighlighted: boolean
  onSelect: (card: CardSearchResult) => void
}

export function SearchResult({ card, isHighlighted, onSelect }: Props) {
  const dotColor = PRIORITY_DOT[card.priority]

  return (
    <button
      role="option"
      aria-selected={isHighlighted}
      onClick={() => onSelect(card)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        width: "100%",
        padding: "10px 14px",
        background: isHighlighted ? "oklch(var(--color-paper-2))" : "transparent",
        border: "none",
        borderRadius: "var(--radius-md, 6px)",
        cursor: "pointer",
        textAlign: "left",
        transition: "background 120ms",
      }}
    >
      {/* Priority dot */}
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: dotColor ?? "oklch(var(--color-border))",
        }}
      />

      {/* Text content */}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontSize: "13px",
            fontWeight: 500,
            color: "oklch(var(--color-ink))",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {card.title}
        </span>
        <span
          style={{
            display: "block",
            fontSize: "11px",
            color: "oklch(var(--color-ink-3))",
            marginTop: "2px",
          }}
        >
          {card.boardName} &rsaquo; {card.listName}
        </span>
      </span>

      {/* Right meta */}
      <span style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
        {/* Labels (max 2) */}
        {card.labels.slice(0, 2).map((label) => (
          <span
            key={label.id}
            style={{
              display: "inline-block",
              padding: "1px 6px",
              borderRadius: "var(--radius-badge, 4px)",
              fontSize: "10px",
              fontWeight: 500,
              background: label.color + "33",
              color: label.color,
            }}
          >
            {label.name}
          </span>
        ))}

        {/* Due date */}
        {card.dueDate && (
          <span style={{ fontSize: "11px", color: "oklch(var(--color-ink-3))" }}>
            {formatDueDate(card.dueDate)}
          </span>
        )}

        {/* Assignee avatars (max 3) */}
        {card.assignees.slice(0, 3).map((user) =>
          user.avatarUrl ? (
            <img
              key={user.id}
              src={user.avatarUrl}
              alt={user.name ?? ""}
              width={20}
              height={20}
              style={{ borderRadius: "50%", flexShrink: 0 }}
            />
          ) : (
            <span
              key={user.id}
              aria-label={user.name ?? ""}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                background: "oklch(var(--color-accent-muted))",
                fontSize: "9px",
                fontWeight: 600,
                color: "oklch(var(--color-accent))",
                flexShrink: 0,
              }}
            >
              {(user.name ?? "?")[0].toUpperCase()}
            </span>
          )
        )}
      </span>
    </button>
  )
}
