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
 * Brief TTL is 6h; staleTime matches so we don't refetch on every mount.
 * The backend routes cache by language too, so a "miss" on a rarely-used
 * language still regenerates cleanly.
 */
export function useCoachBrief() {
  const { language } = useLanguage()
  return useQuery<CoachBriefResponse>({
    queryKey: [...COACH_BRIEF_KEY_ROOT, language],
    queryFn: () => fetchCoachBrief(language),
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
