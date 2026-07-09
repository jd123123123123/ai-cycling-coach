import { useQuery } from '@tanstack/react-query'
import { fetchRideComparison, type RideComparison } from '../api/compare'
import { useLocale } from '../contexts/LocaleContext'

export function useRideCompare(activityId: number | undefined) {
  const { locale } = useLocale()
  return useQuery<RideComparison | null>({
    queryKey: ['ride-compare', activityId, locale],
    queryFn: () => fetchRideComparison(activityId as number, locale),
    enabled: activityId != null,
  })
}
