import { useEffect, useState, useCallback } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import { cardsApi, type UpcomingCard } from "../api/cards"

// ── Icons ──────────────────────────────────────────────────────────────────────

const CHEVRON_LEFT = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const CHEVRON_RIGHT = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const FLAG_ICON = (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M2 1.5v9M2 1.5l6 2-6 2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// ── Helpers ────────────────────────────────────────────────────────────────────

function dueDateLabel(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((date.getTime() - now.setHours(0, 0, 0, 0)) / 86400000)
  if (diffDays === 0) return "TODAY"
  if (diffDays === 1) return "TOMORROW"
  if (diffDays < 7) return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function dueDateColor(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((date.getTime() - now.setHours(0, 0, 0, 0)) / 86400000)
  if (diffDays <= 0) return "oklch(var(--color-error))"
  if (diffDays === 1) return "oklch(var(--color-warning, 0.75 0.15 80))"
  if (diffDays <= 3) return "oklch(0.72 0.15 80)"
  return "oklch(var(--color-accent))"
}

function groupDeadlines(cards: UpcomingCard[]): { label: string; color: string; items: UpcomingCard[] }[] {
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const today: UpcomingCard[] = []
  const tomorrow: UpcomingCard[] = []
  const thisWeek: UpcomingCard[] = []
  const later: UpcomingCard[] = []

  for (const card of cards) {
    const date = new Date(card.dueDate)
    const diffDays = Math.floor((date.getTime() - now.getTime()) / 86400000)
    if (diffDays === 0) { today.push(card); continue }
    if (diffDays === 1) { tomorrow.push(card); continue }
    if (diffDays <= 7) { thisWeek.push(card); continue }
    later.push(card)
  }

  const groups = []
  if (today.length > 0) groups.push({ label: "Due Today", color: "oklch(var(--color-error))", items: today })
  if (tomorrow.length > 0) groups.push({ label: "Due Tomorrow", color: "oklch(0.72 0.15 80)", items: tomorrow })
  if (thisWeek.length > 0) groups.push({ label: "This Week", color: "oklch(var(--color-accent))", items: thisWeek })
  if (later.length > 0) groups.push({ label: "Upcoming Deadlines", color: "oklch(var(--color-ink-3))", items: later })
  return groups
}

// ── Page ───────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

export default function AllDeadlinesPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()

  const [cards, setCards] = useState<UpcomingCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [page, setPage] = useState(0)

  const fetchCards = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    setError("")
    try {
      const result = await cardsApi.upcoming(workspaceId, 365)
      setCards(result)
    } catch (err) {
      setError((err as Error).message || "Failed to load deadlines")
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { void fetchCards() }, [fetchCards])

  const totalPages = Math.max(1, Math.ceil(cards.length / PAGE_SIZE))
  const pageCards = cards.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const groups = groupDeadlines(pageCards)

  return (
    <div style={{ padding: "32px 36px", color: "oklch(var(--color-ink))", fontFamily: "var(--font-body)", maxWidth: "800px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "28px" }}>
        <Link
          to={`/${workspaceId}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "7px 12px",
            borderRadius: "var(--radius-button)",
            border: "1px solid oklch(var(--color-border))",
            background: "oklch(var(--color-paper-2))",
            color: "oklch(var(--color-ink-2))",
            fontSize: "var(--text-sm)",
            fontWeight: 500,
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          {CHEVRON_LEFT} Back
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: "oklch(var(--color-accent))", display: "flex" }}>{FLAG_ICON}</span>
          <h1 style={{ margin: 0, fontSize: "var(--text-xl)", fontWeight: 700, fontFamily: "var(--font-display)" }}>
            All Deadlines
          </h1>
        </div>
        {!loading && cards.length > 0 && (
          <span
            style={{
              fontSize: "var(--text-xs)",
              color: "oklch(var(--color-ink-3))",
              padding: "3px 10px",
              borderRadius: "100px",
              background: "oklch(var(--color-paper-3))",
              fontWeight: 500,
            }}
          >
            {cards.length} {cards.length === 1 ? "card" : "cards"}
          </span>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              style={{
                height: "52px",
                borderRadius: "var(--radius-card)",
                background: "oklch(var(--color-paper-2))",
                opacity: 0.4 + i * 0.05,
                animation: "pulse 1.8s ease-in-out infinite",
              }}
            />
          ))}
        </div>
      ) : error ? (
        <p style={{ color: "oklch(var(--color-error))", fontSize: "var(--text-sm)" }}>{error}</p>
      ) : cards.length === 0 ? (
        <div
          style={{
            border: "1px dashed oklch(var(--color-border))",
            borderRadius: "var(--radius-card)",
            padding: "56px 24px",
            textAlign: "center",
            color: "oklch(var(--color-ink-3))",
          }}
        >
          <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600, color: "oklch(var(--color-ink-2))" }}>
            No upcoming deadlines
          </p>
          <p style={{ margin: "6px 0 0", fontSize: "var(--text-xs)", lineHeight: 1.6 }}>
            Set due dates on cards to track them here.
          </p>
        </div>
      ) : (
        <div
          style={{
            border: "1px solid oklch(var(--color-border))",
            borderRadius: "var(--radius-card)",
            background: "oklch(var(--color-paper))",
            overflow: "hidden",
          }}
        >
          {groups.map((group, gi) => (
            <div key={group.label}>
              {/* Group header */}
              <div
                style={{
                  padding: "8px 18px",
                  background: "oklch(var(--color-paper-2))",
                  borderBottom: "1px solid oklch(var(--color-border))",
                  borderTop: gi > 0 ? "1px solid oklch(var(--color-border))" : "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: group.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    color: "oklch(var(--color-ink-3))",
                  }}
                >
                  {group.label}
                </span>
                <span
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "oklch(var(--color-ink-3))",
                    fontWeight: 500,
                    marginLeft: "auto",
                  }}
                >
                  {group.items.length} {group.items.length === 1 ? "card" : "cards"}
                </span>
              </div>

              {group.items.map((card, idx) => {
                const label = dueDateLabel(card.dueDate)
                const color = dueDateColor(card.dueDate)
                return (
                  <button
                    key={card.id}
                    onClick={() => navigate(`/${workspaceId}/${card.boardId}`)}
                    style={{
                      all: "unset",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "12px 18px",
                      width: "100%",
                      boxSizing: "border-box",
                      borderBottom:
                        idx < group.items.length - 1
                          ? "1px solid oklch(var(--color-border) / 0.5)"
                          : "none",
                      cursor: "pointer",
                      transition: "background var(--dur-fast)",
                    }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = "oklch(var(--color-paper-2))"
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = "transparent"
                    }}
                  >
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: color,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: "var(--text-sm)",
                          color: "oklch(var(--color-ink))",
                          fontWeight: 500,
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {card.title}
                      </span>
                      {card.boardName && (
                        <span
                          style={{
                            fontSize: "var(--text-xs)",
                            color: "oklch(var(--color-ink-3))",
                            display: "block",
                            marginTop: "1px",
                          }}
                        >
                          {card.boardName}
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: "0.625rem",
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        color,
                        flexShrink: 0,
                        padding: "2px 7px",
                        borderRadius: "var(--radius-badge)",
                        background: `${color.replace(")", " / 0.12)")}`,
                      }}
                    >
                      {label}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* Pagination — only when more than one page */}
      {!loading && !error && totalPages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "24px",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))", fontWeight: 500 }}>
            Showing {pageCards.length} of {cards.length} {cards.length === 1 ? "deadline" : "deadlines"}
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "7px 16px",
                borderRadius: "var(--radius-button)",
                border: "1px solid oklch(var(--color-border))",
                background: page === 0 ? "transparent" : "oklch(var(--color-paper-2))",
                color: page === 0 ? "oklch(var(--color-ink-3))" : "oklch(var(--color-ink-2))",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                cursor: page === 0 ? "not-allowed" : "pointer",
                opacity: page === 0 ? 0.4 : 1,
                fontFamily: "var(--font-body)",
              }}
            >
              {CHEVRON_LEFT} Previous
            </button>

            <span
              style={{
                fontSize: "var(--text-sm)",
                color: "oklch(var(--color-ink-2))",
                fontWeight: 500,
                minWidth: "90px",
                textAlign: "center",
              }}
            >
              Page {page + 1} of {totalPages}
            </span>

            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "7px 16px",
                borderRadius: "var(--radius-button)",
                border: "1px solid oklch(var(--color-border))",
                background: page >= totalPages - 1 ? "transparent" : "oklch(var(--color-paper-2))",
                color: page >= totalPages - 1 ? "oklch(var(--color-ink-3))" : "oklch(var(--color-ink-2))",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                cursor: page >= totalPages - 1 ? "not-allowed" : "pointer",
                opacity: page >= totalPages - 1 ? 0.4 : 1,
                fontFamily: "var(--font-body)",
              }}
            >
              Next {CHEVRON_RIGHT}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
