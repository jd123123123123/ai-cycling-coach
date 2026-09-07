import { apiClient } from './client'

/**
 * GET /analytics/form-projection — fitness / fatigue / form on the athlete's
 * OWN fitted time constants, projected forward.
 *
 * Mirrors `backend/app/schemas/form_projection.py` field for field. The two
 * things worth knowing before you use it:
 *
 *   · Every prose string the server sends (`model_reason`, `load.assumption`,
 *     `performance_series.gate`, `uncertainty.covers`) is ENGLISH. The app is
 *     German, so no client should render them. They are kept in the types
 *     because they are the inspectable record of how the number was made — but
 *     the card composes its own sentences from the resolved codes next to
 *     them (`fallback_reason`, `load.source`, `planned_days`, …), which is the
 *     app's own copy rule anyway.
 *
 *   · `range_required` is the app's confidence rule ARRIVING PRE-RESOLVED. It
 *     is not advisory. True means a client must render a range and never a
 *     point value for anything projected. `today` and `standard_today` are
 *     measured, not projected, and are unaffected.
 */

/** One measured day. No band — today is not a projection. */
export interface FormPointDay {
  date: string
  fitness: number
  fatigue: number
  form: number
}

/** One projected day, always with its 80 % band. */
export interface ProjectedDay {
  date: string
  days_out: number
  tss: number
  load_source: 'plan' | 'recent-average'
  fitness: number
  fatigue: number
  form: number
  fitness_low: number
  fitness_high: number
  fatigue_low: number
  fatigue_high: number
  form_low: number
  form_high: number
}

export interface ModelConstants {
  tau1_days: number
  tau2_days: number
  standard_tau1_days: number
  standard_tau2_days: number
  k1: number | null
  k2: number | null
  p0: number | null
  r_squared: number | null
  standard_r_squared: number | null
  aicc: number | null
  standard_aicc: number | null
  selection_criterion: string
  n_observations: number
  n_observations_required: number
}

export interface PerformanceSeries {
  source: string
  metric: string
  unit: string
  gate: string
  gate_watts: number | null
  window_best_watts: number | null
  n_candidate_days: number
  n_observations: number
  points: { date: string; watts: number }[]
}

export interface LoadUncertainty {
  sigma_tss_per_day: number
  source: string
  n: number
  band: string
  /** "future load only — not uncertainty in the time constants". */
  covers: string
}

export interface ForwardLoad {
  source: 'plan' | 'recent-average' | 'mixed'
  assumption: string | null
  rolling_7d_tss: number
  planned_days: number
  horizon_days: number
  uncertainty: LoadUncertainty
}

/** Why the individual fit did not ship. One of these, or null on the
 *  individual path. Widened with `| (string & {})` so an unknown code from a
 *  newer server falls through to the generic sentence instead of failing the
 *  build here. */
export type FallbackReason =
  | 'too_few_performance_observations'
  | 'fit_not_identifiable'
  | 'standard_model_not_scorable'
  | 'fit_not_scorable'
  | 'standard_constants_fit_better'

export type UnavailableReason = 'no_history' | 'insufficient_history'

export interface FormProjection {
  available: boolean
  reason: UnavailableReason | string | null
  history_days: number | null
  history_days_required: number | null

  model: 'individual' | 'standard' | null
  /** English. Do not render. */
  model_reason: string | null
  fallback_reason: FallbackReason | string | null

  confidence_pct: number | null
  confidence_threshold_pct: number | null
  /** True → render a range, never a point, for anything projected. */
  range_required: boolean | null

  today: FormPointDay | null
  /** What a fixed-42/7 PMC shows for the SAME day — the comparison. */
  standard_today: FormPointDay | null
  constants: ModelConstants | null
  performance_series: PerformanceSeries | null
  load: ForwardLoad | null
  projection: ProjectedDay[]
}

export async function fetchFormProjection(horizonDays = 42): Promise<FormProjection> {
  const res = await apiClient.get<FormProjection>('/analytics/form-projection', {
    params: { horizon_days: horizonDays },
  })
  return res.data
}
