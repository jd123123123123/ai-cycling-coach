/**
 * Pure helpers for the rehearsal surface. Kept out of the component files
 * because this repo's eslint (react-refresh) forbids exporting non-components
 * from a component module.
 *
 * Nothing here re-runs the projection — the backend owns that. These only
 * reshape what the API already returned (segments, climbs, blow-ups) into the
 * few derived numbers the screen shows.
 */

import type { RehearsalClimb, RehearsalSegment } from '../../api/rehearsal'

/**
 * Elevation profile integrated from the pacing segments' gradients.
 *
 * The wire format carries `gradient_pct` and `start_m` but no altitude — the
 * simulator never needs one, it only needs slope. The silhouette does, so we
 * rebuild it: each segment climbs `gradient % × its length`. The absolute
 * datum is arbitrary (starts at 0) because `RehearsalProfile` normalises
 * min→max into its box anyway; only the SHAPE is claimed here, never an
 * altitude figure, which is why no number from this function is ever printed.
 */
export function elevationsFromSegments(segments: RehearsalSegment[]): number[] {
  const out: number[] = []
  let elev = 0
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) {
      const run = segments[i].start_m - segments[i - 1].start_m
      elev += (segments[i - 1].gradient_pct / 100) * (run > 0 ? run : 0)
    }
    out.push(elev)
  }
  return out
}

/** Seconds → `h:mm`. Used for the range only — never for a lone p50. */
export function formatHm(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.round((total % 3600) / 60)
  // Rounding minutes can carry (3599 s → 1:00, not 0:60).
  const carried = m === 60 ? { h: h + 1, m: 0 } : { h, m }
  return `${carried.h}:${String(carried.m).padStart(2, '0')}`
}

/** Seconds → `h:mm:ss` (climb durations and the scrub readout's elapsed). */
export function formatHms(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

export interface ClimbStats {
  /** Mean attempted power across the climb's segments. */
  meanPowerW: number | null
  /** Elapsed time across the climb, from the pacing timeline. */
  timeS: number | null
  /** W′ spent on the climb: the drop from its start to its lowest point. */
  wCostJ: number | null
}

/**
 * The three figures a climb card shows beyond the terrain. All three are
 * null when the climb has no segments (a `can_predict=false` rehearsal still
 * carries climbs — the terrain is real even when the athlete's profile can't
 * be paced) so the card can render an honest `—` instead of a zero.
 */
export function climbStats(
  segments: RehearsalSegment[],
  climb: RehearsalClimb,
): ClimbStats {
  const idxs: number[] = []
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].climb_id === climb.climb_id) idxs.push(i)
  }
  if (idxs.length === 0) return { meanPowerW: null, timeS: null, wCostJ: null }

  const first = idxs[0]
  const last = idxs[idxs.length - 1]
  const on = idxs.map((i) => segments[i])

  const meanPowerW = on.reduce((a, s) => a + s.power_w, 0) / on.length
  // The climb ends where the NEXT segment starts; without one (the route
  // finishes on the summit) the last segment's own elapsed is the best we have.
  const endElapsed = segments[last + 1]?.elapsed_s ?? segments[last].elapsed_s
  const timeS = Math.max(0, endElapsed - segments[first].elapsed_s)
  const minW = Math.min(...on.map((s) => s.w_bal_j))
  const wCostJ = Math.max(0, segments[first].w_bal_j - minW)

  return { meanPowerW, timeS, wCostJ }
}

/**
 * The wattage ceiling implied by a blow-up.
 *
 * Once W′ is empty the simulator caps the rider at CP, so the power it hands
 * back for the segments AFTER the blow-up IS (approximately) that athlete's
 * CP on this terrain. That is exactly the number the athlete needs: hold the
 * preceding climb at or under it and W′ never empties. Reading it off the
 * projection rather than inventing a percentage keeps the advice and the
 * simulation the same model. Null when the blow-up is the last segment.
 */
export function blowUpCeilingW(
  segments: RehearsalSegment[],
  distanceM: number,
): number | null {
  const idx = segments.findIndex((s) => s.start_m >= distanceM)
  if (idx < 0) return null
  const after = segments.slice(idx).filter((s) => s.gradient_pct >= 3)
  const pool = after.length > 0 ? after : segments.slice(idx)
  if (pool.length === 0) return null
  return Math.max(...pool.map((s) => s.power_w))
}

/** Fallback display name for a climb: the API detects them, it can't name them. */
export function climbLabel(climb: RehearsalClimb, de: boolean): string {
  return de ? `Anstieg ${climb.climb_id}` : `Climb ${climb.climb_id}`
}

/** W′ at full — the largest balance seen, i.e. the value before any drain. */
export function wPrimeCapacity(segments: RehearsalSegment[]): number | null {
  if (segments.length === 0) return null
  const max = Math.max(...segments.map((s) => s.w_bal_j))
  return max > 0 ? max : null
}
