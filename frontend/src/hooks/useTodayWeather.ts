import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient } from '../api/client'

export interface WeatherHour {
  time: string // athlete-local ISO hour, e.g. "2026-07-20T16:00"
  temp_c: number | null
  precip_prob: number | null
  wind_kmh: number | null
  wind_dir_deg: number | null
  wind_gust_kmh?: number | null
  is_day?: boolean | null
  code: number | null // WMO weather code
}

export interface TodayWeather {
  available: boolean
  location: { lat: number; lng: number } | null
  timezone: string | null
  hours: WeatherHour[]
  location_source?: 'device'
}

/**
 * Today's hourly forecast at the device location, after permission.
 * Server-side cached per location+hour (audit weather rule); on failure the
 * endpoint answers {available:false} and consumers render nothing — never a
 * broken chip.
 */
export function useTodayWeather() {
  const [granted, setGranted] = useState(false)
  const [denied, setDenied] = useState(false)
  const previouslyGranted = useRef(false)
  useEffect(() => {
    let alive = true
    let permission: PermissionStatus | undefined
    const change = () => { if (alive && permission) { setGranted(permission.state === 'granted'); setDenied(permission.state === 'denied' || (previouslyGranted.current && permission.state !== 'granted')); previouslyGranted.current = permission.state === 'granted' } }
    navigator.permissions?.query({ name: 'geolocation' }).then(result => {
      if (!alive) return
      permission = result
      change()
      result.addEventListener('change', change)
    }).catch(() => {})
    return () => { alive = false; permission?.removeEventListener('change', change) }
  }, [])
  const position = useQuery({
    queryKey: ['weather', 'device-position'],
    queryFn: async () => {
      const result = await readWeatherPosition()
      setGranted(true)
      setDenied(false)
      previouslyGranted.current = true
      return result
    },
    enabled: granted,
    staleTime: 5 * 60 * 1000,
    refetchInterval: granted ? 5 * 60 * 1000 : false,
    retry: false,
    gcTime: 0,
  })
  const coords = position.isError || denied ? undefined : position.data
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const forecast = useQuery<TodayWeather>({
    queryKey: ['weather', 'here', coords?.lat, coords?.lng, timezone],
    queryFn: async () => (await apiClient.post<TodayWeather>('/weather/here', { ...coords, timezone })).data,
    enabled: !!coords,
    staleTime: 30 * 60 * 1000,
    retry: false,
  })
  const requestLocation = useCallback(() => {
    void position.refetch().then(result => {
      if (!result.isError && result.data && coords && result.data.lat === coords.lat && result.data.lng === coords.lng) void forecast.refetch()
    })
  }, [position.refetch, forecast.refetch, coords])
  return { ...forecast, data: coords ? forecast.data : undefined,
    locationState: position.isFetching ? 'locating' as const : position.isError || denied ? 'error' as const : coords ? forecast.isPending ? 'loading' as const : 'ready' as const : 'idle' as const,
    requestLocation,
  }
}

/** Only the rounded area leaves the device; nothing is persisted locally. */
export function readWeatherPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Standort nicht verfügbar'))
    navigator.geolocation.getCurrentPosition(position => resolve({
      lat: Math.round(position.coords.latitude * 100) / 100,
      lng: Math.round(position.coords.longitude * 100) / 100,
    }), reject, { enableHighAccuracy: false, maximumAge: 60_000, timeout: 12_000 })
  })
}
