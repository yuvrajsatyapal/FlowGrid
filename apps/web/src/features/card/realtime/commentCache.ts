import { upsertById, removeById } from "../../../lib/cache/collection"
import type { CommentPage } from "../../../api/comments"
import type { CommentResponse } from "@flowgrid/types"

/** Insert-or-update a comment in the page. Total only increments when the
 *  comment was not already present, so a mutation write and the socket echo
 *  of the same comment converge without double-counting. The version guard in
 *  upsertById drops an out-of-order (older updatedAt) event. */
export function applyCommentUpsert(page: CommentPage, comment: CommentResponse): CommentPage {
  const present = page.items.some((c) => c.id === comment.id)
  return {
    ...page,
    items: upsertById(page.items, comment),
    total: present ? page.total : page.total + 1,
  }
}

/** Remove a comment from the page. No-op (same reference) when absent, so a
 *  duplicate delete event does not decrement total twice. */
export function applyCommentRemove(page: CommentPage, id: string): CommentPage {
  const present = page.items.some((c) => c.id === id)
  if (!present) return page
  return {
    ...page,
    items: removeById(page.items, id),
    total: Math.max(0, page.total - 1),
  }
}
