import { useQuery } from '@tanstack/react-query'
import { useLocale } from '../contexts/LocaleContext'
import { apiClient } from '../api/client'

export interface PowerProfile {
  available: boolean
  /** THE canonical display threshold (audit P0-1): manual FTP when set, else
   *  the sanitized model eFTP. Every power surface renders THIS number. */
  threshold_watts?: number | null
  threshold_source?: 'manual' | 'model' | null
  /** Whether CP/W′ ("model details") may be shown at all. False when a manual
   *  FTP exists and the model disagrees with it by more than 10%. */
  model_valid?: boolean
  /** 0–1 confidence in the modeled threshold (fit quality × data richness). */
  confidence?: number
  cp_watts?: number
  w_prime_j?: number
  eftp_watts?: number
  cp_wkg?: number | null
  n_rides?: number
  r_squared?: number
  total_kj?: number
  /** Best power (W) at each duration (seconds) across all rides. */
  mmp_curve?: Record<string, number>
  /** Watts per kg at each duration (when body weight is known). */
  wkg_curve?: Record<string, number> | null
  /** Headline peak power (W) at 5/60/300/1200 s. */
  peaks?: Record<string, number>
  peaks_wkg?: Record<string, number> | null
  /** Fatigue resistance: power drop after 1500 kJ (best/avg %). */
  durability_best_pct?: number | null
  durability_avg_pct?: number | null
  avg_decoupling_pct?: number | null
  /** Rider-type phenotype from the curve shape (Coggan power profiling). */
  phenotype?: {
    type: string
    note: string
    reserves: { neuromuscular_x: number; anaerobic_x: number; vo2_x: number }
  } | null
  /** Per-ride science breakdown (most granular view). */
  rides?: Array<{
    activity_id: number
    date: string | null
    title: string | null
    np_watts: number | null
    total_kj: number | null
    decoupling_pct: number | null
    durability_pct: number | null
    cp_watts: number | null
    wbal_min_kj: number | null
    depleted: boolean | null
  }>
}

export function usePowerProfile() {
  const { locale } = useLocale()
  return useQuery<PowerProfile>({
    queryKey: ['analytics', 'power-profile', locale],
    queryFn: async () => (await apiClient.get<PowerProfile>(`/analytics/power-profile?lang=${locale}`)).data,
  })
}

/** GET /analytics/ride-counts — the ONE honest denominator per surface
 *  (audit P0-5): cycling-only totals for "N rides", "N rides with power",
 *  "N GPS rides". The three may legitimately differ; each label must state
 *  which one it uses. */
export interface RideCounts {
  total_rides: number
  rides_with_power: number
  rides_with_gps: number
}

export function useRideCounts() {
  return useQuery<RideCounts>({
    queryKey: ['analytics', 'ride-counts'],
    queryFn: async () => (await apiClient.get<RideCounts>('/analytics/ride-counts')).data,
    staleTime: 30 * 60 * 1000,
  })
}
