import { useQuery } from '@tanstack/react-query'
import { fetchAdaptive, type AdaptiveDirective } from '../api/adaptive'
import { useLocale } from '../contexts/LocaleContext'

export function useAdaptive() {
  const { locale } = useLocale()
  return useQuery<AdaptiveDirective>({
    queryKey: ['coach', 'adaptive', locale],
    queryFn: () => fetchAdaptive(locale),
    staleTime: 10 * 60 * 1000,
  })
}
