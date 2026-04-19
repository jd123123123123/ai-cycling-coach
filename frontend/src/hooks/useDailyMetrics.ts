import { useQuery } from '@tanstack/react-query'
import { fetchDailyMetrics, type DailyMetricListResponse } from '../api/dashboard'

export function useDailyMetrics(start: Date, end: Date) {
  return useQuery<DailyMetricListResponse>({
    queryKey: ['daily-metrics', start.toDateString(), end.toDateString()],
    queryFn: () => fetchDailyMetrics(start, end),
  })
}
