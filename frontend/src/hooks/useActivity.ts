import { useQuery } from '@tanstack/react-query'
import { fetchActivity } from '../api/dashboard'
import type { ActivityRead } from '../api/dashboard'

/**
 * One ride, by id — including its route.
 *
 * `staleTime` is long because a finished ride does not change: its distance,
 * its elevation and the road it took are settled the moment it is ingested.
 * Re-fetching it on every focus would cost a request to be told the same thing.
 */
export function useActivity(id: number | undefined) {
  return useQuery<ActivityRead>({
    queryKey: ['activity', id],
    queryFn: () => fetchActivity(id as number),
    enabled: id != null && Number.isFinite(id),
    staleTime: 30 * 60 * 1000,
  })
}
