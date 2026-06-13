import { useQueryClient } from "@tanstack/react-query"
import { useBoardSocket } from "../../../hooks/useBoardSocket"
import { boardKeys } from "../queries/keys"
import { upsertById, removeById, reorderByIds } from "../../../lib/cache/collection"
import { upsertCardInBoard, moveCardInBoard, removeCardFromBoard, type CardsByList } from "./cardCache"
import type { ListSummary } from "../../../api/lists"

/** Drives the board's list/card query cache from socket events. Replaces the
 *  inline useBoardSocket handlers in BoardPage. All writes are idempotent and
 *  (where the payload carries updatedAt) version-guarded, so self-echo dedup
 *  guards are obsolete. Reuses useBoardSocket for the socket lifecycle/presence
 *  (unchanged); only the handler bodies — now cache writes — differ. */
export function useBoardRealtimeSync(boardId: string | undefined) {
  const qc = useQueryClient()
  const cardsKey = boardKeys.cards(boardId ?? "")
  const listsKey = boardKeys.lists(boardId ?? "")

  const writeCards = (fn: (prev: CardsByList) => CardsByList) =>
    qc.setQueryData<CardsByList>(cardsKey, (prev) => (prev ? fn(prev) : prev))
  const writeLists = (fn: (prev: ListSummary[]) => ListSummary[]) =>
    qc.setQueryData<ListSummary[]>(listsKey, (prev) => (prev ? fn(prev) : prev))
  const invalidateDepGraph = () => {
    void qc.invalidateQueries({ queryKey: boardKeys.depGraph(boardId ?? "") })
  }

  useBoardSocket(boardId, {
    // created/updated: idempotent + version-guarded upsert (dedup guard obsolete)
    onCardCreated: (card) => writeCards((r) => upsertCardInBoard(r, card)),
    onCardUpdated: (card) => {
      writeCards((r) => upsertCardInBoard(r, card))
      invalidateDepGraph()
    },
    onCardMoved: (card) => writeCards((r) => moveCardInBoard(r, card)),
    onCardDeleted: ({ id }) => {
      writeCards((r) => removeCardFromBoard(r, id))
      invalidateDepGraph()
    },
    onCardReordered: ({ listId, cardIds }) =>
      writeCards((r) => (r[listId] ? { ...r, [listId]: reorderByIds(r[listId], cardIds) } : r)),
    onListCreated: (list) => {
      writeLists((l) => upsertById(l, list))
      writeCards((r) => (r[list.id] ? r : { ...r, [list.id]: [] }))
    },
    onListUpdated: (list) => writeLists((l) => upsertById(l, list)),
    onListReordered: ({ lists }) => writeLists(() => lists),
    onListDeleted: ({ id }) => {
      writeLists((l) => removeById(l, id))
      writeCards((r) => {
        if (!r[id]) return r
        const next = { ...r }
        delete next[id]
        return next
      })
    },
  })
}
