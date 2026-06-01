import { useState, useEffect, useCallback } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import type { CommentResponse } from "@flowgrid/types"
import { commentsApi } from "../../api/comments"
import { getInitials, getAvatarBg } from "../../utils/avatar"

interface Props {
  cardId: string
  currentUserId: string
  currentUserRole: string // "OWNER" | "ADMIN" | "MEMBER" | "VIEWER"
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

export function CommentThread({ cardId, currentUserId, currentUserRole }: Props) {
  const [comments, setComments] = useState<CommentResponse[]>([])
  const [total, setTotal] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState("")
  const [error, setError] = useState<string | null>(null)

  const canModerate = currentUserRole === "OWNER" || currentUserRole === "ADMIN"

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Write a comment…" }),
    ],
    content: "",
  })

  const load = useCallback(async () => {
    try {
      const page = await commentsApi.list(cardId)
      setComments(page.items)
      setTotal(page.total)
    } catch {
      // Non-blocking; card may have been archived
    }
  }, [cardId])

  useEffect(() => {
    void load()
  }, [load])

  const handleSubmit = async () => {
    if (!editor || editor.isEmpty || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const comment = await commentsApi.create(cardId, editor.getHTML())
      setComments((prev) => [...prev, comment])
      setTotal((t) => t + 1)
      editor.commands.clearContent()
    } catch (err) {
      setError((err as Error).message || "Failed to post comment.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = async (id: string) => {
    if (!editContent.trim()) return
    try {
      const updated = await commentsApi.update(id, editContent)
      setComments((prev) => prev.map((c) => (c.id === id ? updated : c)))
      setEditingId(null)
      setEditContent("")
    } catch (err) {
      setError((err as Error).message || "Failed to update comment.")
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await commentsApi.delete(id)
      setComments((prev) => prev.filter((c) => c.id !== id))
      setTotal((t) => t - 1)
    } catch (err) {
      setError((err as Error).message || "Failed to delete comment.")
    }
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
                      background: getAvatarBg(authorId),
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 700, color: "#fff",
                    }}>
                      {getInitials(comment.author?.name ?? null)}
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
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        style={{
                          width: "100%", minHeight: 60, padding: "6px 8px",
                          fontSize: "var(--text-sm)", fontFamily: "var(--font-body)",
                          border: "1px solid oklch(var(--color-border))",
                          borderRadius: "var(--radius-input)",
                          background: "oklch(var(--color-paper-2))",
                          color: "oklch(var(--color-ink))",
                          resize: "vertical",
                          boxSizing: "border-box",
                        }}
                      />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => void handleEdit(comment.id)}
                          disabled={!editContent.trim()}
                          style={{
                            fontSize: "var(--text-xs)", padding: "3px 10px",
                            borderRadius: "var(--radius-btn)",
                            background: "oklch(var(--color-accent))",
                            color: "#fff", border: "none", cursor: editContent.trim() ? "pointer" : "not-allowed",
                            opacity: editContent.trim() ? 1 : 0.5,
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setEditContent("") }}
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
                          {isOwn && (
                            <button
                              onClick={() => { setEditingId(comment.id); setEditContent(comment.content) }}
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
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{
          flex: 1,
          border: "1px solid oklch(var(--color-border))",
          borderRadius: "var(--radius-input)",
          background: "oklch(var(--color-paper-2))",
          padding: "8px 10px",
          fontSize: "var(--text-sm)",
          fontFamily: "var(--font-body)",
          color: "oklch(var(--color-ink))",
          minHeight: 60,
        }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {error && (
        <div style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>{error}</div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => void handleSubmit()}
          disabled={!editor || editor.isEmpty || submitting}
          style={{
            fontSize: "var(--text-sm)", padding: "6px 16px",
            borderRadius: "var(--radius-btn)",
            background: "oklch(var(--color-accent))",
            color: "#fff", border: "none",
            cursor: (!editor || editor.isEmpty || submitting) ? "not-allowed" : "pointer",
            opacity: (!editor || editor.isEmpty || submitting) ? 0.5 : 1,
          }}
        >
          {submitting ? "Posting…" : "Post Comment"}
        </button>
      </div>
    </div>
  )
}
