import { useQuery } from '@tanstack/react-query'
import { fetchMorningHealthCheck, type MorningHealthCheck } from '../api/health'
import { useLocale } from '../contexts/LocaleContext'

export type { MorningHealthCheck }

export const MORNING_HEALTH_KEY = ['health', 'morning-check'] as const

export function useMorningHealthCheck() {
  const { locale } = useLocale()
  return useQuery<MorningHealthCheck>({
    queryKey: [...MORNING_HEALTH_KEY, locale],
    queryFn: () => fetchMorningHealthCheck(locale),
    staleTime: 30 * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    retry: (failureCount, error: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (error as any)?.response?.status
      if (status === 401 || status === 403) return false
      return failureCount < 1
    },
  })
}
