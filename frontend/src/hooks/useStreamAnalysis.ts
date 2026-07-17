import { useQuery } from '@tanstack/react-query'
import { fetchStreamAnalysis, type StreamAnalysis } from '../api/streamAnalysis'

/** Per-second stream-derived analysis for one activity (splits, HR zones, GPS,
 *  elevation, and running/cycling dynamics). Returns has_streams:false when the
 *  activity has no stored stream. */
export function useStreamAnalysis(activityId: number | string | undefined) {
  return useQuery<StreamAnalysis>({
    queryKey: ['stream-analysis', String(activityId)],
    queryFn: () => fetchStreamAnalysis(activityId!),
    enabled: activityId != null,
    staleTime: 5 * 60 * 1000,
  })
}
