import { useQuery } from '@tanstack/react-query'
import { fetchEventWeather, type EventWeather } from '../api/crewEvents'

/**
 * Ride weather for a planned crew event. Long staleTime because a forecast for
 * a specific window does not meaningfully change minute to minute, and this is
 * decoration on a page whose primary content (route, who's coming, join) must
 * never wait on it. Failures are swallowed by the caller rendering nothing.
 */
export function useCrewEventWeather(eventId: number | undefined) {
  return useQuery<EventWeather>({
    queryKey: ['crew-event-weather', eventId],
    queryFn: () => fetchEventWeather(eventId as number),
    enabled: eventId != null && Number.isFinite(eventId),
    staleTime: 30 * 60 * 1000,
    retry: 1,
  })
}
