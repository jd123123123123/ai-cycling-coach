import { useQuery } from '@tanstack/react-query'
import { fetchActivityDebrief, type RaceDebrief } from '../api/debrief'

export function useRaceDebrief(activityId: number | undefined) {
  return useQuery<RaceDebrief>({
    queryKey: ['activity-debrief', activityId],
    queryFn: () => fetchActivityDebrief(activityId as number),
    enabled: activityId != null,
  })
}
