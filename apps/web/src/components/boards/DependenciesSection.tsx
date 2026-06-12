import { useEffect, useState, useCallback, useRef } from "react"
import { cardDependenciesApi, type DependencyEntry, type BoardCard } from "../../api/cardDependencies"

interface Props {
  cardId: string
  boardId: string
  canEdit: boolean
  onChanged?: () => void
}

function dependencyIndicator(type: "blocking" | "blockedBy", completed?: boolean) {
  if (completed) return { icon: "✅", text: "Complete", color: "oklch(var(--color-success))", bg: "oklch(var(--color-success) / 0.10)" }
  if (type === "blockedBy") return { icon: "🔒", text: "Blocking This Card", color: "oklch(var(--color-error))", bg: "oklch(var(--color-error) / 0.10)" }
  return { icon: "⏳", text: "In Progress", color: "oklch(var(--color-ink-3))", bg: "oklch(var(--color-ink-3) / 0.10)" }
}

export default function DependenciesSection({ cardId, boardId, canEdit, onChanged }: Props) {
  const [blocking, setBlocking] = useState<DependencyEntry[]>([])
  const [blockedBy, setBlockedBy] = useState<DependencyEntry[]>([])
  const [boardCards, setBoardCards] = useState<BoardCard[]>([])
  const [pickerOpen, setPickerOpen] = useState<"blocking" | "blockedBy" | null>(null)
  const [search, setSearch] = useState("")
  const [depError, setDepError] = useState("")

  // Collapse state — default open; auto-collapsed for 3+ on first load only
  const [blockingOpen, setBlockingOpen] = useState(true)
  const [blockedByOpen, setBlockedByOpen] = useState(true)
  const initializedRef = useRef(false)

  const load = useCallback(async () => {
    try {
      const data = await cardDependenciesApi.get(cardId)
      setBlocking(data.blocking)
      setBlockedBy(data.blockedBy)
      // Auto-collapse sections with 3+ items — only on the very first load so
      // adding/removing cards doesn't reset a section the user manually opened.
      if (!initializedRef.current) {
        initializedRef.current = true
        setBlockingOpen(data.blocking.length < 3)
        setBlockedByOpen(data.blockedBy.length < 3)
      }
    } catch (err) {
      setDepError((err as Error).message || "Failed to load dependencies")
    }
  }, [cardId])

  useEffect(() => { void load() }, [load])

  async function openPicker(type: "blocking" | "blockedBy") {
    setDepError("")
    try {
      if (boardCards.length === 0) {
        const cards = await cardDependenciesApi.getBoardCards(boardId)
        setBoardCards(cards)
      }
      setPickerOpen(type)
      setSearch("")
    } catch (err) {
      setDepError((err as Error).message || "Failed to load board cards")
    }
  }

  async function handleAdd(targetCardId: string) {
    if (!pickerOpen) return
    setDepError("")
    try {
      if (pickerOpen === "blocking") {
        await cardDependenciesApi.add(cardId, targetCardId)
      } else {
        await cardDependenciesApi.add(targetCardId, cardId)
      }
      setPickerOpen(null)
      await load()
      onChanged?.()
    } catch (err) {
      setDepError((err as Error).message || "Failed to add dependency")
    }
  }

  async function handleRemove(depId: string) {
    setDepError("")
    try {
      await cardDependenciesApi.remove(depId)
      await load()
      onChanged?.()
    } catch (err) {
      setDepError((err as Error).message || "Failed to remove dependency")
    }
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

  // Card picker overlay — anchored above its trigger by the surrounding position:relative wrapper
  const picker = (
    <div
      style={{
        position: "absolute",
        bottom: "calc(100% + 4px)",
        left: 0,
        right: 0,
        zIndex: 30,
        border: "1px solid oklch(var(--color-border))",
        borderRadius: "var(--radius-card)",
        background: "oklch(var(--color-paper))",
        overflow: "hidden",
        boxShadow: "0 8px 24px oklch(0% 0 0 / 0.18)",
      }}
    >
      <div style={{ padding: "8px" }}>
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search cards…"
          style={{ width: "100%", padding: "6px 8px", borderRadius: "var(--radius-input)", border: "1px solid oklch(var(--color-border))", background: "oklch(var(--color-paper-2))", color: "oklch(var(--color-ink))", ...s, boxSizing: "border-box" }}
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
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "oklch(var(--color-paper-2))" }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none" }}
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
  )

  const renderDepList = ({ entries, label, addLabel, type, onAdd, onRemove, open, onToggle }: {
    entries: DependencyEntry[]
    label: string
    addLabel: string
    type: "blocking" | "blockedBy"
    onAdd: () => void
    onRemove: (depId: string) => void
    open: boolean
    onToggle: () => void
  }) => {
    const hasItems = entries.length > 0

    // Count pill: red for Blocked By (active danger), amber for Blocks
    const countPill = type === "blockedBy"
      ? { bg: "oklch(var(--color-error) / 0.12)", color: "oklch(var(--color-error))" }
      : { bg: "oklch(var(--color-warning) / 0.18)", color: "oklch(var(--color-warning))" }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>

        {/* Header row — also the anchor for the picker overlay */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 0 }}>
          {hasItems ? (
            /* Clickable toggle when there are items */
            <button
              onClick={onToggle}
              aria-expanded={open}
              style={{
                flex: 1,
                display: "flex", alignItems: "center",
                background: "oklch(var(--color-paper-2))",
                border: "1px solid oklch(var(--color-border))",
                borderRadius: "var(--radius-card)",
                padding: "6px 9px",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
                textAlign: "left",
                gap: 0,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "oklch(var(--color-ink-3))" }}>
                {label}
              </span>
              {/* Count pill */}
              <span
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  minWidth: 16, height: 16, padding: "0 5px",
                  borderRadius: 8,
                  background: countPill.bg,
                  fontSize: "0.55rem", fontWeight: 700, color: countPill.color,
                  marginLeft: 6, flexShrink: 0,
                }}
              >
                {entries.length}
              </span>
              <span style={{ flex: 1 }} />
              {/* Chevron */}
              <span
                aria-hidden
                style={{
                  fontSize: 9,
                  color: "oklch(var(--color-ink-3))",
                  transform: open ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 0.15s",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              >
                ▶
              </span>
            </button>
          ) : (
            /* Plain non-clickable label when empty */
            <span style={{ flex: 1, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "oklch(var(--color-ink-3))" }}>
              {label}
            </span>
          )}

          {/* + Add — always visible, outside the toggle so it never collapses the section */}
          {canEdit && (
            <button
              onClick={onAdd}
              style={{ ...s, background: "none", border: "none", cursor: "pointer", color: "oklch(var(--color-accent))", fontSize: 12, fontWeight: 600, padding: "0 0 0 8px", flexShrink: 0 }}
            >
              + Add
            </button>
          )}

          {/* Picker overlay anchored here */}
          {pickerOpen === type && picker}
        </div>

        {/* Empty state */}
        {!hasItems && (
          <span style={{ fontSize: 12, color: "oklch(var(--color-ink-3))", fontStyle: "italic" }}>{addLabel}</span>
        )}

        {/* Card list — only rendered when section is open */}
        {hasItems && open && entries.map((dep) => {
          const ind = dependencyIndicator(type, dep.card.completed)
          return (
            <div
              key={dep.depId}
              style={{
                display: "flex", flexDirection: "column", gap: 5,
                padding: "7px 9px",
                borderRadius: "var(--radius-card)",
                background: "oklch(var(--color-paper-2))",
                border: "1px solid oklch(var(--color-border))",
              }}
            >
              {/* Title row: title + × at top-right */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                <span style={{ ...s, color: "oklch(var(--color-ink))", fontWeight: 500, lineHeight: 1.35, flex: 1 }}>
                  {dep.card.title}
                </span>
                {canEdit && (
                  <button
                    onClick={() => onRemove(dep.depId)}
                    aria-label="Remove dependency"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "oklch(var(--color-ink-3))", fontSize: 14, padding: "0 2px", flexShrink: 0, lineHeight: 1, marginTop: 1 }}
                  >
                    ×
                  </button>
                )}
              </div>
              {/* Status badge on second line */}
              <span
                style={{
                  fontSize: "0.6rem", fontWeight: 700, color: ind.color,
                  padding: "2px 6px", borderRadius: "var(--radius-badge)", background: ind.bg,
                  whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 3,
                  alignSelf: "flex-start",
                }}
              >
                {ind.icon} {ind.text}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "oklch(var(--color-ink-3))" }}>
        Dependencies
      </span>
      {depError && (
        <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>{depError}</p>
      )}

      {renderDepList({
        entries: blocking,
        label: "Blocks",
        addLabel: "No blocked cards",
        type: "blocking",
        onAdd: () => void openPicker("blocking"),
        onRemove: (id) => void handleRemove(id),
        open: blockingOpen,
        onToggle: () => setBlockingOpen((v) => !v),
      })}
      {renderDepList({
        entries: blockedBy,
        label: "Blocked By",
        addLabel: "Not blocked by any card",
        type: "blockedBy",
        onAdd: () => void openPicker("blockedBy"),
        onRemove: (id) => void handleRemove(id),
        open: blockedByOpen,
        onToggle: () => setBlockedByOpen((v) => !v),
      })}
    </div>
  )
}
