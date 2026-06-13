import { useQueryClient } from "@tanstack/react-query"
import type { Socket } from "socket.io-client"
import type { CommentResponse } from "@flowgrid/types"
import { useRealtimeCacheSync } from "../../../lib/cache/useRealtimeCacheSync"
import type { CommentPage } from "../../../api/comments"
import { cardKeys } from "../queries/keys"
import { applyCommentUpsert, applyCommentRemove } from "./commentCache"

/** Drives the comment cache from board socket events. Events are board-wide,
 *  so each handler filters by cardId. Upsert is idempotent and version-guarded,
 *  which makes the old "did the sender already add this?" dedup guard obsolete. */
export function useCommentRealtimeSync(cardId: string | undefined, socket: Socket | null | undefined) {
  const qc = useQueryClient()

  const upsert = (comment: CommentResponse) => {
    if (!cardId || comment.cardId !== cardId) return
    qc.setQueryData<CommentPage>(cardKeys.comments(cardId), (prev) =>
      prev ? applyCommentUpsert(prev, comment) : prev,
    )
  }

  const remove = ({ id, cardId: eventCardId }: { id: string; cardId: string }) => {
    if (!cardId || eventCardId !== cardId) return
    qc.setQueryData<CommentPage>(cardKeys.comments(cardId), (prev) =>
      prev ? applyCommentRemove(prev, id) : prev,
    )
  }

  useRealtimeCacheSync(socket ?? null, {
    "comment:created": upsert,
    "comment:updated": upsert,
    "comment:deleted": remove,
  })
}
