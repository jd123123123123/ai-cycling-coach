import { useQuery } from '@tanstack/react-query'
import { fetchAdaptive, type AdaptiveDirective, type DailyDecision } from '../api/adaptive'
import { useLocale } from '../contexts/LocaleContext'

export type { DailyDecision }

export function useAdaptive() {
  const { locale } = useLocale()
  return useQuery<AdaptiveDirective>({
    queryKey: ['coach', 'adaptive', locale],
    queryFn: () => fetchAdaptive(locale),
    staleTime: 10 * 60 * 1000,
  })
}

/** The ONE Daily Decision (audit P0-3), carried on GET /coach/adaptive.
 * Surfaces render this FIRST; readiness copy is subordinate to it. */
export function useDailyDecision(): { decision: DailyDecision | null; isLoading: boolean } {
  const { data, isLoading } = useAdaptive()
  return { decision: data?.daily_decision ?? null, isLoading }
}
