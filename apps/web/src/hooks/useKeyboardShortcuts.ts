import { useEffect } from "react"

type Handler = () => void

interface Shortcut {
  key: string
  description: string
  handler: Handler
}

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"])

function isTyping(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null
  if (!target) return false
  if (TYPING_TAGS.has(target.tagName)) return true
  if (target.isContentEditable) return true
  return false
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTyping(e)) return

      for (const shortcut of shortcuts) {
        if (e.key.toLowerCase() === shortcut.key.toLowerCase()) {
          e.preventDefault()
          shortcut.handler()
          return
        }
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [shortcuts])
}
