import { useEffect, useState, useCallback } from "react"
import { useParams, Link } from "react-router-dom"
import { activitiesApi } from "../api/activities"
import type { ActivityResponse } from "@flowgrid/types"
import { getInitials, getAvatarBg } from "../utils/avatar"

// ── Icons ──────────────────────────────────────────────────────────────────────

const CHEVRON_LEFT = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const ACTIVITY_ICON = (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <polyline points="1,6 3,3 5,8 7,4 9,6 11,6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
)

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function dayLabel(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const dateStr = date.toDateString()
  if (dateStr === today.toDateString()) return "Today"
  if (dateStr === yesterday.toDateString()) return "Yesterday"
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
}

function groupByDay(activities: ActivityResponse[]): { label: string; items: ActivityResponse[] }[] {
  const groups: Map<string, ActivityResponse[]> = new Map()
  for (const act of activities) {
    const key = new Date(act.createdAt).toDateString()
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(act)
  }
  return Array.from(groups.entries()).map(([key, items]) => ({
    label: dayLabel(new Date(key).toISOString()),
    items,
  }))
}

function formatActivityText(activity: ActivityResponse): React.ReactNode {
  const name = activity.user?.name ?? "Someone"
  const meta = activity.metadata as Record<string, string>
  const actionMap: Record<string, string> = {
    card_created: "created card",
    card_updated: "updated",
    card_moved: "moved a card",
    card_deleted: "deleted a card",
    comment_added: "commented on",
    label_added: "added a label to",
    label_removed: "removed a label from",
    checklist_item_checked: "completed a checklist item in",
    attachment_added: "added an attachment to",
    assignee_changed: "changed assignee in",
    due_date_set: "set a due date on",
    due_date_changed: "changed due date on",
    title_changed: "renamed",
    priority_changed: "changed priority of",
    card_completed: "completed",
    card_reopened: "reopened",
  }
  const verb = actionMap[activity.action] ?? activity.action.replace(/_/g, " ")
  const cardName = activity.cardTitle ?? meta.cardTitle ?? meta.title ?? ""
  return (
    <>
      <strong>{name}</strong> {verb}{cardName ? <> <strong style={{ fontWeight: 600 }}>{cardName}</strong></> : ""}
    </>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AllActivityPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()

  const [activities, setActivities] = useState<ActivityResponse[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  const fetchPage = useCallback(async (pageIndex: number) => {
    if (!workspaceId) return
    setLoading(true)
    setError("")
    try {
      const result = await activitiesApi.listWorkspaceAll(workspaceId, 7, pageIndex * PAGE_SIZE, PAGE_SIZE)
      setActivities(result.items)
      setTotal(result.total)
    } catch (err) {
      setError((err as Error).message || "Failed to load activity")
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => { void fetchPage(page) }, [fetchPage, page])

  const groups = groupByDay(activities)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

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
          <span style={{ color: "oklch(var(--color-accent))", display: "flex", flexShrink: 0 }}>{ACTIVITY_ICON}</span>
          <h1 style={{ margin: 0, fontSize: "var(--text-xl)", fontWeight: 700, fontFamily: "var(--font-display)", whiteSpace: "nowrap" }}>
            All Activity
          </h1>
        </div>
        <span
          style={{
            fontSize: "var(--text-xs)",
            color: "oklch(var(--color-ink-3))",
            padding: "3px 10px",
            borderRadius: "100px",
            background: "oklch(var(--color-paper-3))",
            fontWeight: 500,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          Last 7 days
        </span>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              style={{
                height: "54px",
                borderRadius: "var(--radius-card)",
                background: "oklch(var(--color-paper-2))",
                opacity: 0.4 + i * 0.04,
                animation: "pulse 1.8s ease-in-out infinite",
              }}
            />
          ))}
        </div>
      ) : error ? (
        <p style={{ color: "oklch(var(--color-error))", fontSize: "var(--text-sm)" }}>{error}</p>
      ) : activities.length === 0 ? (
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
            No activity in the last 7 days
          </p>
          <p style={{ margin: "6px 0 0", fontSize: "var(--text-xs)", lineHeight: 1.6 }}>
            Start working on cards to see activity here.
          </p>
        </div>
      ) : (
        <>
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
                {/* Day separator */}
                <div
                  style={{
                    padding: "8px 18px",
                    background: "oklch(var(--color-paper-2))",
                    borderBottom: "1px solid oklch(var(--color-border))",
                    borderTop: gi > 0 ? "1px solid oklch(var(--color-border))" : "none",
                  }}
                >
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
                </div>

                {group.items.map((act, idx) => (
                  <div
                    key={act.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "12px",
                      padding: "12px 18px",
                      borderBottom:
                        idx < group.items.length - 1
                          ? "1px solid oklch(var(--color-border) / 0.5)"
                          : "none",
                    }}
                  >
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        flexShrink: 0,
                        background: act.user ? getAvatarBg(act.user.id) : "oklch(var(--color-paper-3))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        marginTop: "1px",
                      }}
                    >
                      {act.user?.avatarUrl ? (
                        <img src={act.user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <span style={{ fontSize: "10px", fontWeight: 700, color: "#fff" }}>
                          {getInitials(act.user?.name ?? "?")}
                        </span>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))", lineHeight: 1.5 }}>
                        {formatActivityText(act)}
                      </p>
                      <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))", marginTop: "2px", display: "block" }}>
                        {timeAgo(act.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Pagination — only when more than one page */}
          {totalPages > 1 && <div
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
              Showing {activities.length} of {total} {total === 1 ? "activity" : "activities"}
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
                Next
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>}
        </>
      )}
    </div>
  )
}
