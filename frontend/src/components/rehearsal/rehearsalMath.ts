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
 * The elevation series the silhouette is drawn from.
 *
 * Prefers the MEASURED `elevation_m` the API now carries per segment. Older
 * stored rehearsals (written before that field existed) have none, so the
 * shape is integrated back out of the gradients as a fallback: each segment
 * climbs `gradient % × its length`. In that fallback the absolute datum is
 * arbitrary (it starts at 0), which is harmless because `RehearsalProfile`
 * normalises min→max into its box anyway — only the SHAPE is ever claimed
 * here, never an altitude figure, which is why no number from this function
 * is printed on screen.
 */
export function elevationsFromSegments(segments: RehearsalSegment[]): number[] {
  if (segments.length > 0 && segments.every((s) => s.elevation_m != null)) {
    return segments.map((s) => s.elevation_m as number)
  }
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

/**
 * Locale-aware fixed-point number, e.g. `120.5` (en) vs `120,5` (de). This app
 * is German-first: every decimal shown on screen (km, %, km/h — not just the
 * `kJ` figure that already used `toLocaleString`) must use the comma, not the
 * `Number.prototype.toFixed` dot.
 */
export function formatDecimal(value: number, de: boolean, digits = 1): string {
  return value.toLocaleString(de ? 'de-DE' : 'en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
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
 * The three figures a climb card shows beyond the terrain. Each is null
 * whenever the projection does not actually carry it, so the card renders an
 * honest `—` instead of a fabricated zero. That happens in two ways:
 *
 *  - the climb has no paced segments at all (a `can_predict=false` rehearsal
 *    still carries climbs — the terrain is real even when the athlete's
 *    profile cannot be paced);
 *  - the rider has no measured W′, in which case the whole balance series is
 *    flat zero. `max(0, 0 − 0)` used to print "0,0 kJ" on every climb, which
 *    is not a cheap climb — it is a number we do not have.
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

  const powers = on.map((s) => s.power_w)
  const meanPowerW = powers.every((p) => p != null)
    ? (powers as number[]).reduce((a, p) => a + p, 0) / powers.length
    : null

  // The climb ends where the NEXT segment starts; without one (the route
  // finishes on the summit) the last segment's own elapsed is the best we have.
  const endElapsed = segments[last + 1]?.elapsed_s ?? segments[last].elapsed_s
  const startElapsed = segments[first].elapsed_s
  const timeS =
    endElapsed != null && startElapsed != null
      ? Math.max(0, endElapsed - startElapsed)
      : null

  // Gated on the WHOLE route's balance series, not just this climb's: a rider
  // with no W′ on file has zeros everywhere, and that is the case where the
  // drop is meaningless rather than merely small.
  const capacity = wPrimeCapacity(segments)
  const startBal = segments[first].w_bal_j
  const balances = on.map((s) => s.w_bal_j)
  const wCostJ =
    capacity != null && startBal != null && balances.every((b) => b != null)
      ? Math.max(0, startBal - Math.min(...(balances as number[])))
      : null

  return { meanPowerW, timeS, wCostJ }
}

/**
 * A W′ balance above this is "recovered" for the purpose of this sentence —
 * NOT the simulator's own `_BLOWN_J` (1 J), which only tells the physics
 * engine when it's safe to stop capping power. That razor-thin threshold
 * would flip back to "recovered" a few seconds into a descent, long before
 * the rider is meaningfully fresh. This is a display concern: how far the
 * balance has to climb before a *later* climb's attempted watts stop being
 * "the same blow-up" and start being a fresh, potentially uncapped, effort.
 */
const RECOVERED_J = 500

/**
 * The wattage ceiling implied by a blow-up.
 *
 * Once W′ is empty the simulator caps the rider at CP, so the power it hands
 * back for the segments immediately AFTER the blow-up IS (approximately)
 * that athlete's CP on this terrain. That is exactly the number the athlete
 * needs: hold the preceding climb at or under it and W′ never empties.
 * Reading it off the projection rather than inventing a percentage keeps the
 * advice and the simulation the same model.
 *
 * The pool is restricted to the CONTIGUOUS blown run — from the blow-up
 * point until W′ first climbs back to something meaningful — because the
 * simulator un-caps power the moment `bal` recovers (`simulator.py`'s
 * `blown` flag), and effort `race` will happily attempt well above CP again
 * on a later climb once the rider has recovered on a descent. Pooling across
 * that later attempt would return a ceiling ABOVE CP — advice that
 * guarantees the very blow-up it claims to prevent. Null when the blow-up is
 * the last segment.
 */
export function blowUpCeilingW(
  segments: RehearsalSegment[],
  distanceM: number,
): number | null {
  const idx = segments.findIndex((s) => s.start_m >= distanceM)
  if (idx < 0) return null

  let end = idx
  while (end < segments.length && (segments[end].w_bal_j ?? 0) < RECOVERED_J) end++
  const run = end > idx ? segments.slice(idx, end) : segments.slice(idx, idx + 1)

  const after = run.filter((s) => s.gradient_pct >= 3)
  const pool = (after.length > 0 ? after : run)
    .map((s) => s.power_w)
    .filter((p): p is number => p != null)
  if (pool.length === 0) return null
  return Math.max(...pool)
}

/** Fallback display name for a climb: the API detects them, it can't name them. */
export function climbLabel(climb: RehearsalClimb, de: boolean): string {
  return de ? `Anstieg ${climb.climb_id}` : `Climb ${climb.climb_id}`
}

/**
 * W′ at full — the largest balance seen, i.e. the value before any drain.
 * Null when the projection carries no balance at all (no CP, or no measured
 * W′), which is what makes every W′ figure downstream render as `—`.
 */
export function wPrimeCapacity(segments: RehearsalSegment[]): number | null {
  const known = segments
    .map((s) => s.w_bal_j)
    .filter((b): b is number => b != null)
  if (known.length === 0) return null
  const max = Math.max(...known)
  return max > 0 ? max : null
}
