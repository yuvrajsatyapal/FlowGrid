import { useState, useEffect, useCallback } from "react"
import type { ActivityResponse } from "@flowgrid/types"
import { activitiesApi } from "../../api/activities"
import { getInitials, getAvatarBg } from "../../utils/avatar"

interface Props {
  cardId: string
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

type Metadata = Record<string, unknown>

const ACTION_LABELS: Record<string, (m: Metadata) => string> = {
  card_created: () => "created this card",
  title_changed: (m) => `changed title from "${m.from}" to "${m.to}"`,
  priority_changed: (m) => `changed priority from ${String(m.from).toLowerCase()} to ${String(m.to).toLowerCase()}`,
  due_date_changed: (m) => {
    if (!m.from && m.to) return `set due date to ${new Date(m.to as string).toLocaleDateString()}`
    if (m.from && !m.to) return "removed due date"
    return `changed due date to ${new Date(m.to as string).toLocaleDateString()}`
  },
  assignee_changed: (m) => (m.to ? "assigned this card" : "removed assignee"),
  label_added: (m) => `added label "${m.labelName}"`,
  label_removed: (m) => `removed label "${m.labelName}"`,
  card_moved: () => "moved this card to another list",
  card_archived: () => "archived this card",
  card_unarchived: () => "restored this card",
  comment_added: () => "posted a comment",
  comment_edited: () => "edited a comment",
  comment_deleted: () => "deleted a comment",
}

function describeAction(action: string, metadata: Metadata): string {
  const fn = ACTION_LABELS[action]
  if (fn) {
    try {
      return fn(metadata)
    } catch {
      // Fallback if metadata shape is unexpected
    }
  }
  return action.replace(/_/g, " ")
}

export function ActivityFeed({ cardId }: Props) {
  const [activities, setActivities] = useState<ActivityResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const page = await activitiesApi.list(cardId, 0, 5)
      setActivities(page.items)
    } catch (err) {
      setLoadError((err as Error).message || "Failed to load activity.")
    } finally {
      setLoading(false)
    }
  }, [cardId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return null

  if (loadError) {
    return (
      <div style={{ fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-3))", padding: "4px 0" }}>
        {loadError}
      </div>
    )
  }

  if (activities.length === 0) return null

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "oklch(var(--color-ink-3))", letterSpacing: "0.04em", textTransform: "uppercase" }}>
        Activity
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {activities.map((activity) => {
          const userId = activity.user?.id ?? "deleted"
          const userName = activity.user?.name ?? "Deleted User"

          return (
            <div key={activity.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              {activity.user?.avatarUrl ? (
                <img
                  src={activity.user.avatarUrl}
                  alt={userName}
                  style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover", flexShrink: 0, marginTop: 1 }}
                />
              ) : (
                <div style={{
                  width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                  background: activity.user ? getAvatarBg(userId) : "oklch(var(--color-ink-4))",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 8, fontWeight: 700, color: "#fff",
                }}>
                  {activity.user ? getInitials(activity.user.name) : "?"}
                </div>
              )}

              <div style={{ flex: 1, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-2))", lineHeight: 1.5 }}>
                <span style={{ fontWeight: 600, color: "oklch(var(--color-ink))" }}>{userName}</span>
                {" "}
                {describeAction(activity.action, activity.metadata)}
                <span style={{ color: "oklch(var(--color-ink-3))", marginLeft: 6 }}>
                  {formatRelativeTime(activity.createdAt)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
