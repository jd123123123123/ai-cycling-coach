import { useQuery } from '@tanstack/react-query'
import { fetchActivityDebrief, type RaceDebrief } from '../api/debrief'
import { useLocale } from '../contexts/LocaleContext'

export function useRaceDebrief(activityId: number | undefined) {
  const { locale } = useLocale()
  return useQuery<RaceDebrief>({
    queryKey: ['activity-debrief', activityId, locale],
    queryFn: () => fetchActivityDebrief(activityId as number, locale),
    enabled: activityId != null,
    // A past ride's debrief is immutable — cache it per-activity so navigating
    // away and reopening the ride serves instantly with no refetch/spinner.
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
  })
}
