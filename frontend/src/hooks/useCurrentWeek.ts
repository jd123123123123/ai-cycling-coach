import { useQuery } from '@tanstack/react-query'
import { fetchCurrentWeek, type WeekResponse } from '../api/weeks'
import { useLanguage } from './useLanguage'
import { useLocale } from '../contexts/LocaleContext'

// Phase 7.0: week plan queries are language-keyed — changing the language
// toggle fires a fresh fetch automatically (matching [05.2-01] cache pattern).
export const WEEK_CURRENT_KEY_ROOT = ['weeks', 'current'] as const

/**
 * Fetches the current 7-day planned week for the authenticated user.
 *
 * - staleTime: 30min — one adaptation per day max; plan doesn't change minute-to-minute.
 * - refetchOnWindowFocus: true — morning re-open should pull fresh plan if stale.
 * - 409/4xx short-circuit retry — UI in Plan 05 detects 409 and renders "set FTP first" CTA.
 * - Language-keyed: toggling language mode triggers a fresh fetch.
 */
export function useCurrentWeek() {
  const { language } = useLanguage()
  const { locale } = useLocale()
  return useQuery<WeekResponse>({
    queryKey: [...WEEK_CURRENT_KEY_ROOT, language, locale],
    queryFn: () => fetchCurrentWeek(language, locale),
    staleTime: 30 * 60 * 1000, // 30 min — research §3 "one adaptation per day max"
    refetchOnWindowFocus: true, // morning re-open should pull a fresh plan
    retry: (count, error) => {
      // Short-circuit on auth/permission/client errors — mirror App-level retry logic
      const status = (error as { response?: { status?: number } })?.response?.status
      if (status !== undefined && [401, 403, 404, 409].includes(status)) return false
      return count < 2
    },
  })
}
