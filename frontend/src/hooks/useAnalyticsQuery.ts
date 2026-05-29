import { useQuery } from '@tanstack/react-query'
import { executeQuery } from '../api/analytics'
import type { QuerySpec } from '../types/chartSpec'

/**
 * Fetch the result of an analytics QuerySpec.
 * The query key includes the spec itself so two cards on the same dashboard
 * with different specs cache independently.
 */
export function useAnalyticsQuery(spec: QuerySpec | null, enabled = true) {
  return useQuery({
    queryKey: ['analytics', 'query', spec],
    queryFn: () => executeQuery(spec as QuerySpec),
    enabled: enabled && spec !== null,
    staleTime: 60_000, // analytics data updates on Garmin sync, not minute-by-minute
    gcTime: 5 * 60_000,
  })
}
