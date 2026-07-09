import { apiClient } from './client'

export interface DebriefHeader {
  title: string; date: string; sport: string
  distance_km: number; elevation_m: number; moving_time_s: number
  np_watts: number; if_: number | null; tss: number; total_kj: number; avg_speed_kmh: number
}
export interface DebriefVerdict {
  grade_letter: string; grade_score: number; ai_verdict: string; ai_model: string
  went_well: string[]; watch_out: string[]
}
export interface KeyMoment { kind: string; at_s: number; label: string; value: number; tone: string }
export interface RoutePoint { lat: number; lng: number; power: number | null; grade: number | null }
export interface DebriefStory {
  t: number[]; power: number[]; hr: (number | null)[]; wbal: number[]
  altitude: (number | null)[]; speed: (number | null)[]
  moments: KeyMoment[]; route: RoutePoint[]
}
export interface Segment {
  kind: string; start_s: number; end_s: number; duration_s: number
  distance_m: number; elev_gain_m: number; elev_loss_m: number
  avg_grade_pct: number; avg_power: number | null; avg_speed_ms: number | null
}
export interface Climb {
  start_s: number; duration_s: number; distance_m: number; elev_gain_m: number
  avg_grade_pct: number; vam_m_per_h: number; w_per_kg: number | null
  avg_power: number | null; category: string
}
export interface Pacing {
  first_half_np: number; second_half_np: number; split_pct: number
  variability_index: number | null; surge_count: number; phase_np: number[]
  final_30min_np: number | null; zone_time_pct: Record<string, number>
}
export interface EffortMatch {
  duration_s: number; ride_watts: number; best_watts: number | null
  pct_of_best: number | null; is_pr: boolean
}
export interface Efficiency {
  efficiency_factor: number | null; avg_hr: number | null
  decoupling_pct: number | null; np_watts: number
}
export interface Match { start_s: number; end_s: number; depth_j: number; min_bal_j: number }
export interface Matchbook {
  matches: Match[]; match_count: number; time_above_cp_s: number
  min_bal_j: number; fully_depleted: boolean
}
export interface Quadrant {
  q1_pct: number; q2_pct: number; q3_pct: number; q4_pct: number
  force_threshold_n: number; cadence_threshold_rpm: number; sample_count: number
}
export interface Fueling {
  total_kj: number; total_kcal: number; cho_g_estimate: number; fat_g_estimate: number
  carb_target_g_per_h: [number, number]; duration_h: number
  likely_underfueled: boolean | null; note: string
}
export interface WkoModel {
  mftp_watts: number; cp_watts: number; w_prime_j: number; frc_j: number
  pmax_watts: number; tte_s: number | null; vo2max_estimate: number | null; r_squared: number
}
export interface Cda { cda_m2: number; sample_count: number; avg_speed_ms: number }
export interface Prescription {
  priority: number; headline: string; race_tactic: string; training_fix: string; tone: string
}
export interface RaceDebrief {
  activity_id: number
  header: DebriefHeader
  verdict: DebriefVerdict
  story: DebriefStory | null
  segments: Segment[]
  climbs: Climb[]
  pacing: Pacing | null
  efforts: EffortMatch[]
  efficiency: Efficiency | null
  matchbook: Matchbook | null
  quadrant: Quadrant | null
  fueling: Fueling | null
  wko: WkoModel | null
  cda: Cda | null
  plan: Prescription[]
  generated_at: string | null
}

export async function fetchActivityDebrief(activityId: number, lang = 'en'): Promise<RaceDebrief> {
  const res = await apiClient.get<RaceDebrief>(`/analytics/activity-debrief/${activityId}`, {
    params: { lang },
  })
  return res.data
}
