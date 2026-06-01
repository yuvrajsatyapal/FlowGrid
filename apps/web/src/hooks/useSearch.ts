import { useState, useEffect, useCallback, useRef } from "react"
import { searchApi } from "../api/search"
import type { CardSearchResult } from "@flowgrid/types"

const RECENT_KEY = "flowgrid:recent-searches"
const MAX_RECENT = 5
const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 2

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function saveRecent(query: string): void {
  const prev = loadRecent().filter((q) => q !== query)
  const next = [query, ...prev].slice(0, MAX_RECENT)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // localStorage unavailable — ignore silently
  }
}

export interface UseSearchReturn {
  query: string
  setQuery: (q: string) => void
  results: CardSearchResult[]
  isLoading: boolean
  error: string | null
  recentSearches: string[]
  clearRecentSearches: () => void
}

export function useSearch(workspaceId: string): UseSearchReturn {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<CardSearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recentSearches, setRecentSearches] = useState<string[]>(loadRecent)

  // Stable ref to avoid stale workspaceId in debounced callback
  const workspaceIdRef = useRef(workspaceId)
  useEffect(() => {
    workspaceIdRef.current = workspaceId
  }, [workspaceId])

  useEffect(() => {
    const trimmed = query.trim()

    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([])
      setError(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    const timer = setTimeout(async () => {
      try {
        const response = await searchApi.search(trimmed, workspaceIdRef.current)
        setResults(response.cards)
        saveRecent(trimmed)
        setRecentSearches(loadRecent())
      } catch (err) {
        setError((err as Error).message ?? "Search failed")
        setResults([])
      } finally {
        setIsLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query])

  const clearRecentSearches = useCallback(() => {
    try {
      localStorage.removeItem(RECENT_KEY)
    } catch {
      // ignore
    }
    setRecentSearches([])
  }, [])

  return { query, setQuery, results, isLoading, error, recentSearches, clearRecentSearches }
}
