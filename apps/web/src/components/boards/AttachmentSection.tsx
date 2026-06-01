import { useRef, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { AttachmentResponse } from "@flowgrid/types"
import { attachmentsApi } from "../../api/attachments"

const MAX_FILE_SIZE = 25 * 1024 * 1024

const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".sh", ".bat", ".cmd", ".ps1", ".app", ".dmg",
  ".pkg", ".deb", ".rpm", ".msi", ".vbs", ".jar",
])

const EXT_ICON: Record<string, string> = {
  pdf: "📄", doc: "📝", docx: "📝", xls: "📊", xlsx: "📊",
  ppt: "📊", pptx: "📊", zip: "🗜", rar: "🗜", tar: "🗜", gz: "🗜",
  mp4: "🎬", mov: "🎬", avi: "🎬", mkv: "🎬", webm: "🎬",
  mp3: "🎵", wav: "🎵", ogg: "🎵",
  txt: "📃", csv: "📊", json: "📃", xml: "📃",
}

function fileIcon(name: string, mimeType: string | null): string {
  if (mimeType?.startsWith("image/")) return "🖼"
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  return EXT_ICON[ext] ?? "📎"
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

interface Props {
  cardId: string
  canEdit: boolean
}

export function AttachmentSection({ cardId, canEdit }: Props) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState("")
  const [uploadingName, setUploadingName] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const { data: attachments = [], isLoading } = useQuery<AttachmentResponse[]>({
    queryKey: ["attachments", cardId],
    queryFn: () => attachmentsApi.list(cardId),
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => attachmentsApi.upload(cardId, file),
    onSuccess: (newItem) => {
      qc.setQueryData<AttachmentResponse[]>(["attachments", cardId], (old = []) => [...old, newItem])
      setUploadingName(null)
      setUploadError("")
    },
    onError: (err: Error) => {
      setUploadingName(null)
      setUploadError(err.message || "Upload failed")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => attachmentsApi.remove(id),
    onSuccess: (_data, id) => {
      qc.setQueryData<AttachmentResponse[]>(["attachments", cardId], (old = []) =>
        old.filter((a) => a.id !== id),
      )
    },
    onError: (err: Error) => {
      setUploadError(err.message || "Delete failed")
    },
  })

  function validateAndUpload(file: File) {
    setUploadError("")
    const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "")
    if (BLOCKED_EXTENSIONS.has(ext)) {
      setUploadError("File type not allowed")
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError("File must be 25 MB or smaller")
      return
    }
    setUploadingName(file.name)
    uploadMutation.mutate(file)
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    // Process one file at a time — upload the first valid file only when idle,
    // queue the rest. This prevents state overwrites when multiple files are selected.
    if (uploadMutation.isPending) return
    validateAndUpload(files[0])
  }

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontSize: "var(--text-sm)",
            fontWeight: 600,
            color: "oklch(var(--color-ink-2))",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Attachments {attachments.length > 0 && `(${attachments.length})`}
        </span>
        {canEdit && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            style={{
              fontSize: "var(--text-xs)",
              padding: "3px 10px",
              borderRadius: "var(--radius-pill)",
              border: "1px solid oklch(var(--color-border))",
              background: "oklch(var(--color-paper-2))",
              color: "oklch(var(--color-ink-2))",
              cursor: "pointer",
            }}
          >
            + Add
          </button>
        )}
      </div>

      {/* Error banner */}
      {uploadError && (
        <div
          style={{
            marginBottom: 8,
            padding: "6px 10px",
            borderRadius: "var(--radius-input)",
            background: "oklch(var(--color-danger-subtle, 0.97 0.02 27))",
            color: "oklch(var(--color-danger, 0.59 0.22 27))",
            fontSize: "var(--text-xs)",
          }}
        >
          {uploadError}
        </div>
      )}

      {/* Attachment list */}
      {isLoading ? (
        <div style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
          Loading…
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {attachments.map((a) => (
            <AttachmentRow
              key={a.id}
              attachment={a}
              canEdit={canEdit}
              onDelete={() => deleteMutation.mutate(a.id)}
            />
          ))}

          {/* Pending upload skeleton */}
          {uploadingName && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: "var(--radius-input)",
                background: "oklch(var(--color-paper-2))",
                opacity: 0.6,
              }}
            >
              <span style={{ fontSize: 18 }}>⏳</span>
              <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-2))" }}>
                Uploading {uploadingName}…
              </span>
            </div>
          )}
        </div>
      )}

      {/* Drop zone (writers only) */}
      {canEdit && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            handleFiles(e.dataTransfer.files)
          }}
          onClick={() => fileInputRef.current?.click()}
          style={{
            marginTop: 10,
            padding: "14px 12px",
            borderRadius: "var(--radius-input)",
            border: `1px dashed ${dragOver ? "oklch(var(--color-accent))" : "oklch(var(--color-border))"}`,
            background: dragOver ? "oklch(var(--color-accent-subtle, 0.97 0.02 237))" : "transparent",
            textAlign: "center",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "var(--text-xs)",
              color: "oklch(var(--color-ink-3))",
            }}
          >
            Drag & drop files here, or click to browse
          </p>
          <p
            style={{
              margin: "2px 0 0",
              fontSize: "var(--text-xs)",
              color: "oklch(var(--color-ink-3))",
              opacity: 0.7,
            }}
          >
            Max 25 MB · Images, PDFs, docs, archives
          </p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.tar,.gz,.mp4,.mov,.avi,.mkv,.webm,.mp3,.wav,.txt,.csv,.json,.xml"
        style={{ display: "none" }}
        onChange={(e) => {
          handleFiles(e.target.files)
          // Reset so the same file can be re-selected after an error
          e.target.value = ""
        }}
      />
    </div>
  )
}

