import { useEffect, useState, useCallback, useMemo } from "react"
import { boardsApi, type CalendarCard } from "../../api/boards"

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: "oklch(55% 0.25 25)",
  HIGH: "oklch(62% 0.22 40)",
  MEDIUM: "oklch(72% 0.18 70)",
  LOW: "oklch(55% 0.18 155)",
  NONE: "oklch(62% 0.010 250)",
}

interface Props {
  boardId: string
  onCardClick: (cardId: string) => void
}

function addDays(date: Date, n: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

function formatDay(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export default function BoardTimelineView({ boardId, onCardClick }: Props) {
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
      setError("Failed to load timeline data.")
    } finally {
      setLoading(false)
    }
  }, [boardId])

  useEffect(() => {
    void load()
  }, [load])

  // Only cards with a dueDate appear on the timeline
  const cardsWithDates = useMemo(
    () => cards.filter((c) => c.dueDate !== null),
    [cards],
  )

  const { rangeStart, rangeEnd, totalDays } = useMemo(() => {
    if (cardsWithDates.length === 0) {
      const today = new Date()
      return { rangeStart: today, rangeEnd: addDays(today, 30), totalDays: 30 }
    }
    const allDates = cardsWithDates.flatMap((c) => {
      const dates: Date[] = [new Date(c.dueDate!)]
      if (c.startDate) dates.push(new Date(c.startDate))
      return dates
    })
    const minDate = new Date(Math.min(...allDates.map((d) => d.getTime())))
    const maxDate = new Date(Math.max(...allDates.map((d) => d.getTime())))
    const start = addDays(minDate, -2)
    const end = addDays(maxDate, 2)
    return { rangeStart: start, rangeEnd: end, totalDays: Math.max(daysBetween(start, end), 14) }
  }, [cardsWithDates])

  // Build tick marks — one per day if ≤30d, every 7d otherwise
  const ticks = useMemo(() => {
    const step = totalDays > 30 ? 7 : 1
    const result: Date[] = []
    let d = new Date(rangeStart)
    while (d <= rangeEnd) {
      result.push(new Date(d))
      d = addDays(d, step)
    }
    return result
  }, [rangeStart, rangeEnd, totalDays])

  function pct(date: Date) {
    const offset = daysBetween(rangeStart, date)
    return Math.max(0, Math.min(100, (offset / totalDays) * 100))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-24 text-[oklch(var(--color-ink-3))]">
        Loading timeline…
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

  if (cardsWithDates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-24 gap-2 text-center">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-[oklch(var(--color-ink-3))]">
          <path d="M8 24h32M8 16h20M8 32h24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="38" cy="24" r="4" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="2" />
        </svg>
        <p className="text-[oklch(var(--color-ink-2))] font-medium">No cards with due dates</p>
        <p className="text-sm text-[oklch(var(--color-ink-3))]">Set a due date on a card to see it on the timeline.</p>
      </div>
    )
  }

  const ROW_H = 40
  const LABEL_W = 200

  return (
    <div className="p-4 overflow-auto h-full">
      <div className="min-w-[600px]">
        {/* Header ruler */}
        <div className="flex" style={{ paddingLeft: LABEL_W }}>
          <div className="relative flex-1 h-8 border-b border-[oklch(var(--color-border))]">
            {ticks.map((d, i) => (
              <span
                key={i}
                className="absolute top-0 text-[10px] text-[oklch(var(--color-ink-3))] select-none"
                style={{ left: `${pct(d)}%`, transform: "translateX(-50%)" }}
              >
                {formatDay(d)}
              </span>
            ))}
          </div>
        </div>

        {/* Rows */}
        {cardsWithDates.map((card) => {
          const due = new Date(card.dueDate!)
          const start = card.startDate ? new Date(card.startDate) : due
          const startPct = pct(start)
          const duePct = pct(due)
          const widthPct = Math.max(duePct - startPct, 1)

          return (
            <div
              key={card.id}
              className="flex items-center border-b border-[oklch(var(--color-border)/0.5)] group"
              style={{ height: ROW_H }}
            >
              {/* Label */}
              <div
                className="shrink-0 px-2 text-xs text-[oklch(var(--color-ink-2))] truncate cursor-pointer hover:text-[oklch(var(--color-ink))]"
                style={{ width: LABEL_W }}
                onClick={() => onCardClick(card.id)}
                title={card.title}
              >
                <span className="text-[oklch(var(--color-ink-3))] mr-1">{card.listTitle} ·</span>
                {card.title}
              </div>

              {/* Bar area */}
              <div className="relative flex-1 h-full">
                {/* Today line */}
                {(() => {
                  const todayPct = pct(new Date())
                  if (todayPct < 0 || todayPct > 100) return null
                  return (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-[oklch(var(--color-accent)/0.6)] pointer-events-none"
                      style={{ left: `${todayPct}%` }}
                    />
                  )
                })()}

                {/* Gantt bar */}
                <button
                  onClick={() => onCardClick(card.id)}
                  className="absolute top-1/2 -translate-y-1/2 h-5 rounded cursor-pointer opacity-90 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-[oklch(var(--color-focus))] transition-opacity"
                  style={{
                    left: `${startPct}%`,
                    width: `${widthPct}%`,
                    minWidth: 8,
                    backgroundColor: PRIORITY_COLORS[card.priority] ?? PRIORITY_COLORS.NONE,
                  }}
                  title={`${card.title}\n${formatDay(start)} → ${formatDay(due)}`}
                >
                  <span className="px-1.5 text-[10px] text-white font-medium truncate block leading-5">
                    {card.title}
                  </span>
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
