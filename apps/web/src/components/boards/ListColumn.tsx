import { useState, useRef, useEffect } from "react"
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { MAX_CARDS_PER_LIST } from "@flowgrid/types"
import type { ListSummary } from "../../api/lists"
import { listsApi } from "../../api/lists"
import type { CardSummary } from "../../api/cards"
import { cardsApi } from "../../api/cards"
import CardItem from "./CardItem"
import CreateCardInline from "./CreateCardInline"

interface Props {
  list: ListSummary
  canEdit: boolean
  cards: CardSummary[]
  onRenamed: (id: string, name: string) => void
  onDeleted: (id: string) => void
  onCardCreated: (listId: string, card: CardSummary) => void
  onCardClick?: (cardId: string) => void
  width?: number
  /** Height each card occupies so a full list (5 cards) fills the column top-to-bottom */
  cardSlotHeight?: number
  blockedCardIds?: Set<string>
  isViewer?: boolean
}

function isDoneList(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.includes("done") || lower.includes("complete") || lower.includes("finished") || lower.includes("closed")
}

export default function ListColumn({ list, canEdit, cards, onRenamed, onDeleted, onCardCreated, onCardClick, width = 272, cardSlotHeight, blockedCardIds, isViewer = false }: Props) {
  const [renaming, setRenaming] = useState(false)
  const [nameInput, setNameInput] = useState(list.name)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [menuOpen, setMenuOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const { setNodeRef: setDropRef } = useDroppable({ id: list.id })

  useEffect(() => {
    if (renaming) inputRef.current?.select()
  }, [renaming])

  const commitRename = async () => {
    const trimmed = nameInput.trim()
    if (!trimmed || trimmed === list.name) {
      setRenaming(false)
      setNameInput(list.name)
      return
    }
    setSaving(true)
    try {
      const updated = await listsApi.update(list.id, trimmed)
      onRenamed(list.id, updated.name)
      setRenaming(false)
    } catch {
      setNameInput(list.name)
      setRenaming(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setMenuOpen(false)
    setDeleting(true)
    setDeleteError("")
    try {
      await listsApi.deleteList(list.id)
      onDeleted(list.id)
    } catch (err) {
      setDeleteError((err as Error).message || "Failed to delete list")
    } finally {
      setDeleting(false)
    }
  }

  const handleCreateCard = async (title: string) => {
    const card = await cardsApi.create(list.id, title)
    onCardCreated(list.id, card)
  }

  const isFull = cards.length >= MAX_CARDS_PER_LIST

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width,
        flexShrink: 0,
        // A full list stretches to the column height so its cards fill it edge-to-edge;
        // a partial/empty list stays content-sized (grows with the number of cards).
        alignSelf: isFull ? "stretch" : "flex-start",
        background: "oklch(var(--color-paper-2))",
        borderRadius: "var(--radius-card)",
        border: "1px solid oklch(var(--color-border))",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "10px 12px 8px",
        }}
      >
        {renaming ? (
          <input
            ref={inputRef}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename()
              if (e.key === "Escape") {
                setNameInput(list.name)
                setRenaming(false)
              }
            }}
            disabled={saving}
            maxLength={100}
            style={{
              flex: 1,
              border: "1px solid oklch(var(--color-accent))",
              borderRadius: "var(--radius-input)",
              padding: "2px 6px",
              fontSize: "var(--text-sm)",
              fontWeight: 700,
              fontFamily: "var(--font-body)",
              background: "oklch(var(--color-paper))",
              color: "oklch(var(--color-ink))",
              outline: "none",
            }}
          />
        ) : (
          <button
            onClick={() => canEdit && setRenaming(true)}
            style={{
              flex: 1,
              textAlign: "left",
              background: "none",
              border: "none",
              padding: "2px 4px",
              borderRadius: "var(--radius-badge)",
              fontSize: "0.6875rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontFamily: "var(--font-body)",
              color: "oklch(var(--color-ink-2))",
              cursor: canEdit ? "pointer" : "default",
              lineHeight: 1.4,
            }}
            title={canEdit ? "Click to rename" : list.name}
          >
            {list.name}
          </button>
        )}

        {/* Card count badge + optional blip for non-empty columns */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {cards.length > 0 && (
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: list.color, opacity: 0.85, flexShrink: 0 }} />
          )}
          <span
            style={{
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              color: "oklch(var(--color-ink-2))",
              background: "oklch(var(--color-paper-3))",
              borderRadius: "var(--radius-badge)",
              padding: "1px 6px",
              fontVariantNumeric: "tabular-nums",
              flexShrink: 0,
            }}
          >
            {cards.length}
          </span>
        </div>

        {canEdit && (
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              onClick={() => !deleting && setMenuOpen((v) => !v)}
              aria-label="List options"
              disabled={deleting}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 26,
                height: 26,
                borderRadius: "var(--radius-badge)",
                border: "none",
                background: "none",
                color: "oklch(var(--color-ink-3))",
                cursor: deleting ? "not-allowed" : "pointer",
                fontSize: 16,
                lineHeight: 1,
                opacity: deleting ? 0.5 : 1,
              }}
            >
              {deleting ? "…" : "···"}
            </button>
            {menuOpen && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 4px)",
                  background: "oklch(var(--color-paper))",
                  border: "1px solid oklch(var(--color-border))",
                  borderRadius: "var(--radius-card)",
                  boxShadow: "0 4px 12px oklch(0% 0 0 / 0.12)",
                  zIndex: 20,
                  minWidth: 140,
                  padding: "4px 0",
                }}
              >
                <button
                  onClick={() => { setMenuOpen(false); setRenaming(true) }}
                  style={menuItemStyle}
                >
                  Rename
                </button>
                <button
                  onClick={handleDelete}
                  style={{ ...menuItemStyle, color: "oklch(var(--color-error))" }}
                >
                  Delete list
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {deleteError && (
        <p style={{ margin: "0 12px 8px", fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>
          {deleteError}
        </p>
      )}

      {/* Cards area — reserve one card slot when empty; each card fills its slot so a full
          list spans the column top-to-bottom with no leftover gap */}
      <div
        ref={setDropRef}
        style={{
          flex: 1,
          padding: "0 8px 8px",
          minHeight: cardSlotHeight ?? 96,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <CardItem key={card.id} card={card} listName={list.name} isDoneList={isDoneList(list.name)} blocked={blockedCardIds?.has(card.id) ?? false} minHeight={cardSlotHeight} isViewer={isViewer} onCardClick={isViewer ? undefined : onCardClick} />
          ))}
        </SortableContext>
      </div>

      {/* Add card — hidden once the list hits the card cap (delete a card to add another) */}
      {canEdit && !isFull && (
        <div style={{ padding: "4px 4px 6px" }}>
          <CreateCardInline onSubmit={handleCreateCard} />
        </div>
      )}
    </div>
  )
}

const menuItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "none",
  border: "none",
  padding: "7px 14px",
  fontSize: "var(--text-sm)",
  fontFamily: "var(--font-body)",
  color: "oklch(var(--color-ink))",
  cursor: "pointer",
}
