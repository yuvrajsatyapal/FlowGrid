import { useEffect, useState, useCallback } from "react"
import { checklistsApi, type Checklist } from "../../api/checklists"

interface Props {
  cardId: string
  canEdit: boolean
}

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

  const s: React.CSSProperties = {
    fontSize: "var(--text-sm)",
    color: "oklch(var(--color-ink-2))",
    fontFamily: "var(--font-body)",
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "oklch(var(--color-ink-3))" }}>
          Checklist {totalItems > 0 && `· ${checkedItems}/${totalItems}`}
        </span>
        {canEdit && (
          <button
            onClick={() => setAddingNew(true)}
            style={{ ...s, background: "none", border: "none", cursor: "pointer", color: "oklch(var(--color-accent))", padding: 0 }}
          >
            + Add checklist
          </button>
        )}
      </div>

      {/* Global progress bar */}
      {totalItems > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "oklch(var(--color-ink-3))", minWidth: 28, textAlign: "right" }}>{pct}%</span>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: "oklch(var(--color-paper-3))", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "oklch(var(--color-success))", borderRadius: 3, transition: "width 0.3s" }} />
          </div>
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
            style={{ flex: 1, padding: "5px 8px", borderRadius: "var(--radius-input)", border: "1px solid oklch(var(--color-border))", background: "oklch(var(--color-paper-2))", ...s }}
          />
          <button onClick={() => void handleCreateChecklist()} style={{ padding: "5px 12px", borderRadius: "var(--radius-btn)", background: "oklch(var(--color-accent))", color: "#fff", border: "none", cursor: "pointer", fontSize: "var(--text-sm)" }}>Add</button>
          <button onClick={() => setAddingNew(false)} style={{ padding: "5px 10px", borderRadius: "var(--radius-btn)", background: "oklch(var(--color-paper-2))", border: "1px solid oklch(var(--color-border))", cursor: "pointer", fontSize: "var(--text-sm)" }}>×</button>
        </div>
      )}

      {/* Checklists */}
      {checklists.map((cl) => (
        <div key={cl.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600, fontSize: "var(--text-sm)", color: "oklch(var(--color-ink))" }}>{cl.title}</span>
            {canEdit && (
              <button onClick={() => void handleDeleteChecklist(cl.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "oklch(var(--color-ink-3))", fontSize: 13 }}>Delete</button>
            )}
          </div>

          {cl.items.map((item) => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0" }}>
              <input
                type="checkbox"
                checked={item.checked}
                disabled={!canEdit}
                onChange={(e) => void handleToggleItem(cl.id, item.id, e.target.checked)}
                style={{ width: 14, height: 14, cursor: canEdit ? "pointer" : "default", accentColor: "oklch(var(--color-accent))", flexShrink: 0 }}
              />
              <span style={{ flex: 1, fontSize: "var(--text-sm)", color: "oklch(var(--color-ink))", textDecoration: item.checked ? "line-through" : "none", opacity: item.checked ? 0.5 : 1 }}>
                {item.text}
              </span>
              {canEdit && (
                <button onClick={() => void handleDeleteItem(cl.id, item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "oklch(var(--color-ink-3))", fontSize: 12, padding: "0 2px" }}>×</button>
              )}
            </div>
          ))}

          {canEdit && (
            <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
              <input
                value={newItemText[cl.id] ?? ""}
                onChange={(e) => setNewItemText((prev) => ({ ...prev, [cl.id]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") void handleAddItem(cl.id) }}
                placeholder="Add an item…"
                style={{ flex: 1, padding: "4px 8px", borderRadius: "var(--radius-input)", border: "1px solid oklch(var(--color-border))", background: "oklch(var(--color-paper-2))", ...s }}
              />
              <button onClick={() => void handleAddItem(cl.id)} style={{ padding: "4px 10px", borderRadius: "var(--radius-btn)", background: "oklch(var(--color-paper-2))", border: "1px solid oklch(var(--color-border))", cursor: "pointer", fontSize: "var(--text-xs)" }}>Add</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
