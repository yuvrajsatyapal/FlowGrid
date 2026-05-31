import { useState, useRef, useEffect } from "react"

interface Props {
  onSubmit: (title: string) => Promise<void>
}

export default function CreateCardInline({ onSubmit }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [value, setValue] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (expanded) textareaRef.current?.focus()
  }, [expanded])

  const handleSave = async () => {
    const trimmed = value.trim()
    if (!trimmed) {
      setExpanded(false)
      setValue("")
      return
    }
    setSaving(true)
    setError("")
    try {
      await onSubmit(trimmed)
      setValue("")
      setExpanded(false)
    } catch (err) {
      setError((err as Error).message || "Failed to create card")
    } finally {
      setSaving(false)
    }
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "7px 10px",
          border: "none",
          borderRadius: "var(--radius-badge)",
          background: "none",
          color: "oklch(var(--color-ink-3))",
          fontSize: "var(--text-sm)",
          fontFamily: "var(--font-body)",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1, fontWeight: 400 }}>+</span>
        Add a card
      </button>
    )
  }

  return (
    <div style={{ padding: "0 4px 4px" }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleSave()
          }
          if (e.key === "Escape") {
            setExpanded(false)
            setValue("")
            setError("")
          }
        }}
        onBlur={handleSave}
        placeholder="Card title…"
        rows={2}
        maxLength={255}
        disabled={saving}
        style={{
          width: "100%",
          resize: "none",
          border: "1px solid oklch(var(--color-accent))",
          borderRadius: "var(--radius-input)",
          padding: "7px 9px",
          fontSize: "var(--text-sm)",
          fontFamily: "var(--font-body)",
          color: "oklch(var(--color-ink))",
          background: "oklch(var(--color-paper))",
          outline: "none",
          boxSizing: "border-box",
          opacity: saving ? 0.6 : 1,
        }}
      />
      {error && (
        <p style={{ margin: "4px 0 0", fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>
          {error}
        </p>
      )}
    </div>
  )
}
