import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client'

export interface WeatherHour {
  time: string // athlete-local ISO hour, e.g. "2026-07-20T16:00"
  temp_c: number | null
  precip_prob: number | null
  wind_kmh: number | null
  wind_dir_deg: number | null
  code: number | null // WMO weather code
}

export interface TodayWeather {
  available: boolean
  location: { lat: number; lng: number } | null
  timezone: string | null
  hours: WeatherHour[]
}

/**
 * Today's hourly forecast at the athlete's riding location (last GPS ride).
 * Server-side cached per location+hour (audit weather rule); on failure the
 * endpoint answers {available:false} and consumers render nothing — never a
 * broken chip.
 */
export function useTodayWeather() {
  return useQuery<TodayWeather>({
    queryKey: ['weather', 'today'],
    queryFn: async () => (await apiClient.get<TodayWeather>('/weather/today')).data,
    staleTime: 30 * 60 * 1000,
    retry: false,
  })
}
