import { useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import type { CardSearchResult } from "@flowgrid/types"
import { useSearch } from "../../hooks/useSearch"
import { SearchResult } from "./SearchResult"

interface Props {
  isOpen: boolean
  onClose: () => void
  workspaceId: string
}

export function SearchModal({ isOpen, onClose, workspaceId }: Props) {
  const { query, setQuery, results, isLoading, error, recentSearches, clearRecentSearches } =
    useSearch(workspaceId)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const highlightedIndexRef = useRef(0)
  const highlightedIndexState = useRef(0)

  // Sync highlight index to state-like ref
  const setHighlightedIndex = (idx: number) => {
    highlightedIndexRef.current = idx
    highlightedIndexState.current = idx
    // Force re-render by updating the input's data attribute (cheap)
    if (listRef.current) {
      listRef.current.setAttribute("data-hi", String(idx))
    }
  }

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setQuery("")
      setHighlightedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [isOpen, setQuery])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose()
        return
      }
      if (results.length === 0) return
      if (e.key === "ArrowDown") {
        e.preventDefault()
        const next = Math.min(highlightedIndexRef.current + 1, results.length - 1)
        setHighlightedIndex(next)
        scrollResultIntoView(next)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        const next = Math.max(highlightedIndexRef.current - 1, 0)
        setHighlightedIndex(next)
        scrollResultIntoView(next)
      } else if (e.key === "Enter") {
        e.preventDefault()
        const card = results[highlightedIndexRef.current]
        if (card) handleSelect(card)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, results, onClose]) // eslint-disable-line react-hooks/exhaustive-deps

  function scrollResultIntoView(index: number) {
    const el = listRef.current?.children[index] as HTMLElement | undefined
    el?.scrollIntoView({ block: "nearest" })
  }

  function handleSelect(card: CardSearchResult) {
    onClose()
    navigate(`/workspaces/${workspaceId}/boards/${card.boardId}`)
  }

  // Reset highlighted index when results change
  useEffect(() => {
    setHighlightedIndex(0)
  }, [results])

  if (!isOpen) return null

  const trimmed = query.trim()
  const showKeepTyping = trimmed.length > 0 && trimmed.length < 2
  const showResults = !showKeepTyping && !isLoading && results.length > 0
  const showEmpty = !showKeepTyping && !isLoading && trimmed.length >= 2 && results.length === 0
  const showRecent = trimmed.length === 0 && recentSearches.length > 0

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "oklch(0% 0 0 / 0.4)",
          zIndex: 49,
        }}
      />

      {/* Modal panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        style={{
          position: "fixed",
          top: "15vh",
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(600px, calc(100vw - 32px))",
          background: "oklch(var(--color-paper))",
          border: "1px solid oklch(var(--color-border))",
          borderRadius: "var(--radius-lg, 10px)",
          boxShadow: "0 24px 48px oklch(0% 0 0 / 0.18)",
          zIndex: 50,
          overflow: "hidden",
        }}
      >
        {/* Search input row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "12px 16px",
            borderBottom: "1px solid oklch(var(--color-border))",
          }}
        >
          {/* Search icon */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
            <circle cx="6.5" cy="6.5" r="4.5" stroke="oklch(var(--color-ink-3))" strokeWidth="1.25" />
            <path d="M10.5 10.5L14 14" stroke="oklch(var(--color-ink-3))" strokeWidth="1.25" strokeLinecap="round" />
          </svg>

          <input
            ref={inputRef}
            type="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search cards…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: "14px",
              color: "oklch(var(--color-ink))",
            }}
          />

          {isLoading && (
            <svg
              aria-label="Loading"
              width="14"
              height="14"
              viewBox="0 0 14 14"
              style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}
            >
              <circle cx="7" cy="7" r="5.5" stroke="oklch(var(--color-border))" strokeWidth="1.5" fill="none" />
              <path
                d="M7 1.5A5.5 5.5 0 0 1 12.5 7"
                stroke="oklch(var(--color-accent))"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          )}

          <kbd
            style={{
              padding: "1px 5px",
              borderRadius: "4px",
              border: "1px solid oklch(var(--color-border))",
              fontSize: "11px",
              color: "oklch(var(--color-ink-3))",
              background: "oklch(var(--color-paper-2))",
              flexShrink: 0,
            }}
          >
            Esc
          </kbd>
        </div>

        {/* Body */}
        <div style={{ maxHeight: "420px", overflowY: "auto" }}>
          {/* Keep typing hint */}
          {showKeepTyping && (
            <p
              style={{
                padding: "24px 16px",
                textAlign: "center",
                fontSize: "13px",
                color: "oklch(var(--color-ink-3))",
                margin: 0,
              }}
            >
              Keep typing…
            </p>
          )}

          {/* Error */}
          {error && (
            <p
              style={{
                padding: "24px 16px",
                textAlign: "center",
                fontSize: "13px",
                color: "oklch(var(--color-error))",
                margin: 0,
              }}
            >
              {error}
            </p>
          )}

          {/* Results list */}
          {showResults && (
            <div
              ref={listRef}
              role="listbox"
              aria-label="Search results"
              data-hi="0"
              style={{ padding: "6px" }}
            >
              {results.map((card, i) => (
                <SearchResult
                  key={card.id}
                  card={card}
                  isHighlighted={i === highlightedIndexRef.current}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          )}

          {/* Empty results */}
          {showEmpty && (
            <div style={{ padding: "32px 16px", textAlign: "center" }}>
              <p
                style={{
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "oklch(var(--color-ink-2))",
                  margin: "0 0 4px",
                }}
              >
                No results for &ldquo;{trimmed}&rdquo;
              </p>
              <p
                style={{
                  fontSize: "12px",
                  color: "oklch(var(--color-ink-3))",
                  margin: 0,
                }}
              >
                Try a shorter keyword or check your spelling
              </p>
            </div>
          )}

          {/* Recent searches */}
          {showRecent && (
            <div style={{ padding: "8px 6px 6px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "4px 10px 8px",
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "oklch(var(--color-ink-3))",
                  }}
                >
                  Recent
                </span>
                <button
                  onClick={clearRecentSearches}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "11px",
                    color: "oklch(var(--color-ink-3))",
                    padding: 0,
                  }}
                >
                  Clear
                </button>
              </div>
              {recentSearches.map((q) => (
                <button
                  key={q}
                  onClick={() => setQuery(q)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    width: "100%",
                    padding: "8px 10px",
                    background: "transparent",
                    border: "none",
                    borderRadius: "var(--radius-md, 6px)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: "13px",
                    color: "oklch(var(--color-ink-2))",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                    <path
                      d="M6.5 1C3.46 1 1 3.46 1 6.5S3.46 12 6.5 12 12 9.54 12 6.5"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                    <path d="M6.5 3.5V6.5l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Empty state — no input, no recent */}
          {trimmed.length === 0 && recentSearches.length === 0 && (
            <p
              style={{
                padding: "28px 16px",
                textAlign: "center",
                fontSize: "13px",
                color: "oklch(var(--color-ink-3))",
                margin: 0,
              }}
            >
              Search cards across all your boards
            </p>
          )}
        </div>
      </div>

      {/* Spin keyframe (inline — avoids CSS module dependency) */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
