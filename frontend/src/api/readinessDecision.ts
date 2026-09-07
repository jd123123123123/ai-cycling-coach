import { apiClient } from './client'

/**
 * Readiness as a DECISION WITH A RECEIPT — `GET /readiness/decision`.
 *
 * A recovery score on its own is a number to interpret: the rider is handed a
 * 43 and left to work out what it costs them. This endpoint answers the
 * question the score was standing in for — *what am I doing today, and what
 * would I have been doing if the watch had said nothing* — and it names the one
 * measurement that made the difference.
 *
 * That pairing is the point, and it is the one thing a wearable that does not
 * own the training plan structurally cannot produce: it can score the night,
 * but it has no session to take away.
 *
 * Mirrors `backend/app/schemas/readiness_decision.py` field for field. Every
 * optional here is optional there too — nothing in this file may be defaulted
 * client-side, because a defaulted baseline or a defaulted age is exactly the
 * fabrication the payload was shaped to prevent.
 */

/** Port of `utils/readinessGate.ts`, computed server-side so both agree.
 *  'fresh' = today's reading · 'pending' = a morning that has not synced ·
 *  'stale' = two days or older · 'none' = no overnight record at all. */
export type ReadinessGateState = 'fresh' | 'pending' | 'stale' | 'none'

/** Every measured signal a decision can be built from, in the server's order. */
export type ReadinessInputKey =
  | 'hrv'
  | 'resting_hr'
  | 'sleep_score'
  | 'sleep_duration'
  | 'sleep_deep'
  | 'body_battery_wake'
  | 'stress_wake'

/** One session, in the shape both sides of the counterfactual use. */
export interface ReadinessSession {
  title: string
  template_id?: string | null
  duration_minutes?: number | null
  target_tss?: number | null
}

/**
 * One measured signal against the athlete's OWN trailing baseline.
 *
 * `baseline` is null — never a guess — when there is too little history to form
 * one. A client that substitutes a population average there turns "we do not
 * know you yet" into a confident comparison, which is the worse of the two
 * lies because it cannot be seen.
 */
export interface ReadinessInput {
  key: ReadinessInputKey
  label_de: string
  value: number | null
  /** "ms" | "bpm" | "h" | "" (score points). */
  unit: string
  /** Which statistic `value` is: HRV's construct is a 7-day mean, every other
   *  signal is a single night. Printing them as one thing would be wrong. */
  basis: 'today' | 'recent_7d'
  baseline: number | null
  /** Readings behind `baseline`. Below the minimum, `baseline` stays null. */
  baseline_n: number
  deviation?: number | null
  deviation_pct?: number | null
  /** Deviation in units of the athlete's own baseline SD. */
  z?: number | null
  /** |z| at which this signal counts as meaningfully off. */
  band?: number | null
  /** |z| / band — comparable ACROSS signals, which is what lets one of them
   *  be named the driver. */
  severity?: number | null
  off: boolean
  direction: 'below' | 'above' | 'at' | 'unknown'
  /** True when the deviation is in the direction that argues for less load. */
  unfavourable: boolean
  /** Whole days between today and the reading behind `value`. */
  age_days?: number | null
  text_de: string
  note_de?: string | null
}

/** The single input that moved the decision most, named with its number. */
export interface ReadinessDriver {
  key: ReadinessInputKey
  text_de: string
  z?: number | null
  severity?: number | null
}

/** The verdict as an ACTION, never an adjective. */
export interface ReadinessVerdict {
  text_de: string
  /** 'recover'|'easy'|'quality'|'hard'|'planned_rest'|'trained_already'|
   *  'sick'|'injured'|'break'. */
  state: string
  tss_target?: number | null
  /** "Ohne diese Werte: …" — already prefixed by the server. */
  counterfactual_text_de?: string | null
}

export interface ReadinessDecision {
  /** Athlete-local ISO date the decision is for. */
  date: string

  // ── Honest absence ───────────────────────────────────────────────────
  gate: ReadinessGateState
  data_age_days?: number | null
  last_measured_on?: string | null
  /** True → `verdict` is null and NO score may be shown. Not an error state. */
  withheld: boolean
  withheld_reason_de?: string | null

  // ── The decision, and what it replaced ───────────────────────────────
  verdict?: ReadinessVerdict | null
  session_now?: ReadinessSession | null
  session_planned?: ReadinessSession | null
  changed: boolean
  /** 'recorded' — the plan row on disk carries the literal before-image.
   *  'recomputed' — the decision was re-run with the measurements withheld. */
  counterfactual_source?: 'recorded' | 'recomputed' | null
  /** True only on the 'recorded' path: the plan row already carries the change. */
  applied: boolean

  // ── The measurement ──────────────────────────────────────────────────
  driver?: ReadinessDriver | null
  inputs: ReadinessInput[]
  baseline_state: 'ready' | 'building' | 'none'

  // ── Context echoed for one fetch ─────────────────────────────────────
  readiness_score?: number | null
  readiness_tier?: string | null
  hrv_state: 'below' | 'in' | 'above' | 'unknown'
  /** A plan row exists that `POST /workouts/today/modify` could act on. This
   *  endpoint never writes; whether an action is OFFERED is the caller's call. */
  can_modify: boolean
}

/** `lang` is a locale ('de' | 'en'), not the coach's simple/technical mode:
 *  the server branches on `startswith('de')` and composes the German strings. */
export async function fetchReadinessDecision(lang = 'de'): Promise<ReadinessDecision> {
  const res = await apiClient.get<ReadinessDecision>('/readiness/decision', {
    params: { lang },
  })
  return res.data
}
