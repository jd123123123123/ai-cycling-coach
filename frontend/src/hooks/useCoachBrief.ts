import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchCoachBrief,
  refreshCoachBrief,
  type CoachBriefResponse,
} from '../api/coach'

export const COACH_BRIEF_KEY = ['coach', 'brief'] as const

/**
 * Fetches the latest brief (cache + fallback aware on the backend).
 * Brief TTL is 6h; staleTime matches so we don't refetch on every mount.
 */
export function useCoachBrief() {
  return useQuery<CoachBriefResponse>({
    queryKey: COACH_BRIEF_KEY,
    queryFn: fetchCoachBrief,
    staleTime: 6 * 60 * 60 * 1000, // 6h — matches backend cache TTL
    gcTime: 12 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    // Brief endpoint always returns 200 (rule-based fallback). If it still 5xx'd,
    // retry once; 401 handled by the axios interceptor.
    retry: (failureCount, error: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (error as any)?.response?.status
      if (status === 401 || status === 403) return false
      return failureCount < 1
    },
  })
}

/**
 * Force-regenerates the brief and replaces the cache with the fresh response.
 */
export function useRefreshBrief() {
  const qc = useQueryClient()
  return useMutation<CoachBriefResponse>({
    mutationFn: refreshCoachBrief,
    onSuccess: (data) => {
      qc.setQueryData(COACH_BRIEF_KEY, data)
    },
  })
}
