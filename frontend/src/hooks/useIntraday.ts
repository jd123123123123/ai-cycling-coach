import { useQuery } from '@tanstack/react-query'
import { fetchIntraday, type IntradayDayResponse } from '../api/dashboard'

/** React Query hook: intraday body_battery + stress + hrv samples for a day.
 *
 * Cold path on server = up to ~10s (Garmin fetch). We set retry:0 to avoid
 * stacking multiple slow requests if the first one times out.
 */
export function useIntradayDay(iso: string | null) {
  return useQuery<IntradayDayResponse>({
    queryKey: ['intraday', iso],
    queryFn: () => fetchIntraday(iso!),
    enabled: iso != null,
    staleTime: 30 * 60 * 1000,  // 30 min — day data doesn't change after midnight
    retry: 0,
  })
}
