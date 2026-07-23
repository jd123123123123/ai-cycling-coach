import { apiClient } from './client'

export interface IntervalBlockOut {
  duration_seconds: number
  power_target_pct_ftp: number | null
  zone: number // 1..7
  // Structured-set fields (composite on/off blocks, Jul 2026): a "30×15/45s"
  // set is ONE row for load purposes but physically reps × (on_s @
  // power_target_pct_ftp + off_s @ off_pct_ftp). All absent/null for steady
  // blocks — additive, older payloads simply omit them.
  reps?: number | null
  on_s?: number | null
  off_s?: number | null
  off_pct_ftp?: number | null
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
  // Dual-sport: a same-day session in the OTHER sport (e.g. an easy run or a
  // strength session on a bike day). Compact — title + planned TSS so the
  // week list can render it as a visible line item instead of silently
  // dropping its load (usability audit P0-5).
  secondary_title: string | null
  secondary_target_tss: number | null
}

export interface MesoBlockContext {
  phase: string
  block_position: 'accumulation' | 'transmutation' | 'realization' | 'recovery'
  block_index_in_meso: number
  weekly_tss_target: number
  days_to_event: number | null
  target_event_type: string | null
  // Why the delivered week can start below the declared hours (CTL ramp).
  hours_note: { declared_hours: number; start_hours: number; reason: string; de: string; en: string } | null
  // No-event fitness-builder horizon — replaces the "— weeks left" dash.
  progression: { mode: string; horizon_weeks: number; start_ctl: number; target_ctl: number } | null
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
  samples_used: number
  // 0–100 band-tightness × sample-richness score. < 30 ⇒ the UI must render a
  // RANGE, not a point (audit P0-1). Optional: the backend Projection schema
  // does not pass it through yet — consumers derive it from band_80 +
  // samples_used when absent.
  confidence_pct?: number
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

// Yesterday's planned bike ride that went unridden — null when yesterday was a
// planned rest day, was ridden, or had no plan. The authoritative outcome
// (reflowed to a free day / absorbed with no make-up) lives in the adaptation
// feed (GET /plan/adaptations), keyed by evidence.missed_date.
export interface MissedRide {
  date: string // ISO YYYY-MM-DD
  title: string
  title_de: string | null
  target_tss: number | null
  template_id: string | null
  category: string
  is_quality: boolean
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
  // THE weekly planned-TSS number to render as the week's target: sum of ALL
  // planned rows Mon–Sun INCLUDING dual-sport shadowed secondary sessions.
  // meso_block.weekly_tss_target remains advisory-only (the generator's
  // budget), NOT the display target. Null when no plan rows exist.
  planned_tss_total: number | null
  // Yesterday's planned-but-unridden bike ride (honest, non-guilt), or null.
  missed_yesterday: MissedRide | null
}

export async function fetchCurrentWeek(
  language: 'simple' | 'technical',
  locale: 'en' | 'de' = 'en',
  weekOffset = 0,
): Promise<WeekResponse> {
  const res = await apiClient.get<WeekResponse>('/weeks/current', {
    params: { language, locale, week_offset: weekOffset },
  })
  return res.data
}
