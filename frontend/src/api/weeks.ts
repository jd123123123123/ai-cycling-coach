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

export interface WeekResponse {
  week_start: string
  week_end: string
  language: 'simple' | 'technical'
  preface: string
  meso_block: MesoBlockContext
  days: DayPlan[]
}

export async function fetchCurrentWeek(
  language: 'simple' | 'technical',
  locale: 'en' | 'de' = 'en',
): Promise<WeekResponse> {
  const res = await apiClient.get<WeekResponse>('/weeks/current', { params: { language, locale } })
  return res.data
}
