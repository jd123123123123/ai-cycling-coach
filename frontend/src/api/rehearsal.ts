import { apiClient } from './client'

/**
 * Wire shapes for /rehearsals. Mirrors `backend/app/schemas/rehearsal.py`
 * exactly — in particular BOTH `cda_is_default` and `durability_is_default`
 * are carried (not just the first), and `Assumptions` has three fields:
 * `draft`, `effort`, `use_weather`. A predicted time is never returned
 * without its `band`, so the two are optional together, never one without
 * the other.
 */

export type Draft = 'solo' | 'small_group' | 'bunch'
export type Effort = 'steady' | 'fondo' | 'race'
export type SourceKind = 'gpx' | 'crew_event' | 'activity' | 'target_event'

export interface Assumptions {
  draft: Draft
  effort: Effort
  use_weather: boolean
}

/**
 * One ~150 m stretch of road.
 *
 * The terrain half (`start_m`, `gradient_pct`, `elevation_m`, `climb_id`) is
 * measured off the route and is always present — including on a
 * `can_predict: false` rehearsal, where the profile still renders because the
 * road is real even when the rider's physiology is unknown. The paced half is
 * `null` in exactly that case; it is never zero, because a zero would read as
 * a measurement.
 */
export interface RehearsalSegment {
  start_m: number
  gradient_pct: number
  elevation_m: number | null
  /** Where the segment starts. Null on rehearsals stored before the map
   *  shipped — those still scrub the profile, they just have no map. */
  lat?: number | null
  lng?: number | null
  power_w: number | null
  speed_ms: number | null
  elapsed_s: number | null
  w_bal_j: number | null
  climb_id: number | null
}

export interface RehearsalClimb {
  climb_id: number
  start_m: number
  end_m: number
  length_m: number
  elev_gain_m: number
  avg_grade_pct: number
}

export interface RehearsalBand {
  p10_s: number
  p50_s: number
  p90_s: number
  draws: number
}

export interface RehearsalBlowUp {
  distance_m: number
  climb_id: number | null
}

export interface Rehearsal {
  id: number
  name: string | null
  source_kind: SourceKind
  source_ref: number | null
  distance_m: number
  ascent_m: number
  created_at: string
  assumptions: Assumptions

  can_predict: boolean
  /** Names of the inputs the athlete's profile lacks, e.g. ['cp', 'weight']. */
  missing: string[]
  climbs: RehearsalClimb[]
  segments: RehearsalSegment[]
  /** Populated only together with `band` — never a bare time. */
  total_time_s?: number
  band?: RehearsalBand
  total_kj?: number
  carbs_g_per_hour?: number
  blow_ups: RehearsalBlowUp[]
  /** True when CdA is the labelled fallback rather than a measurement. */
  cda_is_default: boolean
  /** True when the durability fade is the unmeasured default. */
  durability_is_default: boolean
  /**
   * True when no measured W′ backs this rider. The simulator then has no
   * ceiling to enforce: no blow-up is reported and the W′ series is flat
   * zero. That absence must be stated, never rendered as "you never break".
   */
  w_prime_is_default: boolean
  weather_used: boolean
}

export async function createRehearsal(body: {
  source_kind: SourceKind
  gpx?: string
  source_ref?: number
  name?: string
  ride_date?: string
  draft?: Draft
  effort?: Effort
  use_weather?: boolean
}): Promise<Rehearsal> {
  return (await apiClient.post<Rehearsal>('/rehearsals', body)).data
}

export async function getRehearsal(id: number): Promise<Rehearsal> {
  return (await apiClient.get<Rehearsal>(`/rehearsals/${id}`)).data
}

export async function updateAssumptions(
  id: number,
  body: { draft?: Draft; effort?: Effort; use_weather?: boolean },
): Promise<Rehearsal> {
  return (await apiClient.patch<Rehearsal>(`/rehearsals/${id}`, body)).data
}
