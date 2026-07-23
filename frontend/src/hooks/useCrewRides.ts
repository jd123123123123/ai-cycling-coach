import { useQuery } from '@tanstack/react-query'
import { fetchCrewRides, type CrewRide } from '../api/crewRides'

// All-crew rides feed — every crew member's recent activities, newest
// first. Not in a crew → 403/404, which we don't retry.

export function useCrewRides(limit = 20) {
  return useQuery<CrewRide[]>({
    queryKey: ['crew', 'rides', limit],
    queryFn: () => fetchCrewRides(limit),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
    retry: (failureCount, error: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (error as any)?.response?.status
      if (status === 401 || status === 403 || status === 404) return false
      return failureCount < 1
    },
  })
}
