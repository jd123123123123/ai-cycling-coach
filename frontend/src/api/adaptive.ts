import { apiClient } from './client'

export type DirectiveKind = 'escalate' | 'push' | 'hold' | 'deload' | 'rest'
export type Tone = 'good' | 'warn' | 'bad' | 'neutral'
export type Evidence = 'RCT' | 'expert' | 'guardrail'

export interface AdaptiveSignal { text: string; tone: Tone; evidence: Evidence }

// ── ONE Daily Decision (audit P0-3) ─────────────────────────────────────────
// Canonical types live in api/coach.ts (BriefRead.daily_decision carries the
// same object). Re-exported here so adaptive consumers keep their imports.
export type {
  DailyDecision,
  DailyDecisionCTA,
  DailyDecisionPlanned,
  DailyDecisionReadiness,
  DailyDecisionState,
} from './coach'
import type { DailyDecision, DailyDecisionState } from './coach'

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
