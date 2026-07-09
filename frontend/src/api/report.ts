import { apiClient } from './client'

export interface RadarAxis {
  key: string
  label: string
  score: number | null
  insufficient_data: boolean
  detail: string
}

export interface DeltaItem {
  key: string
  label: string
  detail: string
  why: string
  delta: number
  unit: string
  direction: 'up' | 'down'
  is_improvement: boolean
}

export interface Milestone {
  icon_key: string
  label: string
  detail: string
}

export interface EvidenceChip {
  label: string
  value: string
  tone: string
}

export interface Cause {
  label: string
  severity: string
  evidence: string
}

export interface NextStep {
  headline: string
  detail: string
  tone: string
}

export interface Prescription {
  priority: number
  headline: string
  detail: string
  effect: string
  tone: string
  icon_key: string
}

export interface IntensityMix {
  z1_pct: number
  z2_pct: number
  z3_pct: number
  model: string
  target_model: string
  aligned: boolean
  verdict: string
  fix: string | null
  sample_rides: number
}

export interface LoadDynamics {
  ramp_per_week: number | null
  monotony: number | null
  strain: number | null
  flag: string
  note: string
}

export interface Trajectory {
  days_to_goal: number | null
  ctl_now: number
  ctl_7d_delta: number
  ctl_projected_at_goal: number
  ctl_target: number | null
  tsb_projected_at_goal: number
  taper_window: string
  on_track: string
  weekly_tss_required: number
  weekly_tss_actual: number
  narrative: string
}

export interface PeriodReport {
  days: number
  start_date: string
  end_date: string
  prev_start_date: string
  prev_end_date: string
  has_baseline: boolean
  grade_letter: string | null
  grade_score: number | null
  grade_delta: number | null
  grade_percentile: number | null
  composite_trend: number[]
  evidence: EvidenceChip[]
  causes: Cause[]
  next_step: NextStep | null
  prescriptions: Prescription[]
  intensity: IntensityMix | null
  load_dynamics: LoadDynamics | null
  trajectory: Trajectory | null
  radar: RadarAxis[]
  improvements: DeltaItem[]
  weaknesses: DeltaItem[]
  milestones: Milestone[]
  ai_verdict: string
  ai_model: string
  lang?: string
}

export async function fetchPeriodReport(days: number, lang = 'en'): Promise<PeriodReport> {
  const res = await apiClient.get<PeriodReport>('/analytics/period-report', {
    params: { days, lang },
  })
  return res.data
}
