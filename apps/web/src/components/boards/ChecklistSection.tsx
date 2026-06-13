import { useState } from "react"
import type { ChecklistItem } from "../../api/checklists"
import { useCardChecklists } from "../../features/card/queries/useCardChecklists"
import { useToggleChecklistItem } from "../../features/card/mutations/useToggleChecklistItem"
import { useDeleteChecklistItem } from "../../features/card/mutations/useDeleteChecklistItem"
import { useAddChecklistItem } from "../../features/card/mutations/useAddChecklistItem"

interface Props {
  cardId: string
  canEdit: boolean
  canToggle?: boolean
}

const CHECK_ICON = (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M2.5 6.2l2.2 2.2L9.5 3.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export default function ChecklistSection({ cardId, canEdit, canToggle = canEdit }: Props) {
  const [newItem, setNewItem] = useState("")

  const checklists = useCardChecklists(cardId).data ?? []
  const toggleItem = useToggleChecklistItem(cardId)
  const deleteItemMutation = useDeleteChecklistItem(cardId)
  const addItem = useAddChecklistItem(cardId)
  const adding = addItem.isPending

  // Flatten all items into a single checkable list (no checklist nesting shown to the user)
  const items: ChecklistItem[] = checklists.flatMap((cl) => cl.items)
  const total = items.length
  const done = items.filter((i) => i.checked).length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  // Optimistic: the cache flips/removes immediately and rolls back if the server rejects.
  function handleToggle(item: ChecklistItem) {
    toggleItem.mutate({ item })
  }

  function handleDelete(item: ChecklistItem) {
    deleteItemMutation.mutate({ item })
  }

  function handleAdd() {
    const text = newItem.trim()
    if (!text || adding) return
    addItem.mutate({ text }, { onSuccess: () => setNewItem("") })
  }

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: "7px 10px",
    borderRadius: "var(--radius-input)",
    border: "1px solid oklch(var(--color-border))",
    background: "oklch(var(--color-paper))",
    color: "oklch(var(--color-ink))",
    fontSize: "var(--text-sm)",
    fontFamily: "var(--font-body)",
    outline: "none",
    boxSizing: "border-box",
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Section header */}
      <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "oklch(var(--color-ink-3))" }}>
        Checklist{total > 0 && ` · ${done}/${total}`}
      </span>

      {/* Progress bar */}
      {total > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 999, background: "oklch(var(--color-paper-3))", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "oklch(var(--color-success))", borderRadius: 999, transition: "width 0.3s ease" }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "oklch(var(--color-ink-3))", minWidth: 34, textAlign: "right" }}>{pct}%</span>
        </div>
      )}

      {/* Flat checkable list */}
      {(total > 0 || canEdit) && (
        <div
          style={{
            border: "1px solid oklch(var(--color-border))",
            borderRadius: "var(--radius-card)",
            background: "oklch(var(--color-paper))",
            overflow: "hidden",
          }}
        >
          {items.map((item, idx) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 12px",
                borderBottom: idx === items.length - 1 ? "none" : "1px solid oklch(var(--color-border))",
              }}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={item.checked}
                aria-label={item.checked ? "Mark incomplete" : "Mark complete"}
                disabled={!canToggle}
                onClick={() => canToggle && void handleToggle(item)}
                style={{
                  width: 18,
                  height: 18,
                  flexShrink: 0,
                  borderRadius: 5,
                  border: item.checked ? "none" : "1.5px solid oklch(var(--color-border))",
                  background: item.checked ? "oklch(var(--color-accent))" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: canToggle ? "pointer" : "default",
                  padding: 0,
                  transition: "background 0.15s, border-color 0.15s",
                }}
              >
                {item.checked && CHECK_ICON}
              </button>
              <span style={{ flex: 1, fontSize: "var(--text-sm)", color: "oklch(var(--color-ink))", textDecoration: item.checked ? "line-through" : "none", opacity: item.checked ? 0.55 : 1 }}>
                {item.text}
              </span>
              {canEdit && (
                <button onClick={() => void handleDelete(item)} aria-label="Remove" style={{ background: "none", border: "none", cursor: "pointer", color: "oklch(var(--color-ink-3))", fontSize: 13, padding: "0 2px", lineHeight: 1 }}>×</button>
              )}
            </div>
          ))}

          {/* Add item */}
          {canEdit && (
            <div style={{ display: "flex", gap: 6, padding: "10px 12px", borderTop: items.length > 0 ? "1px solid oklch(var(--color-border))" : "none" }}>
              <input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleAdd() }}
                placeholder="Add an item…"
                style={inputStyle}
              />
              <button
                onClick={() => void handleAdd()}
                disabled={adding || !newItem.trim()}
                style={{ padding: "7px 16px", borderRadius: "var(--radius-button)", background: "oklch(var(--color-accent))", border: "none", color: "#fff", cursor: adding || !newItem.trim() ? "default" : "pointer", fontSize: "var(--text-sm)", fontWeight: 600, opacity: adding || !newItem.trim() ? 0.55 : 1 }}
              >
                Add
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
