import { useQuery } from '@tanstack/react-query'
import { fetchActivityRhythm, type ActivityRhythm } from '../api/rhythm'

export const ACTIVITY_RHYTHM_KEY = ['activities', 'rhythm'] as const

/**
 * The three windows the Fahrten dock zooms between.
 *
 * `staleTime` is fifteen minutes: the answer only moves when a ride lands, and
 * this is asked on every Fahrten render. Nothing here is per-day-sensitive
 * enough to justify refetching on every focus.
 */
export function useActivityRhythm(opts: { enabled?: boolean } = {}) {
  return useQuery<ActivityRhythm>({
    queryKey: ACTIVITY_RHYTHM_KEY,
    queryFn: fetchActivityRhythm,
    staleTime: 15 * 60 * 1000,
    enabled: opts.enabled !== false,
  })
}
