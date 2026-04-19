import { QueryClient } from '@tanstack/react-query'

// Retry is 0 for 401s to avoid racing the axios 401 interceptor's refresh queue.
// For other errors we allow 1 retry with exponential backoff.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,         // 1 minute — dashboard data is not real-time
      gcTime: 5 * 60_000,        // 5 minutes
      refetchOnWindowFocus: false,
      retry: (failureCount, error: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status = (error as any)?.response?.status
        if (status === 401 || status === 403 || status === 404) return false
        return failureCount < 1
      },
    },
    mutations: {
      retry: false,
    },
  },
})
