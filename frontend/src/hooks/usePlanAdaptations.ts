import { useQuery } from '@tanstack/react-query'
import { fetchPlanAdaptations, type AdaptationFeed } from '../api/plan'

export const PLAN_ADAPTATIONS_KEY = ['plan', 'adaptations'] as const

/**
 * The live adaptation feed — powers the violet AdaptiveCard and the
 * "Was sich geändert hat" timeline. Newest-first; bilingual messages
 * (client picks message_de/message_en by locale).
 *
 * staleTime 15 min — the engine adapts at most a handful of times per day;
 * refetchOnWindowFocus so a morning re-open shows the overnight adaptation.
 */
export function usePlanAdaptations(days = 14, limit = 40) {
  return useQuery<AdaptationFeed>({
    queryKey: [...PLAN_ADAPTATIONS_KEY, days, limit],
    queryFn: () => fetchPlanAdaptations(days, limit),
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: (count, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status
      if (status !== undefined && [401, 403, 404, 409].includes(status)) return false
      return count < 2
    },
  })
}
