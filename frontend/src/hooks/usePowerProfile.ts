import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client'

export interface PowerProfile {
  available: boolean
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
  return useQuery<PowerProfile>({
    queryKey: ['analytics', 'power-profile'],
    queryFn: async () => (await apiClient.get<PowerProfile>('/analytics/power-profile')).data,
  })
}
