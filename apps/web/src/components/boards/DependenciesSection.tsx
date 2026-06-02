import { useEffect, useState, useCallback } from "react"
import { cardDependenciesApi, type DependencyEntry, type BoardCard } from "../../api/cardDependencies"

interface Props {
  cardId: string
  boardId: string
  canEdit: boolean
}

export default function DependenciesSection({ cardId, boardId, canEdit }: Props) {
  const [blocking, setBlocking] = useState<DependencyEntry[]>([])
  const [blockedBy, setBlockedBy] = useState<DependencyEntry[]>([])
  const [boardCards, setBoardCards] = useState<BoardCard[]>([])
  const [pickerOpen, setPickerOpen] = useState<"blocking" | "blockedBy" | null>(null)
  const [search, setSearch] = useState("")

  const load = useCallback(async () => {
    try {
      const data = await cardDependenciesApi.get(cardId)
      setBlocking(data.blocking)
      setBlockedBy(data.blockedBy)
    } catch { /* silent */ }
  }, [cardId])

  useEffect(() => { void load() }, [load])

  async function openPicker(type: "blocking" | "blockedBy") {
    if (boardCards.length === 0) {
      const cards = await cardDependenciesApi.getBoardCards(boardId)
      setBoardCards(cards)
    }
    setPickerOpen(type)
    setSearch("")
  }

  async function handleAdd(targetCardId: string) {
    if (!pickerOpen) return
    if (pickerOpen === "blocking") {
      await cardDependenciesApi.add(cardId, targetCardId)
    } else {
      await cardDependenciesApi.add(targetCardId, cardId)
    }
    setPickerOpen(null)
    void load()
  }

  async function handleRemove(depId: string) {
    await cardDependenciesApi.remove(depId)
    void load()
  }

  const existingIds = new Set([
    cardId,
    ...blocking.map((d) => d.card.id),
    ...blockedBy.map((d) => d.card.id),
  ])
  const filtered = boardCards.filter(
    (c) => !existingIds.has(c.id) && c.title.toLowerCase().includes(search.toLowerCase()),
  )

  const s: React.CSSProperties = { fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }

  const DepList = ({ entries, label, addLabel, onAdd, onRemove }: {
    entries: DependencyEntry[]
    label: string
    addLabel: string
    onAdd: () => void
    onRemove: (depId: string) => void
  }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "oklch(var(--color-ink-3))" }}>{label}</span>
        {canEdit && (
          <button onClick={onAdd} style={{ ...s, background: "none", border: "none", cursor: "pointer", color: "oklch(var(--color-accent))", fontSize: 12, padding: 0 }}>+ Add</button>
        )}
      </div>
      {entries.length === 0 && (
        <span style={{ fontSize: 12, color: "oklch(var(--color-ink-3))", fontStyle: "italic" }}>{addLabel}</span>
      )}
      {entries.map((dep) => (
        <div key={dep.depId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 8px", borderRadius: "var(--radius-badge)", background: "oklch(var(--color-paper-2))", gap: 8 }}>
          <span style={{ ...s, color: "oklch(var(--color-ink))", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dep.card.title}</span>
          {canEdit && (
            <button onClick={() => onRemove(dep.depId)} style={{ background: "none", border: "none", cursor: "pointer", color: "oklch(var(--color-ink-3))", fontSize: 14, padding: "0 2px", flexShrink: 0 }}>×</button>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "oklch(var(--color-ink-3))" }}>Dependencies</span>

      <DepList
        entries={blocking}
        label="Blocks"
        addLabel="No blocked cards"
        onAdd={() => void openPicker("blocking")}
        onRemove={(id) => void handleRemove(id)}
      />
      <DepList
        entries={blockedBy}
        label="Blocked by"
        addLabel="Not blocked by any card"
        onAdd={() => void openPicker("blockedBy")}
        onRemove={(id) => void handleRemove(id)}
      />

      {/* Card picker dropdown */}
      {pickerOpen && (
        <div style={{ border: "1px solid oklch(var(--color-border))", borderRadius: "var(--radius-card)", background: "oklch(var(--color-paper))", overflow: "hidden", boxShadow: "0 4px 12px oklch(0% 0 0 / 0.1)" }}>
          <div style={{ padding: "8px" }}>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search cards…"
              style={{ width: "100%", padding: "5px 8px", borderRadius: "var(--radius-input)", border: "1px solid oklch(var(--color-border))", background: "oklch(var(--color-paper-2))", ...s, boxSizing: "border-box" }}
            />
          </div>
          <div style={{ maxHeight: 180, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "8px 12px", ...s, color: "oklch(var(--color-ink-3))", fontStyle: "italic" }}>No cards found</div>
            ) : filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => void handleAdd(c.id)}
                style={{ width: "100%", textAlign: "left", padding: "6px 12px", background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", gap: 1 }}
              >
                <span style={{ ...s, color: "oklch(var(--color-ink))" }}>{c.title}</span>
                <span style={{ fontSize: 11, color: "oklch(var(--color-ink-3))" }}>{c.listName}</span>
              </button>
            ))}
          </div>
          <div style={{ padding: "6px 8px", borderTop: "1px solid oklch(var(--color-border))" }}>
            <button onClick={() => setPickerOpen(null)} style={{ ...s, background: "none", border: "none", cursor: "pointer", color: "oklch(var(--color-ink-3))" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
