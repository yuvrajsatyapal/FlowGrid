import { useState, useRef, useEffect } from "react"

interface Props {
  onSubmit: (name: string) => Promise<void>
  width?: number
}

export default function CreateListInline({ onSubmit, width = 272 }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const handleSubmit = async () => {
    const trimmed = name.trim()
    if (!trimmed) { setError("List name is required"); return }
    if (trimmed.length > 100) { setError("Name must be 100 characters or fewer"); return }
    setSaving(true)
    setError("")
    try {
      await onSubmit(trimmed)
      setName("")
      setOpen(false)
    } catch (err) {
      setError((err as Error).message || "Failed to create list")
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width,
          flexShrink: 0,
          padding: "10px 14px",
          borderRadius: "var(--radius-card)",
          border: "1.5px dashed oklch(var(--color-border))",
          background: "oklch(var(--color-paper-2) / 0.6)",
          color: "oklch(var(--color-ink-3))",
          fontSize: "var(--text-sm)",
          fontFamily: "var(--font-body)",
          fontWeight: 500,
          cursor: "pointer",
          transition: "border-color 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "oklch(var(--color-accent))"
          e.currentTarget.style.color = "oklch(var(--color-accent))"
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "oklch(var(--color-border))"
          e.currentTarget.style.color = "oklch(var(--color-ink-3))"
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
        Add a list
      </button>
    )
  }

  return (
    <div
      style={{
        width,
        flexShrink: 0,
        background: "oklch(var(--color-paper-2))",
        borderRadius: "var(--radius-card)",
        border: "1px solid oklch(var(--color-accent))",
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => { setName(e.target.value); setError("") }}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit()
          if (e.key === "Escape") { setOpen(false); setName(""); setError("") }
        }}
        placeholder="List name…"
        maxLength={100}
        disabled={saving}
        style={{
          border: `1px solid ${error ? "oklch(var(--color-error))" : "oklch(var(--color-border))"}`,
          borderRadius: "var(--radius-input)",
          padding: "6px 10px",
          fontSize: "var(--text-sm)",
          fontFamily: "var(--font-body)",
          background: "oklch(var(--color-paper))",
          color: "oklch(var(--color-ink))",
          outline: "none",
        }}
      />
      {error && (
        <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>{error}</p>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={handleSubmit}
          disabled={saving}
          style={{
            flex: 1,
            padding: "6px 10px",
            borderRadius: "var(--radius-button)",
            border: "none",
            background: "oklch(var(--color-accent))",
            color: "#fff",
            fontSize: "var(--text-sm)",
            fontWeight: 600,
            fontFamily: "var(--font-body)",
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Adding…" : "Add list"}
        </button>
        <button
          onClick={() => { setOpen(false); setName(""); setError("") }}
          disabled={saving}
          style={{
            padding: "6px 10px",
            borderRadius: "var(--radius-button)",
            border: "1px solid oklch(var(--color-border))",
            background: "none",
            color: "oklch(var(--color-ink-2))",
            fontSize: "var(--text-sm)",
            fontFamily: "var(--font-body)",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
