import { QueryClient } from "@tanstack/react-query"

function isNonRetryable(error: unknown): boolean {
  // axiosInstance rewraps backend errors into a plain Error with `.original`,
  // so the HTTP status may live on either the error itself or `.original`.
  const withStatus = error as {
    response?: { status?: number }
    original?: { response?: { status?: number } }
  }
  const status = withStatus?.response?.status ?? withStatus?.original?.response?.status
  return typeof status === "number" && status >= 400 && status < 500
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (count, error) => !isNonRetryable(error) && count < 2,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: { retry: 0 },
  },
})
