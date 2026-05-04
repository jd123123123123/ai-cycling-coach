import { useQuery } from '@tanstack/react-query'
import {
  fetchTodaySnapshot,
  type TodaySnapshotResponse,
} from '../api/dashboard'

// Step 6 (today-runthrough): wake → now biometrics for the hero. Backend
// caches for 15min server-side; we keep the client cache short (5min) so a
// tab refocus catches a freshly-recomputed snapshot promptly. Garmin's own
// body-battery samples land at ~3min granularity with a ~5–10min publish
// lag — staleTime any shorter just burns requests for no signal.
export const TODAY_SNAPSHOT_KEY = ['daily-metrics', 'today', 'snapshot'] as const

export function useTodaySnapshot() {
  return useQuery<TodaySnapshotResponse>({
    queryKey: TODAY_SNAPSHOT_KEY,
    queryFn: fetchTodaySnapshot,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: (failureCount, error: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (error as any)?.response?.status
      if (status === 401 || status === 403) return false
      return failureCount < 1
    },
  })
}

export type { TodaySnapshotResponse, WakeNowPair } from '../api/dashboard'
