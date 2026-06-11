import React, { useEffect, useState, useCallback, useRef } from "react"
import { Calendar, dateFnsLocalizer, type Event as RBCEvent, type ToolbarProps } from "react-big-calendar"
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

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]

const btnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  padding: "6px 14px", borderRadius: 8, fontSize: "0.8125rem", fontWeight: 600,
  fontFamily: "inherit", border: "1px solid oklch(var(--color-border))",
  color: "oklch(var(--color-ink-2))", background: "oklch(var(--color-paper))",
  cursor: "pointer", lineHeight: 1,
}

const selectStyle: React.CSSProperties = {
  padding: "6px 10px", borderRadius: 8, fontSize: "0.8125rem", fontWeight: 600,
  fontFamily: "inherit", border: "1px solid oklch(var(--color-border))",
  color: "oklch(var(--color-ink-2))", background: "oklch(var(--color-paper))",
  cursor: "pointer", outline: "none", appearance: "none", WebkitAppearance: "none",
  paddingRight: 28,
}

function useToolbarWidth() {
  const [isCompact, setIsCompact] = useState(() => window.innerWidth < 640)
  const rafRef = useRef<number | null>(null)
  useEffect(() => {
    const handler = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => setIsCompact(window.innerWidth < 640))
    }
    window.addEventListener("resize", handler)
    return () => {
      window.removeEventListener("resize", handler)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])
  return isCompact
}

