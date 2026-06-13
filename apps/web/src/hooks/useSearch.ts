import { useState, useEffect, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
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
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [recentSearches, setRecentSearches] = useState<string[]>(loadRecent)

  const trimmed = query.trim()

  // Debounce the raw input into debouncedQuery — no fetch here (the query owns it).
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(trimmed), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [trimmed])

  const debouncedTrimmed = debouncedQuery.trim()
  const enabled = debouncedTrimmed.length >= MIN_QUERY_LENGTH

  const searchQuery = useQuery({
    queryKey: ["search", workspaceId, debouncedTrimmed],
    queryFn: () => searchApi.search(debouncedTrimmed, workspaceId),
    enabled,
    staleTime: 30_000,
  })

  // Persist recent searches after a successful fetch (React Query v5 has no onSuccess).
  useEffect(() => {
    if (searchQuery.isSuccess && enabled) {
      saveRecent(debouncedTrimmed)
      setRecentSearches(loadRecent())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery.isSuccess, searchQuery.dataUpdatedAt])

  // Below the minimum length → no results, no error, not loading (empty handling).
  const results: CardSearchResult[] = trimmed.length < MIN_QUERY_LENGTH ? [] : (searchQuery.data?.cards ?? [])
  // Loading from the first keystroke (while debouncing) through fetch completion.
  const isLoading = trimmed.length >= MIN_QUERY_LENGTH && (debouncedTrimmed !== trimmed || searchQuery.isFetching)
  const error = searchQuery.isError ? ((searchQuery.error as Error).message ?? "Search failed") : null

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
