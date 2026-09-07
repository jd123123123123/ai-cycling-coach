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
    retry: (failureCount, error: unknown) => {
      // 404 IS AN ANSWER, NOT A GLITCH. The endpoint returns it for any ride
      // with no power stream — on a rider without a power meter that is nearly
      // every ride — so the default three retries were three round-trips that
      // could only ever be told the same thing, and each one kept the caller in
      // `isPending` a little longer. 401/403 are equally settled.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (error as any)?.response?.status
      if (status === 401 || status === 403 || status === 404) return false
      return failureCount < 1
    },
  })
}
