import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { authApi, type AuthUser } from "../api/auth"

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isLoading: boolean
  isAuthenticated: boolean
}

interface AuthContextValue extends AuthState {
  setTokenAndUser: (token: string, user: AuthUser) => void
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Access token lives in memory only — never localStorage (XSS risk)
let inMemoryToken: string | null = null

export function getAccessToken(): string | null {
  return inMemoryToken
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    isLoading: true,
    isAuthenticated: false,
  })
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Stable ref to always point at the current `refresh` function, avoiding stale-closure
  // issues when scheduling the auto-refresh timer inside `setTokenAndUser`.
  const refreshRef = useRef<() => Promise<void>>(() => Promise.resolve())

  const scheduleRefresh = useCallback((expiresInMs: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    // Refresh 60 seconds before expiry
    const delay = Math.max(expiresInMs - 60_000, 5_000)
    refreshTimerRef.current = setTimeout(() => refreshRef.current(), delay)
  }, [])

  const setTokenAndUser = useCallback(
    (token: string, user: AuthUser) => {
      inMemoryToken = token
      setState({ user, accessToken: token, isLoading: false, isAuthenticated: true })
      // Access tokens are 15 min; schedule silent refresh at 14 min
      scheduleRefresh(14 * 60 * 1000)
    },
    [scheduleRefresh]
  )

  const refresh = useCallback(async () => {
    try {
      const data = await authApi.refresh()
      setTokenAndUser(data.accessToken, data.user)
    } catch {
      inMemoryToken = null
      setState({ user: null, accessToken: null, isLoading: false, isAuthenticated: false })
    }
  }, [setTokenAndUser])

  // Keep refreshRef in sync with the latest `refresh` so the timer always calls the current closure
  refreshRef.current = refresh

  const logout = useCallback(async () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    try {
      await authApi.logout()
    } finally {
      inMemoryToken = null
      setState({ user: null, accessToken: null, isLoading: false, isAuthenticated: false })
    }
  }, [])

  // On mount: attempt silent refresh using the httpOnly cookie.
  // Intentionally omits `refresh` from deps — this effect runs once on mount only.
  // `refresh` identity changes each render, but re-running the effect would cause
  // an infinite loop. The refreshRef pattern ensures the timer always calls the latest version.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    refresh()
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, setTokenAndUser, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}
