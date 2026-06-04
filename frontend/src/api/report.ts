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
  radar: RadarAxis[]
  improvements: DeltaItem[]
  weaknesses: DeltaItem[]
  milestones: Milestone[]
  ai_verdict: string
  ai_model: string
}

export async function fetchPeriodReport(days: number): Promise<PeriodReport> {
  const res = await apiClient.get<PeriodReport>('/analytics/period-report', {
    params: { days },
  })
  return res.data
}
