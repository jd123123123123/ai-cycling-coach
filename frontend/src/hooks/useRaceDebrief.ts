import { useQuery } from '@tanstack/react-query'
import { fetchActivityDebrief, type RaceDebrief } from '../api/debrief'
import { useLocale } from '../contexts/LocaleContext'

export function useRaceDebrief(activityId: number | undefined) {
  const { locale } = useLocale()
  return useQuery<RaceDebrief>({
    queryKey: ['activity-debrief', activityId, locale],
    queryFn: () => fetchActivityDebrief(activityId as number, locale),
    enabled: activityId != null,
  })
}