interface RowProps {
  attachment: AttachmentResponse
  canEdit: boolean
  onDelete: () => void
}

function AttachmentRow({ attachment, canEdit, onDelete }: RowProps) {
  const isImage = attachment.mimeType?.startsWith("image/")

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        borderRadius: "var(--radius-input)",
        background: "oklch(var(--color-paper-2))",
      }}
    >
      {/* Thumbnail or icon */}
      {isImage ? (
        <img
          src={attachment.url}
          alt={attachment.name}
          style={{
            width: 40,
            height: 40,
            objectFit: "cover",
            borderRadius: 4,
            flexShrink: 0,
          }}
        />
      ) : (
        <span style={{ fontSize: 22, flexShrink: 0, lineHeight: 1 }}>
          {fileIcon(attachment.name, attachment.mimeType)}
        </span>
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "var(--text-xs)",
            fontWeight: 500,
            color: "oklch(var(--color-ink))",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {attachment.name}
        </div>
        <div style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
          {[
            formatBytes(attachment.size),
            attachment.uploader?.name ?? "Unknown",
            relativeTime(attachment.createdAt),
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <a
          href={attachment.url}
          download={attachment.name}
          target="_blank"
          rel="noreferrer"
          style={{
            padding: "3px 7px",
            borderRadius: "var(--radius-input)",
            border: "1px solid oklch(var(--color-border))",
            background: "oklch(var(--color-paper))",
            color: "oklch(var(--color-ink-2))",
            fontSize: "var(--text-xs)",
            textDecoration: "none",
            lineHeight: 1.5,
          }}
          title="Download"
        >
          ↓
        </a>
        {canEdit && (
          <button
            onClick={onDelete}
            style={{
              padding: "3px 7px",
              borderRadius: "var(--radius-input)",
              border: "1px solid oklch(var(--color-border))",
              background: "oklch(var(--color-paper))",
              color: "oklch(var(--color-ink-3))",
              fontSize: "var(--text-xs)",
              cursor: "pointer",
            }}
            title="Delete"
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}
