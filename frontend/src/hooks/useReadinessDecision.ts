import { useQuery } from '@tanstack/react-query'
import {
  fetchReadinessDecision,
  type ReadinessDecision,
} from '../api/readinessDecision'
import { useLocale } from '../contexts/LocaleContext'
import { localDayKey } from '../utils/loadMetrics'

/**
 * useReadinessDecision — today's decision and the measurement behind it.
 *
 * Re-exported so a surface can type against the payload without reaching into
 * `api/` itself.
 */
export type { ReadinessDecision }

export const READINESS_DECISION_KEY_ROOT = ['readiness', 'decision'] as const

/**
 * THE CACHE MUST NOT OUTLIVE THE DAY IT DESCRIBES.
 *
 * Everything this endpoint returns is scoped to one athlete-local date: the
 * session, its counterfactual, the ages on every input. A response cached at
 * 23:50 and served at 00:10 would present yesterday's decision — and, worse,
 * yesterday's *ages*, so a reading that had just become two days old would
 * still print "gemessen gestern". The staleTime is therefore capped at the
 * local midnight following the fetch, exactly as `useCoachBrief` caps the
 * brief, and a window focus after the day has rolled forces a refetch.
 *
 * Inside the day it is cheap to be patient: the decision only moves when an
 * overnight sync lands, so 15 minutes is generous rather than stingy.
 */
export function useReadinessDecision() {
  const { locale } = useLocale()
  return useQuery<ReadinessDecision>({
    queryKey: [...READINESS_DECISION_KEY_ROOT, locale],
    queryFn: () => fetchReadinessDecision(locale),
    staleTime: (query) => {
      const fetchedMs = query.state.dataUpdatedAt
      if (!fetchedMs) return 0
      const fetched = new Date(fetchedMs)
      const nextLocalMidnight = new Date(
        fetched.getFullYear(),
        fetched.getMonth(),
        fetched.getDate() + 1,
      ).getTime()
      return Math.min(15 * 60 * 1000, Math.max(0, nextLocalMidnight - fetchedMs))
    },
    gcTime: 12 * 60 * 60 * 1000,
    refetchOnWindowFocus: (query) => {
      const fetchedMs = query.state.dataUpdatedAt
      if (!fetchedMs) return false
      return localDayKey(new Date(fetchedMs)) !== localDayKey(new Date())
    },
    retry: (failureCount, error: unknown) => {
      // An expired session is not a transient failure — retrying it just
      // delays the redirect the auth layer is already performing.
      const status = (error as { response?: { status?: number } } | null)
        ?.response?.status
      if (status === 401 || status === 403) return false
      return failureCount < 1
    },
  })
}
