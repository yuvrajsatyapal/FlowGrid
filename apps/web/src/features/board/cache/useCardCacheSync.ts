import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { CardSummary } from "../../../api/cards"
import { boardKeys } from "../queries/keys"
import {
  upsertCardInBoard,
  removeCardFromBoard,
  applyLabelUpdateToBoard,
  applyLabelDeleteFromBoard,
  type CardsByList,
} from "./cardCache"

interface LabelPatch {
  id: string
  name: string
  color: string
}

/** Board-cache reconciliation for card/label mutations. Replaces the inline
 *  handleCardUpdated / handleLabelUpdated / handleLabelDeleted handlers; wired
 *  to the CardDetailModal callbacks from BoardPage. Pure cache writes only —
 *  no API calls, no socket handling. */
export function useCardCacheSync(boardId: string) {
  const qc = useQueryClient()
  const key = boardKeys.cards(boardId)

  const applyCardUpdate = useCallback(
    (card: CardSummary) => {
      qc.setQueryData<CardsByList>(key, (prev) => (prev ? upsertCardInBoard(prev, card) : prev))
      // Completion/labels may change blocked-badge state → recompute dep graph
      void qc.invalidateQueries({ queryKey: boardKeys.depGraph(boardId) })
    },
    [qc, key, boardId],
  )

  const applyCardDelete = useCallback(
    (id: string) => {
      qc.setQueryData<CardsByList>(key, (prev) => (prev ? removeCardFromBoard(prev, id) : prev))
      void qc.invalidateQueries({ queryKey: boardKeys.depGraph(boardId) })
    },
    [qc, key, boardId],
  )

  const applyLabelUpdate = useCallback(
    (label: LabelPatch) => {
      qc.setQueryData<CardsByList>(key, (prev) => (prev ? applyLabelUpdateToBoard(prev, label) : prev))
    },
    [qc, key],
  )

  const applyLabelDelete = useCallback(
    (labelId: string) => {
      qc.setQueryData<CardsByList>(key, (prev) => (prev ? applyLabelDeleteFromBoard(prev, labelId) : prev))
    },
    [qc, key],
  )

  return { applyCardUpdate, applyCardDelete, applyLabelUpdate, applyLabelDelete }
}