function CustomToolbar({ label, onNavigate, date }: ToolbarProps<CalendarEvent>) {
  const month = date.getMonth()
  const year = date.getFullYear()
  const years = Array.from({ length: 10 }, (_, i) => year - 3 + i)
  const isCompact = useToolbarWidth()

  const compactBtnStyle: React.CSSProperties = {
    ...btnStyle,
    padding: "5px 9px",
    fontSize: "0.75rem",
  }
  const compactSelectStyle: React.CSSProperties = {
    ...selectStyle,
    padding: "5px 8px",
    fontSize: "0.75rem",
    paddingRight: 24,
  }

  return (
    <div style={{ display: "flex", alignItems: "center", paddingBottom: 12, gap: isCompact ? 6 : 12 }}>
      {/* Left: Today + arrows */}
      <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
        <button
          style={isCompact ? compactBtnStyle : btnStyle}
          onClick={() => onNavigate("TODAY")}
        >
          Today
        </button>
        <button
          style={{ ...(isCompact ? compactBtnStyle : btnStyle), padding: isCompact ? "5px 8px" : "6px 10px", fontSize: "1rem" }}
          onClick={() => onNavigate("PREV")}
        >
          ‹
        </button>
        <button
          style={{ ...(isCompact ? compactBtnStyle : btnStyle), padding: isCompact ? "5px 8px" : "6px 10px", fontSize: "1rem" }}
          onClick={() => onNavigate("NEXT")}
        >
          ›
        </button>
      </div>

      {/* Center: label — hidden on compact (dropdowns already show month/year) */}
      {!isCompact ? (
        <span style={{ flex: 1, textAlign: "center", fontSize: "1.25rem", fontWeight: 700, color: "oklch(var(--color-ink))", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {label}
        </span>
      ) : (
        <span style={{ flex: 1 }} />
      )}

      {/* Right: month + year dropdowns */}
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
          <select
            value={month}
            style={isCompact ? compactSelectStyle : selectStyle}
            onChange={(e) => onNavigate("DATE", new Date(year, parseInt(e.target.value), 1))}
          >
            {MONTHS.map((m, i) => (
              <option key={i} value={i}>{isCompact ? m.slice(0, 3) : m}</option>
            ))}
          </select>
          <span style={{ position: "absolute", right: isCompact ? 6 : 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 10, color: "oklch(var(--color-ink-3))" }}>▾</span>
        </div>
        <div style={{ position: "relative" }}>
          <select
            value={year}
            style={isCompact ? compactSelectStyle : selectStyle}
            onChange={(e) => onNavigate("DATE", new Date(parseInt(e.target.value), month, 1))}
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <span style={{ position: "absolute", right: isCompact ? 6 : 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 10, color: "oklch(var(--color-ink-3))" }}>▾</span>
        </div>
      </div>
    </div>
  )
}

function CustomDateHeader({ date, label }: { date: Date; label: string; isOffRange: boolean }) {
  const isToday = date.toDateString() === new Date().toDateString()

  return (
    <div style={{ display: "flex", justifyContent: "flex-end", padding: "3px 3px 3px 2px" }}>
      {isToday ? (
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 24, height: 24, borderRadius: "50%",
          background: "#f97316", color: "#fff", fontWeight: 700, fontSize: "0.8125rem",
          lineHeight: 1,
        }}>
          {label}
        </span>
      ) : (
        <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "oklch(var(--color-ink-2))", lineHeight: "24px" }}>
          {label}
        </span>
      )}
    </div>
  )
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
    <div style={{ height: "100%", padding: "12px 8px 8px", overflowY: "auto", overflowX: "hidden", boxSizing: "border-box" }}>
      <style>{`
        /* ── Base ── */
        .rbc-calendar { font-family: inherit; color: oklch(var(--color-ink)); background: oklch(var(--color-paper)); }

        /* ── Toolbar ── */
        .rbc-toolbar { padding: 0 0 16px; gap: 12px; align-items: center; }
        .rbc-toolbar-label { font-size: 1.25rem; font-weight: 700; color: oklch(var(--color-ink)); text-align: center; }
        .rbc-btn-group { display: flex; gap: 4px; }
        .rbc-btn-group button {
          padding: 6px 14px; border-radius: 8px; font-size: 0.8125rem; font-weight: 600;
          font-family: inherit; border: 1px solid oklch(var(--color-border));
          color: oklch(var(--color-ink-2)); background: oklch(var(--color-paper));
          cursor: pointer; transition: background 0.15s, color 0.15s;
        }
        .rbc-btn-group button:hover { background: oklch(var(--color-paper-2)); }
        .rbc-btn-group button.rbc-active {
          background: oklch(var(--color-accent)); color: #fff;
          border-color: oklch(var(--color-accent));
        }
        .rbc-btn-group button.rbc-active:hover { background: oklch(var(--color-accent-hover)); }

        /* ── Header row (day names) ── */
        .rbc-header {
          padding: 10px 4px; font-size: 0.6875rem; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.06em;
          color: oklch(var(--color-ink-3)); background: oklch(var(--color-paper));
          border-color: oklch(var(--color-border)) !important;
        }

        /* ── Month grid ── */
        .rbc-month-view { border-color: oklch(var(--color-border)) !important; border-radius: 10px; overflow: hidden; }
        .rbc-month-row { border-color: oklch(var(--color-border)) !important; }
        .rbc-day-bg { border-color: oklch(var(--color-border)) !important; }
        .rbc-off-range-bg { background: oklch(var(--color-paper-2)) !important; }
        .rbc-today { background: oklch(var(--color-accent) / 0.06) !important; }

        /* ── Date numbers ── */
        .rbc-date-cell { padding: 6px 8px; text-align: right; }
        .rbc-date-cell > a, .rbc-date-cell > button {
          font-size: 0.8125rem; font-weight: 500; color: oklch(var(--color-ink-2));
          text-decoration: none; display: inline-block;
        }
        .rbc-off-range .rbc-date-cell > a,
        .rbc-off-range .rbc-date-cell > button { color: oklch(var(--color-ink-3) / 0.5); }

        /* ── Events (pill shaped) ── */
        .rbc-event {
          border-radius: 20px !important; padding: 3px 10px !important;
          font-size: 0.75rem !important; font-weight: 600 !important;
          border: none !important; box-shadow: 0 1px 3px oklch(0% 0 0 / 0.15) !important;
          cursor: pointer !important;
        }
        .rbc-event:focus { outline: 2px solid oklch(var(--color-focus)); outline-offset: 1px; }
        .rbc-event-continues-after { border-top-right-radius: 0 !important; border-bottom-right-radius: 0 !important; }
        .rbc-event-continues-prior { border-top-left-radius: 0 !important; border-bottom-left-radius: 0 !important; }
        .rbc-event-label { display: none; }

        /* ── Row content ── */
        .rbc-row-content { z-index: 1; }
        .rbc-show-more { color: oklch(var(--color-accent)); font-size: 0.7rem; font-weight: 600; padding: 0 8px; }

        /* ── Week view ── */
        .rbc-time-view { border-color: oklch(var(--color-border)) !important; border-radius: 10px; overflow: hidden; }
        .rbc-time-header { border-color: oklch(var(--color-border)) !important; }
        .rbc-time-content { border-color: oklch(var(--color-border)) !important; }
        .rbc-timeslot-group { border-color: oklch(var(--color-border)) !important; }
        .rbc-time-slot { border-color: oklch(var(--color-border) / 0.4) !important; }
        .rbc-current-time-indicator { background: oklch(var(--color-accent)); }
        /* Hide time labels in week view */
        .rbc-time-gutter { display: none !important; }
        .rbc-time-header-gutter { display: none !important; }

        /* ── Mobile responsive ── */
        @media (max-width: 639px) {
          .rbc-header { padding: 6px 2px; font-size: 0.5625rem; letter-spacing: 0.02em; }
          .rbc-date-cell { padding: 3px 4px; }
          .rbc-date-cell > a, .rbc-date-cell > button { font-size: 0.6875rem; }
          .rbc-event { padding: 2px 5px !important; font-size: 0.6875rem !important; border-radius: 12px !important; }
          .rbc-show-more { font-size: 0.625rem; padding: 0 4px; }
          .rbc-month-view { border-radius: 8px; }
        }
      `}</style>
      <Calendar<CalendarEvent>
        localizer={localizer}
        events={events}
        defaultView="month"
        views={["month"]}
        style={{ height: "calc(100vh - 180px)", minHeight: 400 }}
        components={{ toolbar: CustomToolbar, month: { dateHeader: CustomDateHeader } }}
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
