import { apiClient } from './client'

export interface MorningHealthSignal {
  metric: 'resting_hr' | 'hrv' | 'respiration' | 'spo2' | 'sleep_score'
  value: number
  baseline: number | null
  direction: 'up' | 'down'
  delta: number | null
  unit: string
  severity: 'mild' | 'strong'
  series: number[]
  /** Whether this marker is part of why a warning fired. Every MEASURED marker
   *  now arrives, not only the deviating ones — so this is what separates "here
   *  for context" from "here because something is off". Optional because a
   *  cached response from before the field existed simply reads as false. */
  triggered?: boolean
}

export interface MorningHealthCheck {
  level: 'none' | 'watch' | 'elevated' | 'high'
  polarity: 'warning' | 'opportunity' | null
  signals: MorningHealthSignal[]
  headline: string | null
  recommendation: string | null
}

/** Morning-health early-warning (illness / significant-downturn cluster).
 *  `level === 'none'` → the frontend renders nothing (honest empty). */
export async function fetchMorningHealthCheck(
  locale: 'en' | 'de' = 'en',
): Promise<MorningHealthCheck> {
  const res = await apiClient.get<MorningHealthCheck>('/health/morning-check', {
    params: { locale },
  })
  return res.data
}
