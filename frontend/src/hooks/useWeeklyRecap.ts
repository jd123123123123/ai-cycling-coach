import { useQuery } from '@tanstack/react-query'
import { fetchWeeklyRecap, type WeeklyRecap } from '../api/weeklyRecap'
import { useLocale } from '../contexts/LocaleContext'

/**
 * Last completed week (Mon–Sun) — totals vs. the week before, plan-vs-actual,
 * CTL movement, breakthroughs, best ride, streak.
 *
 * `locale` only picks the language of the server-written breakthrough copy;
 * every number is locale-independent. Callers that render a single-language
 * surface (the W3 screens are German) pass it explicitly rather than letting an
 * English chrome setting drop an English sentence into German copy.
 *
 * The window only rolls over at midnight on Monday, so a long staleTime is
 * correct: refetching on every focus would burn a PMC + breakthrough pass for a
 * payload that cannot change within the day.
 */
export function useWeeklyRecap(opts: { enabled?: boolean; locale?: 'en' | 'de' } = {}) {
  const { locale: uiLocale } = useLocale()
  const locale = opts.locale ?? uiLocale
  return useQuery<WeeklyRecap>({
    queryKey: ['analytics', 'weekly-recap', locale],
    queryFn: () => fetchWeeklyRecap(locale),
    enabled: opts.enabled ?? true,
    staleTime: 60 * 60 * 1000,
    retry: false,
  })
}
