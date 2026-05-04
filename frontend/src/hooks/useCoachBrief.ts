import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchCoachBrief,
  refreshCoachBrief,
  type CoachBriefResponse,
} from '../api/coach'
import { useLanguage } from '../contexts/LanguageContext'

// Phase 5.2: coach brief queries are language-keyed. Changing the language
// toggle in the masthead mutates the key and triggers a refetch automatically.
export const COACH_BRIEF_KEY_ROOT = ['coach', 'brief'] as const

/**
 * Fetches the latest brief for the currently selected language.
 *
 * Step 1 (today-runthrough): staleTime drops from 6h → 30min so a brief
 * regenerated server-side after a sync surfaces quickly. While the athlete
 * has trained today (`today_tss > 0`) but the post-ride review hasn't been
 * attached yet, we also refetch on window focus — this catches the case
 * where a sync completes in the background and the user tabs back in
 * expecting their recap.
 */
export function useCoachBrief() {
  const { language } = useLanguage()
  return useQuery<CoachBriefResponse>({
    queryKey: [...COACH_BRIEF_KEY_ROOT, language],
    queryFn: () => fetchCoachBrief(language),
    staleTime: 30 * 60 * 1000, // 30min — was 6h; brief now invalidated on sync
    gcTime: 12 * 60 * 60 * 1000,
    refetchOnWindowFocus: (query) => {
      // React Query v5 accepts a function returning boolean.
      const data = query.state.data as CoachBriefResponse | undefined
      if (!data) return false
      const evidence = (data.evidence ?? {}) as Record<string, unknown>
      const todayTssRaw = evidence['today_tss']
      const todayTss = typeof todayTssRaw === 'number' ? todayTssRaw : 0
      const reviewMissing = data.post_ride_review == null
      return reviewMissing && todayTss > 0
    },
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
 * Regeneration is language-scoped — the current language from context is used.
 */
export function useRefreshBrief() {
  const qc = useQueryClient()
  const { language } = useLanguage()
  return useMutation<CoachBriefResponse>({
    mutationFn: () => refreshCoachBrief(language),
    onSuccess: (data) => {
      qc.setQueryData([...COACH_BRIEF_KEY_ROOT, language], data)
    },
  })
}
