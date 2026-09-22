import { useQuery } from '@tanstack/react-query'
import { fetchActivitiesRange, type ActivityListResponse } from '../api/dashboard'

export function useActivitiesRange(start: Date, end: Date) {
  return useQuery<ActivityListResponse>({
    queryKey: ['activities', start.toDateString(), end.toDateString()],
    queryFn: () => fetchActivitiesRange(start, end),
    // Activity windows are refreshed explicitly after Garmin sync. Keeping a
    // resolved window warm avoids duplicate range requests when Today, Plan
    // and Fahrten are opened in quick succession.
    staleTime: 5 * 60 * 1000,
  })
}
