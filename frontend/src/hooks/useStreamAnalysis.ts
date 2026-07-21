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
    // A past activity's stored streams are immutable — cache per-activity so
    // reopening a ride's recap/analysis is instant (no refetch, no flash).
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
  })
}
