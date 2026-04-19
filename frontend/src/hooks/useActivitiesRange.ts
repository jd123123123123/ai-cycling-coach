import { useQuery } from '@tanstack/react-query'
import { fetchActivitiesRange, type ActivityListResponse } from '../api/dashboard'

export function useActivitiesRange(start: Date, end: Date) {
  return useQuery<ActivityListResponse>({
    queryKey: ['activities', start.toDateString(), end.toDateString()],
    queryFn: () => fetchActivitiesRange(start, end),
  })
}
