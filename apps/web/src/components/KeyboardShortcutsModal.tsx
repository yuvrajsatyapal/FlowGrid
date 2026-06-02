import { useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"

interface Props {
  open: boolean
  onClose: () => void
}

const SHORTCUT_GROUPS = [
  {
    group: "Navigation",
    shortcuts: [
      { keys: ["?"], description: "Open keyboard shortcuts" },
      { keys: ["Esc"], description: "Close modal / dismiss" },
    ],
  },
  {
    group: "Board",
    shortcuts: [
      { keys: ["N"], description: "New card in focused list" },
      { keys: ["B"], description: "Create new board" },
      { keys: ["1"], description: "Switch to Kanban view" },
      { keys: ["2"], description: "Switch to Calendar view" },
      { keys: ["3"], description: "Switch to Timeline view" },
    ],
  },
  {
    group: "Card",
    shortcuts: [
      { keys: ["Enter"], description: "Open selected card" },
      { keys: ["Del"], description: "Archive / delete card" },
    ],
  },
]

export default function KeyboardShortcutsModal({ open, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    if (open) window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "oklch(0% 0 0 / 0.45)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "oklch(var(--color-paper))",
              borderRadius: "var(--radius-card)",
              border: "1px solid oklch(var(--color-border))",
              width: "100%",
              maxWidth: 480,
              overflow: "hidden",
              boxShadow: "0 20px 60px oklch(0% 0 0 / 0.2)",
            }}
          >
            {/* Header */}
            <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid oklch(var(--color-border))", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ margin: 0, fontSize: "var(--text-base)", fontWeight: 700, fontFamily: "var(--font-display)", color: "oklch(var(--color-ink))" }}>
                Keyboard Shortcuts
              </h2>
              <button
                onClick={onClose}
                style={{ background: "none", border: "none", cursor: "pointer", color: "oklch(var(--color-ink-3))", fontSize: 20, lineHeight: 1, padding: "0 4px" }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Shortcut groups */}
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.group}>
                  <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "oklch(var(--color-ink-3))", marginBottom: 8 }}>
                    {group.group}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {group.shortcuts.map((sc) => (
                      <div key={sc.description} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                        <span style={{ fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))", fontFamily: "var(--font-body)" }}>{sc.description}</span>
                        <div style={{ display: "flex", gap: 4 }}>
                          {sc.keys.map((k) => (
                            <kbd
                              key={k}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                minWidth: 24,
                                padding: "2px 6px",
                                borderRadius: 4,
                                border: "1px solid oklch(var(--color-border))",
                                background: "oklch(var(--color-paper-2))",
                                fontSize: 11,
                                fontFamily: "var(--font-mono, monospace)",
                                color: "oklch(var(--color-ink))",
                                fontWeight: 600,
                                boxShadow: "0 1px 0 oklch(var(--color-border))",
                              }}
                            >
                              {k}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: "10px 20px 16px", borderTop: "1px solid oklch(var(--color-border))", fontSize: 11, color: "oklch(var(--color-ink-3))", fontFamily: "var(--font-body)" }}>
              Shortcuts are disabled while typing in inputs.
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
