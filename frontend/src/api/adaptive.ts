import { apiClient } from './client'

export type DirectiveKind = 'escalate' | 'push' | 'hold' | 'deload' | 'rest'
export type Tone = 'good' | 'warn' | 'bad' | 'neutral'
export type Evidence = 'RCT' | 'expert' | 'guardrail'

export interface AdaptiveSignal { text: string; tone: Tone; evidence: Evidence }

// ── ONE Daily Decision (audit P0-3) ─────────────────────────────────────────
// Mirrors backend/app/schemas/coach.py::DailyDecision. Every surface renders
// this decision FIRST and may add flavor — never contradict `state`.
export type DailyDecisionState =
  | 'sick' | 'injured' | 'break'
  | 'trained_already' | 'planned_rest'
  | 'recover' | 'easy' | 'quality' | 'hard'

export interface DailyDecisionCTA { label: string; target: string }

export interface DailyDecisionPlanned {
  title: string
  template_id?: string | null
  target_tss?: number | null
  duration_minutes?: number | null
}

export interface DailyDecisionReadiness {
  score?: number | null
  tier?: string | null // 'rest' | 'easy' | 'moderate' | 'push'
}

export interface DailyDecision {
  date: string // athlete-local ISO date
  state: DailyDecisionState
  verdict: string
  reason: string
  cta?: DailyDecisionCTA | null
  planned?: DailyDecisionPlanned | null
  readiness: DailyDecisionReadiness
  tss_target?: number | null
  // Garmin-style 0-21 scale; ALWAYS tss_target/8 (backend is the only
  // derivation point). Null on rest / trained / sick days.
  strain_target?: number | null
}

/** True when the decision says "training happens today" (recover counts —
 * the plan keeps its shape, the directive only caps the load). */
export function isTrainState(state: DailyDecisionState | null | undefined): boolean {
  return state === 'recover' || state === 'easy' || state === 'quality' || state === 'hard'
}

export interface AdaptiveDirective {
  directive: DirectiveKind
  intensity_ceiling: string
  volume_modifier: number
  hrv_state: 'below' | 'in' | 'above' | 'unknown'
  headline: string
  signals: AdaptiveSignal[]
  confidence: string
  lang: string
  // backend/app/schemas/coach.py::AdaptiveDirectiveRead — the same fresh
  // decision as /coach/brief, so Load-Form renders subordinately to it.
  daily_decision?: DailyDecision | null
}

export async function fetchAdaptive(locale = 'en'): Promise<AdaptiveDirective> {
  const res = await apiClient.get<AdaptiveDirective>('/coach/adaptive', { params: { lang: locale } })
  return res.data
}
