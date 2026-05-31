import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { Priority } from "@flowgrid/types"
import type { CardSummary } from "../../api/cards"

interface Props {
  card: CardSummary
  /** When true, renders as the DragOverlay clone — no transform/ref needed */
  overlay?: boolean
}

const PRIORITY_DOT: Record<Priority, string | null> = {
  NONE: null,
  LOW: "oklch(0.62 0.17 237)",
  MEDIUM: "oklch(0.77 0.15 85)",
  HIGH: "oklch(0.67 0.19 48)",
  URGENT: "oklch(0.59 0.22 27)",
}

export default function CardItem({ card, overlay = false }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  })

  const dotColor = PRIORITY_DOT[card.priority]

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
      <div
        style={{
          background: "oklch(var(--color-paper))",
          borderRadius: "var(--radius-badge)",
          border: "1px solid oklch(var(--color-border))",
          padding: "8px 10px",
          display: "flex",
          alignItems: "flex-start",
          gap: 7,
          marginBottom: 4,
          boxShadow: overlay ? "0 8px 20px oklch(0% 0 0 / 0.14)" : undefined,
        }}
      >
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
            fontSize: "var(--text-sm)",
            color: "oklch(var(--color-ink))",
            lineHeight: 1.4,
            wordBreak: "break-word",
            flex: 1,
          }}
        >
          {card.title}
        </span>
      </div>
    </div>
  )
}
