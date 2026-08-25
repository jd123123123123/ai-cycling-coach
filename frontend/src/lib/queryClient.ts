import { QueryClient } from '@tanstack/react-query'
import { hydratePersistedQueries } from './queryPersist'

// Retry is 0 for 401s to avoid racing the axios 401 interceptor's refresh queue.
// For other errors we allow 1 retry with exponential backoff.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,         // 1 minute — dashboard data is not real-time
      // ── Why 30 minutes and not 5 ──────────────────────────────────────
      // gcTime is NOT a freshness setting. It only decides how long an entry
      // with no observers survives before being thrown away; `staleTime`
      // alone decides when the data is re-fetched, and it is untouched here.
      // So every query still revalidates on exactly the schedule it did
      // before. What changes is the SECOND visit to a screen: at 5 minutes,
      // stepping away from Today for six minutes evicted its cache, so
      // coming back re-entered the "no data yet" branch and the screen
      // blocked on a full-screen loader. At 30 minutes it paints the data it
      // already had — immediately — while the refetch that would have run
      // anyway lands underneath and swaps in the fresh numbers. A rider never
      // sees older data than they'd have seen; they just stop seeing a
      // spinner in front of data the app is holding. Anything genuinely
      // time-sensitive stays honest through its own means (readinessGate
      // dates the MEASUREMENT, not the cache entry).
      gcTime: 30 * 60_000,       // 30 minutes — retention only; see above

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

// Yesterday's answers, back before the first render. Module scope on purpose:
// hydrating from an effect would paint the empty state first, which is the
// exact wait this exists to remove. See `queryPersist` for what is kept.
hydratePersistedQueries(queryClient)
