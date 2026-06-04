import { useEffect, useState, useCallback } from "react"
import { checklistsApi, type Checklist } from "../../api/checklists"

interface Props {
  cardId: string
  canEdit: boolean
}

const CHECK_ICON = (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M2.5 6.2l2.2 2.2L9.5 3.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export default function ChecklistSection({ cardId, canEdit }: Props) {
  const [checklists, setChecklists] = useState<Checklist[]>([])
  const [newTitle, setNewTitle] = useState("")
  const [addingNew, setAddingNew] = useState(false)
  const [newItemText, setNewItemText] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      const data = await checklistsApi.list(cardId)
      setChecklists(data)
    } catch { /* silent */ }
  }, [cardId])

  useEffect(() => { void load() }, [load])

  const totalItems = checklists.reduce((s, cl) => s + cl.items.length, 0)
  const checkedItems = checklists.reduce((s, cl) => s + cl.items.filter((i) => i.checked).length, 0)
  const pct = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0

  async function handleCreateChecklist() {
    if (!newTitle.trim()) return
    const cl = await checklistsApi.create(cardId, newTitle.trim())
    setChecklists((prev) => [...prev, cl])
    setNewTitle("")
    setAddingNew(false)
  }

  async function handleDeleteChecklist(id: string) {
    await checklistsApi.deleteChecklist(id)
    setChecklists((prev) => prev.filter((cl) => cl.id !== id))
  }

  async function handleToggleItem(checklistId: string, itemId: string, checked: boolean) {
    const item = await checklistsApi.updateItem(itemId, { checked })
    setChecklists((prev) =>
      prev.map((cl) =>
        cl.id === checklistId ? { ...cl, items: cl.items.map((i) => (i.id === itemId ? item : i)) } : cl,
      ),
    )
  }

  async function handleDeleteItem(checklistId: string, itemId: string) {
    await checklistsApi.deleteItem(itemId)
    setChecklists((prev) =>
      prev.map((cl) => (cl.id === checklistId ? { ...cl, items: cl.items.filter((i) => i.id !== itemId) } : cl)),
    )
  }

  async function handleAddItem(checklistId: string) {
    const text = newItemText[checklistId]?.trim()
    if (!text) return
    const item = await checklistsApi.addItem(checklistId, text)
    setChecklists((prev) =>
      prev.map((cl) => (cl.id === checklistId ? { ...cl, items: [...cl.items, item] } : cl)),
    )
    setNewItemText((prev) => ({ ...prev, [checklistId]: "" }))
  }

  const labelStyle: React.CSSProperties = {
    fontSize: "var(--text-xs)",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "oklch(var(--color-ink-3))",
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={labelStyle}>
          Checklist{totalItems > 0 && ` · ${checkedItems}/${totalItems}`}
        </span>
        {canEdit && (
          <button
            onClick={() => setAddingNew(true)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "oklch(var(--color-accent))", padding: 0, fontSize: "var(--text-sm)", fontWeight: 500, fontFamily: "var(--font-body)" }}
          >
            + Add checklist
          </button>
        )}
      </div>

      {/* Progress bar */}
      {totalItems > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 999, background: "oklch(var(--color-paper-3))", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "oklch(var(--color-success))", borderRadius: 999, transition: "width 0.3s ease" }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "oklch(var(--color-ink-3))", minWidth: 34, textAlign: "right" }}>{pct}%</span>
        </div>
      )}

      {/* New checklist form */}
      {addingNew && (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleCreateChecklist(); if (e.key === "Escape") setAddingNew(false) }}
            placeholder="Checklist title…"
            style={inputStyle}
          />
          <button onClick={() => void handleCreateChecklist()} style={{ padding: "7px 14px", borderRadius: "var(--radius-button)", background: "oklch(var(--color-accent))", color: "#fff", border: "none", cursor: "pointer", fontSize: "var(--text-sm)", fontWeight: 600 }}>Add</button>
          <button onClick={() => setAddingNew(false)} style={{ padding: "7px 12px", borderRadius: "var(--radius-button)", background: "oklch(var(--color-paper-2))", border: "1px solid oklch(var(--color-border))", color: "oklch(var(--color-ink-2))", cursor: "pointer", fontSize: "var(--text-sm)" }}>×</button>
        </div>
      )}

      {/* Checklists — boxed cards */}
      {checklists.map((cl) => {
        const clTotal = cl.items.length
        const clDone = cl.items.filter((i) => i.checked).length
        return (
          <div
            key={cl.id}
            style={{
              border: "1px solid oklch(var(--color-border))",
              borderRadius: "var(--radius-card)",
              background: "oklch(var(--color-paper))",
              overflow: "hidden",
            }}
          >
            {/* Title row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "9px 12px",
                background: "oklch(var(--color-paper-2))",
                borderBottom: "1px solid oklch(var(--color-border))",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: "var(--text-sm)", color: "oklch(var(--color-ink))", display: "flex", alignItems: "center", gap: 8 }}>
                {cl.title}
                {clTotal > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: "oklch(var(--color-ink-3))" }}>{clDone}/{clTotal}</span>
                )}
              </span>
              {canEdit && (
                <button onClick={() => void handleDeleteChecklist(cl.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "oklch(var(--color-ink-3))", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)" }}>Delete</button>
              )}
            </div>

            {/* Items */}
            {cl.items.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {cl.items.map((item) => (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px" }}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={item.checked}
                      aria-label={item.checked ? "Mark item incomplete" : "Mark item complete"}
                      disabled={!canEdit}
                      onClick={() => canEdit && void handleToggleItem(cl.id, item.id, !item.checked)}
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
                        cursor: canEdit ? "pointer" : "default",
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
                      <button onClick={() => void handleDeleteItem(cl.id, item.id)} aria-label="Remove item" style={{ background: "none", border: "none", cursor: "pointer", color: "oklch(var(--color-ink-3))", fontSize: 13, padding: "0 2px", lineHeight: 1 }}>×</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add item */}
            {canEdit && (
              <div style={{ display: "flex", gap: 6, padding: "10px 12px", borderTop: cl.items.length > 0 ? "1px solid oklch(var(--color-border))" : "none" }}>
                <input
                  value={newItemText[cl.id] ?? ""}
                  onChange={(e) => setNewItemText((prev) => ({ ...prev, [cl.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleAddItem(cl.id) }}
                  placeholder="Add an item…"
                  style={inputStyle}
                />
                <button onClick={() => void handleAddItem(cl.id)} style={{ padding: "7px 14px", borderRadius: "var(--radius-button)", background: "oklch(var(--color-paper-2))", border: "1px solid oklch(var(--color-border))", color: "oklch(var(--color-ink-2))", cursor: "pointer", fontSize: "var(--text-sm)", fontWeight: 500 }}>Add</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
