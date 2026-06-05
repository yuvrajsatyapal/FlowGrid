import { useEffect, useState, useCallback } from "react"
import { Calendar, dateFnsLocalizer, type Event as RBCEvent } from "react-big-calendar"
import { format, parse, startOfWeek, getDay } from "date-fns"
import { enUS } from "date-fns/locale"
import "react-big-calendar/lib/css/react-big-calendar.css"
import { boardsApi, type CalendarCard } from "../../api/boards"

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales: { "en-US": enUS },
})

interface CalendarEvent extends RBCEvent {
  cardId: string
  priority: CalendarCard["priority"]
  listTitle: string
}

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: "#ef4444",
  HIGH: "#f97316",
  MEDIUM: "#eab308",
  LOW: "#22c55e",
  NONE: "#64748b",
}

interface Props {
  boardId: string
  onCardClick: (cardId: string) => void
}

export default function BoardCalendarView({ boardId, onCardClick }: Props) {
  const [cards, setCards] = useState<CalendarCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await boardsApi.getCalendarCards(boardId)
      setCards(data)
    } catch {
      setError("Failed to load calendar data.")
    } finally {
      setLoading(false)
    }
  }, [boardId])

  useEffect(() => {
    void load()
  }, [load])

  // Cards with at least a dueDate show on the calendar
  const events: CalendarEvent[] = cards
    .filter((c) => c.dueDate !== null)
    .map((c) => {
      const due = new Date(c.dueDate!)
      const start = c.startDate ? new Date(c.startDate) : due
      return {
        cardId: c.id,
        title: c.title,
        start,
        end: due,
        priority: c.priority,
        listTitle: c.listTitle,
        allDay: true,
      }
    })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-24 text-[oklch(var(--color-ink-3))]">
        Loading calendar…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-24 gap-3">
        <p className="text-[oklch(var(--color-error))]">{error}</p>
        <button
          onClick={() => void load()}
          className="px-4 py-1.5 text-sm rounded-md bg-[oklch(var(--color-accent))] text-white hover:bg-[oklch(var(--color-accent-hover))]"
        >
          Retry
        </button>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-24 gap-2 text-center">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-[oklch(var(--color-ink-3))]">
          <rect x="6" y="10" width="36" height="32" rx="4" stroke="currentColor" strokeWidth="2" />
          <path d="M6 18h36M16 6v8M32 6v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <p className="text-[oklch(var(--color-ink-2))] font-medium">No cards with due dates</p>
        <p className="text-sm text-[oklch(var(--color-ink-3))]">
          Set a due date on a card to see it here.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full p-4 overflow-auto">
      <style>{`
        .rbc-calendar { font-family: inherit; color: oklch(var(--color-ink)); }
        .rbc-header { background: oklch(var(--color-paper-2)); border-color: oklch(var(--color-border)); padding: 8px 4px; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
        .rbc-month-view, .rbc-day-bg, .rbc-month-row { border-color: oklch(var(--color-border)) !important; }
        .rbc-off-range-bg { background: oklch(var(--color-paper-2)); }
        .rbc-today { background: oklch(var(--color-accent-muted) / 0.3); }
        .rbc-toolbar button { color: oklch(var(--color-ink-2)); border-color: oklch(var(--color-border)); background: oklch(var(--color-paper)); }
        .rbc-toolbar button:hover { background: oklch(var(--color-paper-2)); }
        .rbc-toolbar button.rbc-active { background: oklch(var(--color-accent)); color: white; border-color: oklch(var(--color-accent)); }
        .rbc-event { border-radius: 4px; font-size: 0.75rem; padding: 1px 4px; border: none !important; }
        .rbc-event:focus { outline: 2px solid oklch(var(--color-focus)); outline-offset: 1px; }
        .rbc-date-cell { padding: 4px 6px; }
        .rbc-show-more { color: oklch(var(--color-accent)); font-size: 0.7rem; }
      `}</style>
      <Calendar<CalendarEvent>
        localizer={localizer}
        events={events}
        defaultView="month"
        views={["month", "week"]}
        style={{ height: "calc(100vh - 160px)", minHeight: 500 }}
        eventPropGetter={(event) => ({
          style: {
            backgroundColor: PRIORITY_COLORS[event.priority] ?? PRIORITY_COLORS.NONE,
            cursor: "pointer",
          },
        })}
        onSelectEvent={(event) => onCardClick(event.cardId)}
        tooltipAccessor={(event) => `${event.listTitle} · ${event.title}`}
        popup
      />
    </div>
  )
}
