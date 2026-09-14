/**
 * Plan API — plan-engine v2 surfaces (V3).
 *
 * GET  /plan/adaptations       — athlete-visible adaptation feed (violet
 *                                AdaptiveCard + "Was sich geändert hat" timeline).
 * GET  /plan/change/interview  — plan-change interview: credit summary +
 *                                delta-driven questions.
 * POST /plan/change/apply      — apply interview answers, regenerate the plan.
 */
import { apiClient } from './client'

// ── Adaptation feed ─────────────────────────────────────────────────────────

export interface PlanAdaptation {
  id: number
  created_at: string
  target_date: string
  source: string
  signal: string
  rule: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  evidence: Record<string, unknown> | null
  message_de: string
  message_en: string
}

export interface AdaptationFeed {
  adaptations: PlanAdaptation[]
}

export async function fetchPlanAdaptations(days = 14, limit = 40): Promise<AdaptationFeed> {
  const res = await apiClient.get<AdaptationFeed>('/plan/adaptations', { params: { days, limit } })
  return res.data
}

// ── Plan-change interview ───────────────────────────────────────────────────

export interface InterviewQuestion {
  id: string
  type: 'choice' | 'text'
  prompt_de: string
  prompt_en: string
  options?: string[] | null
}

export interface InterviewCurrent {
  weeks_completed: number
  sessions_done: number
  planned_sessions: number
  compliance_pct: number | null
  ctl_delta_since_start: number | null
  favorite_session: { template_id: string; completed: number; title?: string; category?: string } | null
}

export interface InterviewRead {
  current: InterviewCurrent
  questions: InterviewQuestion[]
}

export async function fetchPlanChangeInterview(): Promise<InterviewRead> {
  const res = await apiClient.get<InterviewRead>('/plan/change/interview')
  return res.data
}

export interface DaysAvailable {
  mon: boolean
  tue: boolean
  wed: boolean
  thu: boolean
  fri: boolean
  sat: boolean
  sun: boolean
  long_day?: string | null
}

/** Typed answer payload — every field optional; ids match the questions. */
export interface InterviewAnswers {
  felt_wrong?: 'too_hard' | 'too_boring' | 'too_rigid' | 'life_changed'
  goal_changed?: 'same' | 'new_event' | 'no_event'
  goal_new?: 'race' | 'fondo' | 'audax' | 'maintenance'
  target_event_date?: string
  target_event_type?: 'race' | 'fondo' | 'audax' | 'maintenance'
  target_priority?: 'A' | 'B' | 'C'
  weekly_hours?: number
  days_available?: DaysAvailable
  hard_day_blackouts?: string[]
  experience_level?: 'new' | 'returning' | 'seasoned'
}

export interface PlanWeekDay {
  /** German template title (additive) — prefer under locale=de. */
  title_de?: string | null
  date: string
  sport: string
  title: string
  template_id: string | null
  blocks_source: string | null
}

// Hours reconciliation — present when the CTL anchor floors week 1 below the
// athlete's declared hours; the message explains the ramp (de + en variants).
export interface HoursNote {
  declared_hours: number
  start_hours: number
  reason: string
  de: string
  en: string
}

// No-event fitness-builder horizon — the honest replacement for "— weeks left".
export interface PlanProgression {
  mode: string
  horizon_weeks: number
  start_ctl: number
  target_ctl: number
}

export interface PlanChangeApplyResponse {
  rebuilt: boolean
  plan_start_date: string
  week: PlanWeekDay[]
  phase: string | null
  weekly_tss_targets: number[] | null
  preserved_sessions: number | null
  ctl_anchor: number | null
  planned_hours: number | null
  declared_hours: number | null
  hours_note: HoursNote | null
  progression: PlanProgression | null
  profile_updates: Record<string, unknown>
  carried: Record<string, unknown>
}

export async function applyPlanChange(answers: InterviewAnswers): Promise<PlanChangeApplyResponse> {
  const res = await apiClient.post<PlanChangeApplyResponse>('/plan/change/apply', { answers })
  return res.data
}

// ── Plan build (V3 onboarding) ──────────────────────────────────────────────
// POST /plan/build — idempotent per athlete-local day. 409 = the profile
// can't support a plan yet (e.g. no FTP); onboarding treats that as soft.

export interface PlanBuildResponse {
  rebuilt: boolean
  plan_start_date: string
  week: PlanWeekDay[]
  phase: string | null
  weekly_tss_targets: number[] | null
  preserved_sessions: number | null
  ctl_anchor: number | null
  planned_hours: number | null
  declared_hours: number | null
  hours_note: HoursNote | null
  progression: PlanProgression | null
}

export async function buildPlan(
  source: 'onboarding' | 'plan_change' = 'onboarding',
): Promise<PlanBuildResponse> {
  const res = await apiClient.post<PlanBuildResponse>('/plan/build', { source })
  return res.data
}

export interface CurrentPlanResponse {
  goal_name?:string|null; goal_date?:string|null; goal_start?:string|null;
  plan_start_date: string | null
  plan_end_date: string | null
  phase: string | null
  weekly_tss_targets: number[] | null
  planned_hours: number | null
  status: 'empty' | 'active' | 'ended'
}
export async function fetchCurrentPlan(): Promise<CurrentPlanResponse> {
  return (await apiClient.get<CurrentPlanResponse>('/plan/current')).data
}
