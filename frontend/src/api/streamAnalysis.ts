import { apiClient } from './client'

export interface StreamSplit {
  km: number
  pace_s_per_km: number
  avg_hr: number | null
  elev_delta_m: number | null
  partial?: boolean
}

export interface RunDynamics {
  cadence_spm: number | null
  vertical_oscillation_mm: number | null
  ground_contact_ms: number | null
  vertical_ratio_pct: number | null
  stride_length_cm: number | null
  gap_pace_s_per_km: number | null
}

export interface BikeDynamics {
  balance_left_pct: number | null
  balance_right_pct: number | null
  pco_left_mm: number | null
  pco_right_mm: number | null
  power_phase_left: [number | null, number | null] | null
  power_phase_right: [number | null, number | null] | null
  stamina_start_pct: number | null
  stamina_end_pct: number | null
  stamina_min_pct: number | null
  stamina_curve: number[] | null
  performance_condition: number | null
}

export interface StreamAnalysis {
  has_streams: boolean
  sport: 'cycling' | 'running' | 'gym'
  duration_s?: number
  avg_hr?: number | null
  max_hr?: number | null
  hr_zones?: { secs: number[]; max_hr: number } | null
  splits?: StreamSplit[]
  elevation?: { profile: number[]; gain_m: number; min_m: number; max_m: number } | null
  gps?: {
    polyline: [number, number][]
    bounds: { min_lat: number; max_lat: number; min_lng: number; max_lng: number }
    start: [number, number]
    point_count: number
  } | null
  avg_speed_ms?: number | null
  avg_cadence?: number | null
  avg_power?: number | null
  run_dynamics?: RunDynamics
  bike_dynamics?: BikeDynamics
  weather?: unknown
  has_gps_flag?: boolean
  route_kind?: 'zwift' | 'rouvy' | 'outdoor' | 'indoor'
}

export async function fetchStreamAnalysis(activityId: number | string): Promise<StreamAnalysis> {
  const res = await apiClient.get<StreamAnalysis>(`/activities/${activityId}/stream-analysis`)
  return res.data
}
