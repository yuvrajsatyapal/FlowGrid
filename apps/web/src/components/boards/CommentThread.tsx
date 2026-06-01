import { useState, useEffect, useCallback } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import type { Socket } from "socket.io-client"
import type { CommentResponse } from "@flowgrid/types"
import { commentsApi } from "../../api/comments"
import { getInitials, getAvatarBg } from "../../utils/avatar"

interface Props {
  cardId: string
  currentUserId: string
  currentUserRole: string // "OWNER" | "ADMIN" | "MEMBER" | "VIEWER"
  socket?: Socket | null
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function CommentThread({ cardId, currentUserId, currentUserRole, socket }: Props) {
  const [comments, setComments] = useState<CommentResponse[]>([])
  const [total, setTotal] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const canModerate = currentUserRole === "OWNER" || currentUserRole === "ADMIN"

  // Real-time comment sync — subscribe to socket events for this card
  useEffect(() => {
    if (!socket) return

    const handleCreated = (comment: CommentResponse) => {
      if (comment.cardId !== cardId) return
      setComments((prev) => [...prev, comment])
      setTotal((t) => t + 1)
    }

    const handleUpdated = (comment: CommentResponse) => {
      if (comment.cardId !== cardId) return
      setComments((prev) => prev.map((c) => (c.id === comment.id ? comment : c)))
    }

    const handleDeleted = ({ id, cardId: eventCardId }: { id: string; cardId: string }) => {
      if (eventCardId !== cardId) return
      setComments((prev) => prev.filter((c) => c.id !== id))
      setTotal((t) => Math.max(0, t - 1))
    }

    socket.on("comment:created", handleCreated)
    socket.on("comment:updated", handleUpdated)
    socket.on("comment:deleted", handleDeleted)

    return () => {
      socket.off("comment:created", handleCreated)
      socket.off("comment:updated", handleUpdated)
      socket.off("comment:deleted", handleDeleted)
    }
  }, [socket, cardId])

  // New comment editor
  const newEditor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Write a comment…" }),
    ],
    content: "",
  })

  // Edit comment editor — content set via setContent when editingId changes
  const editEditor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Edit comment…" }),
    ],
    content: "",
  })

  // Sync edit editor content when switching to a different comment
  useEffect(() => {
    if (!editEditor) return
    if (editingId) {
      const comment = comments.find((c) => c.id === editingId)
      if (comment) {
        editEditor.commands.setContent(comment.content)
      }
    } else {
      editEditor.commands.clearContent()
    }
  }, [editingId, editEditor, comments])

  const load = useCallback(async () => {
    try {
      const page = await commentsApi.list(cardId)
      setComments(page.items)
      setTotal(page.total)
    } catch (err) {
      setLoadError((err as Error).message || "Failed to load comments.")
    }
  }, [cardId])

  useEffect(() => {
    void load()
  }, [load])

  const handleSubmit = async () => {
    if (!newEditor || newEditor.isEmpty || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const comment = await commentsApi.create(cardId, newEditor.getHTML())
      setComments((prev) => [...prev, comment])
      setTotal((t) => t + 1)
      newEditor.commands.clearContent()
    } catch (err) {
      setSubmitError((err as Error).message || "Failed to post comment.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = async (id: string) => {
    if (!editEditor || editEditor.isEmpty) return
    try {
      const updated = await commentsApi.update(id, editEditor.getHTML())
      setComments((prev) => prev.map((c) => (c.id === id ? updated : c)))
      setEditingId(null)
    } catch (err) {
      setSubmitError((err as Error).message || "Failed to update comment.")
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await commentsApi.delete(id)
      setComments((prev) => prev.filter((c) => c.id !== id))
      setTotal((t) => t - 1)
    } catch (err) {
      setSubmitError((err as Error).message || "Failed to delete comment.")
    }
  }

  if (loadError) {
    return (
      <div style={{ fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-3))", padding: "4px 0" }}>
        {loadError}
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "oklch(var(--color-ink-3))", letterSpacing: "0.04em", textTransform: "uppercase" }}>
        Comments {total > 0 && `(${total})`}
      </div>

      {/* Comment list */}
      {comments.length === 0 ? (
        <div style={{ fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-3))", padding: "4px 0" }}>
          No comments yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {comments.map((comment) => {
            const authorId = comment.author?.id ?? "deleted"
            const authorName = comment.author?.name ?? "Deleted User"
            const isOwn = comment.author?.id === currentUserId
            const canEdit = isOwn || canModerate

            return (
              <div key={comment.id} style={{ display: "flex", gap: 10 }}>
                {/* Avatar */}
                <div style={{ flexShrink: 0 }}>
                  {comment.author?.avatarUrl ? (
                    <img
                      src={comment.author.avatarUrl}
                      alt={authorName}
                      style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }}
                    />
                  ) : (
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%",
                      background: comment.author ? getAvatarBg(authorId) : "oklch(var(--color-ink-4))",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 700, color: "#fff",
                    }}>
                      {comment.author ? getInitials(comment.author.name) : "?"}
                    </div>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "oklch(var(--color-ink))" }}>
                      {authorName}
                    </span>
                    <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                      {formatRelativeTime(comment.createdAt)}
                    </span>
                    {comment.updatedAt !== comment.createdAt && (
                      <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))", fontStyle: "italic" }}>
                        edited
                      </span>
                    )}
                  </div>

                  {editingId === comment.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{
                        border: "1px solid oklch(var(--color-border))",
                        borderRadius: "var(--radius-input)",
                        background: "oklch(var(--color-paper-2))",
                        padding: "8px 10px",
                        fontSize: "var(--text-sm)",
                        fontFamily: "var(--font-body)",
                        color: "oklch(var(--color-ink))",
                        minHeight: 60,
                      }}>
                        <EditorContent editor={editEditor} />
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => void handleEdit(comment.id)}
                          disabled={!editEditor || editEditor.isEmpty}
                          style={{
                            fontSize: "var(--text-xs)", padding: "3px 10px",
                            borderRadius: "var(--radius-btn)",
                            background: "oklch(var(--color-accent))",
                            color: "#fff", border: "none",
                            cursor: (!editEditor || editEditor.isEmpty) ? "not-allowed" : "pointer",
                            opacity: (!editEditor || editEditor.isEmpty) ? 0.5 : 1,
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          style={{
                            fontSize: "var(--text-xs)", padding: "3px 10px",
                            borderRadius: "var(--radius-btn)",
                            background: "transparent",
                            color: "oklch(var(--color-ink-3))", border: "1px solid oklch(var(--color-border))",
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        style={{ fontSize: "var(--text-sm)", color: "oklch(var(--color-ink))", lineHeight: 1.5 }}
                        dangerouslySetInnerHTML={{ __html: comment.content }}
                      />
                      {canEdit && (
                        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                          {/* OWNER/ADMIN can edit any comment; authors can edit their own */}
                          {(isOwn || canModerate) && (
                            <button
                              onClick={() => setEditingId(comment.id)}
                              style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                            >
                              Edit
                            </button>
                          )}
                          <button
                            onClick={() => void handleDelete(comment.id)}
                            style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-error))", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* New comment editor */}
      <div style={{
        border: "1px solid oklch(var(--color-border))",
        borderRadius: "var(--radius-input)",
        background: "oklch(var(--color-paper-2))",
        padding: "8px 10px",
        fontSize: "var(--text-sm)",
        fontFamily: "var(--font-body)",
        color: "oklch(var(--color-ink))",
        minHeight: 60,
      }}>
        <EditorContent editor={newEditor} />
      </div>

      {submitError && (
        <div style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>{submitError}</div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => void handleSubmit()}
          disabled={!newEditor || newEditor.isEmpty || submitting}
          style={{
            fontSize: "var(--text-sm)", padding: "6px 16px",
            borderRadius: "var(--radius-btn)",
            background: "oklch(var(--color-accent))",
            color: "#fff", border: "none",
            cursor: (!newEditor || newEditor.isEmpty || submitting) ? "not-allowed" : "pointer",
            opacity: (!newEditor || newEditor.isEmpty || submitting) ? 0.5 : 1,
          }}
        >
          {submitting ? "Posting…" : "Post Comment"}
        </button>
      </div>
    </div>
  )
}
