import { useEffect, useState, useCallback } from "react"
import { cardWatchersApi, type Watcher } from "../../api/cardWatchers"

interface Props {
  cardId: string
  currentUserId: string
  assigneeId?: string | null
}

export default function WatchersSection({ cardId, currentUserId, assigneeId }: Props) {
  const [watchers, setWatchers] = useState<Watcher[]>([])
  const [isWatching, setIsWatching] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await cardWatchersApi.get(cardId)
      // Assignee always watches — create the row silently if it doesn't exist yet
      if (!data.isWatching && currentUserId === assigneeId) {
        await cardWatchersApi.watch(cardId)
        const fresh = await cardWatchersApi.get(cardId)
        setWatchers(fresh.watchers)
        setIsWatching(true)
      } else {
        setWatchers(data.watchers)
        setIsWatching(data.isWatching)
      }
    } catch { /* silent */ }
  }, [cardId, currentUserId, assigneeId])

  useEffect(() => { void load() }, [load])

  async function handleToggle() {
    setLoading(true)
    try {
      if (isWatching) {
        await cardWatchersApi.unwatch(cardId)
        setIsWatching(false)
        setWatchers((prev) => prev.filter((w) => w.id !== currentUserId))
      } else {
        await cardWatchersApi.watch(cardId)
        setIsWatching(true)
        void load()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "oklch(var(--color-ink-3))" }}>
          Watchers {watchers.length > 0 && `· ${watchers.length}`}
        </span>
        <button
          onClick={() => void handleToggle()}
          disabled={loading || currentUserId === assigneeId}
          title={currentUserId === assigneeId ? "Assignees watch automatically" : undefined}
          style={{
            fontSize: "var(--text-xs)",
            padding: "3px 10px",
            borderRadius: "var(--radius-badge)",
            border: "1px solid oklch(var(--color-border))",
            background: isWatching ? "oklch(var(--color-accent-muted))" : "oklch(var(--color-paper-2))",
            color: isWatching ? "oklch(var(--color-accent))" : "oklch(var(--color-ink-2))",
            cursor: (loading || currentUserId === assigneeId) ? "default" : "pointer",
            opacity: currentUserId === assigneeId ? 0.6 : 1,
            fontFamily: "var(--font-body)",
            fontWeight: 500,
          }}
        >
          {isWatching ? "Watching" : "Watch"}
        </button>
      </div>

      {watchers.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {watchers.map((w) => (
            <div
              key={w.id}
              title={w.name ?? "Unknown"}
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: "oklch(var(--color-accent-muted))",
                overflow: "hidden",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 600,
                color: "oklch(var(--color-accent))",
              }}
            >
              {w.avatarUrl ? (
                <img src={w.avatarUrl} alt={w.name ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                (w.name ?? "?").charAt(0).toUpperCase()
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
