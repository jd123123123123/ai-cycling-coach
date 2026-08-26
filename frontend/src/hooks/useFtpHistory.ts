import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client'

/**
 * The athlete's threshold over time — every measurement the app has kept, oldest
 * first, plus whatever is current.
 *
 * `/athletes/me/ftp/history` has existed since long before anything drew it;
 * `InsightsSection` reads it inline to print one delta. The Erfolge opening is
 * the first screen that draws the whole series, so the read moves into a hook
 * on a shared key rather than a second inline copy that can drift from the
 * first.
 *
 * An hour of staleTime because a threshold changes when a test or an estimate
 * lands, which is weeks apart — not on the cadence a screen is opened.
 */
export interface FtpHistoryEntry {
  ftp_watts: number
  measured_at: string
  source: string
}

export interface FtpHistory {
  current_ftp: number | null
  history: FtpHistoryEntry[]
}

export const FTP_HISTORY_KEY = ['ftp', 'history'] as const

export function useFtpHistory() {
  return useQuery<FtpHistory>({
    queryKey: FTP_HISTORY_KEY,
    queryFn: async () =>
      (await apiClient.get<FtpHistory>('/athletes/me/ftp/history')).data,
    staleTime: 60 * 60 * 1000,
  })
}
