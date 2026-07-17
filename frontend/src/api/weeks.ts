import { apiClient } from './client'

export interface IntervalBlockOut {
  duration_seconds: number
  power_target_pct_ftp: number | null
  zone: number // 1..7
}

export interface DayPlan {
  date: string // ISO YYYY-MM-DD
  sport: string
  title: string
  template_id: string | null
  duration_seconds_target: number | null
  target_tss: number | null
  category: 'rest' | 'recovery' | 'endurance' | 'tempo' | 'sweet_spot' | 'threshold' | 'vo2'
  intervals: IntervalBlockOut[]
  rationale: string
  is_today: boolean
}

export interface MesoBlockContext {
  phase: string
  block_position: 'accumulation' | 'transmutation' | 'realization' | 'recovery'
  block_index_in_meso: number
  weekly_tss_target: number
  days_to_event: number | null
  target_event_type: string | null
}

// Projection — "where we can land" decision-support forecast.
export interface ProjectionPathPoint {
  date: string // ISO YYYY-MM-DD
  central: number
  p10: number  // 80% band lower
  p90: number  // 80% band upper
  p25: number  // 50% band lower
  p75: number  // 50% band upper
}

export interface ProjectionContext {
  mode: 'performance' | 'fitness' | 'insufficient'
  unit: string
  metric_label: string
  current_estimate: number | null
  projected_central: number | null
  band_50: [number, number] | null
  band_80: [number, number] | null
  path: ProjectionPathPoint[]
  projected_outcome: string
  caveat: string
}

// Readiness — green / amber / illness / overreaching signal.
export interface ReadinessContext {
  status: 'green' | 'amber' | 'illness' | 'overreaching' | 'unknown'
  reason: string
  suggest_easy: boolean
}

// Plan-changes — already-localized message surfacing skip/under/over + illness.
export interface PlanChangeItem {
  [key: string]: unknown
}

export interface PlanChangesContext {
  status: string
  message: string
  changes: PlanChangeItem[]
}

export interface WeekResponse {
  week_start: string
  week_end: string
  language: 'simple' | 'technical'
  preface: string
  meso_block: MesoBlockContext
  projection: ProjectionContext | null
  readiness: ReadinessContext | null
  plan_changes: PlanChangesContext | null
  days: DayPlan[]
}

export async function fetchCurrentWeek(
  language: 'simple' | 'technical',
  locale: 'en' | 'de' = 'en',
): Promise<WeekResponse> {
  const res = await apiClient.get<WeekResponse>('/weeks/current', { params: { language, locale } })
  return res.data
}
