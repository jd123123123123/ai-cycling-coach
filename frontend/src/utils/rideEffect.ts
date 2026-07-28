/**
 * rideEffect — "what did this ride actually do for me, and where does it sit?"
 *
 * Both per-ride surfaces described a ride in detail and neither answered the
 * two questions a rider actually asks afterwards:
 *
 *   1. What did it develop? (adaptation targeted, and whether the execution
 *      supports that claim)
 *   2. What did it change? (fitness gained, fatigue cost, how it ranks against
 *      the rest of the season, whether it matched the plan)
 *
 * The pages carried NP, IF, VI, zone tables, a power curve and a coach
 * paragraph — all descriptive. Nothing tied the ride to the athlete's
 * trajectory, so a 151-TSS three-hour endurance ride and a 57-TSS VO₂ session
 * read as "two rides with different numbers" rather than as two different jobs
 * with different payoffs.
 *
 * Everything here is derived from data the debrief already returns plus the
 * PMC series the dashboard already fetches. Pure functions, no React, so the
 * arithmetic is unit-testable — and every output is nullable, because the
 * honest answer to "how much fitness did this add" is sometimes "we can't tell
 * from what we have".
 */

/** Coggan-style zone keys as they arrive in `pacing.zone_time_pct`. The wire
 *  has used both `z1`/`Z1` and long names across versions, so the reader is
 *  tolerant — an unmatched key contributes to nothing rather than throwing. */
const ZONE_ALIASES: Record<string, number> = {
  z1: 1, zone1: 1, recovery: 1, active_recovery: 1,
  z2: 2, zone2: 2, endurance: 2, aerobic: 2,
  z3: 3, zone3: 3, tempo: 3,
  z4: 4, zone4: 4, threshold: 4, lactate_threshold: 4,
  z5: 5, zone5: 5, vo2: 5, vo2max: 5,
  z6: 6, zone6: 6, anaerobic: 6,
  z7: 7, zone7: 7, neuromuscular: 7, sprint: 7,
}

export function zoneNumber(key: string): number | null {
  const k = key.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return ZONE_ALIASES[k] ?? null
}

/** The three training bands the adaptation claim is keyed to. Deliberately
 *  coarse: a rider does not need to hear "48 % Z2, 11 % Z3" to understand that
 *  a ride was an aerobic one. */
export type AdaptationBand = 'aerobic' | 'threshold' | 'vo2'

export interface RideAdaptation {
  band: AdaptationBand
  /** Share of moving time inside the band's own zones, 0–100. */
  pctInBand: number
  /** True when the band won by a clear margin. A ride split evenly across
   *  bands is a mixed ride, and saying so is more useful than naming a
   *  winner that beat the runner-up by two percentage points. */
  decisive: boolean
}

/**
 * Which adaptation the ride actually trained, from where the time was spent.
 *
 * Bands: aerobic = Z1–Z2, threshold = Z3–Z4, vo2 = Z5+. The winner is the band
 * with the most time, EXCEPT that high-intensity time is weighted: 20 minutes
 * at VO₂ is the point of a session that also contains 60 minutes of Z1 warm-up
 * and recovery, and picking "aerobic" for it would be nonsense. The weights
 * (1 / 2.2 / 4) approximate how much of the session's purpose each minute in
 * the band carries, and they are what make an interval session read as an
 * interval session.
 */
export function rideAdaptation(
  zoneTimePct: Record<string, number> | null | undefined,
): RideAdaptation | null {
  if (!zoneTimePct) return null
  const band = { aerobic: 0, threshold: 0, vo2: 0 }
  let total = 0
  for (const [key, pct] of Object.entries(zoneTimePct)) {
    const z = zoneNumber(key)
    if (z == null || !Number.isFinite(pct) || pct <= 0) continue
    total += pct
    if (z <= 2) band.aerobic += pct
    else if (z <= 4) band.threshold += pct
    else band.vo2 += pct
  }
  if (total <= 0) return null
  const weighted = {
    aerobic: band.aerobic * 1,
    threshold: band.threshold * 2.2,
    vo2: band.vo2 * 4,
  }
  const entries = Object.entries(weighted) as [AdaptationBand, number][]
  entries.sort((a, b) => b[1] - a[1])
  const [winner, wScore] = entries[0]
  const runnerUp = entries[1]?.[1] ?? 0
  // Normalise the raw (unweighted) share so the number shown to the athlete is
  // the real share of their time, not the weighting artefact.
  const pctInBand = Math.round((band[winner] / total) * 100)
  return {
    band: winner,
    pctInBand,
    decisive: wScore >= runnerUp * 1.5,
  }
}

export interface FitnessEffect {
  /** CTL the day before the ride. */
  ctlBefore: number
  /** CTL on the ride's own day (after the ride's load lands). */
  ctlAfter: number
  /** Rounded CTL delta — the "fitness added". May be 0 or negative: a very
   *  easy ride on a high CTL still loses ground, and saying so is honest. */
  ctlDelta: number
  /** ATL delta — the fatigue the ride put in the legs. */
  atlDelta: number
  /** TSB on the ride day, for the freshness cost. */
  tsbAfter: number
}

/**
 * What the ride did to the training load model. Reads the PMC series either
 * side of the ride's date; returns null when the series doesn't cover it (a
 * ride older than the fetched window, or the very first ride on record, where
 * there is no "before" to compare against).
 */
export function fitnessEffect(
  entries: { date: string; ctl: number; atl: number; tsb: number }[] | null | undefined,
  rideDayKey: string,
): FitnessEffect | null {
  if (!entries || entries.length === 0) return null
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  const idx = sorted.findIndex((e) => e.date === rideDayKey)
  if (idx <= 0) return null // not covered, or no prior day to compare
  const before = sorted[idx - 1]
  const after = sorted[idx]
  return {
    ctlBefore: before.ctl,
    ctlAfter: after.ctl,
    ctlDelta: Math.round((after.ctl - before.ctl) * 10) / 10,
    atlDelta: Math.round((after.atl - before.atl) * 10) / 10,
    tsbAfter: Math.round(after.tsb),
  }
}

export interface RideRank {
  /** 1 = the hardest ride in the window. */
  rank: number
  /** How many rides the ranking considered (including this one). */
  outOf: number
  /** Percentile from the top, 0–100. 100 = hardest. */
  percentile: number
  /** True when this ride is in the top 10% of the window — worth calling out. */
  standout: boolean
}

/**
 * Where the ride sits among the athlete's own rides by training load.
 *
 * Deliberately ranked on TSS rather than distance or duration: TSS is the
 * number the plan is written in, so "your third-hardest ride this season"
 * means the same thing as the plan's own targets. Rides without a TSS are
 * excluded rather than treated as zero — an untracked ride is unknown, not
 * easy.
 */
export function rideRank(
  rides: { id: number; tss?: number | null; sport?: string | null }[] | null | undefined,
  activityId: number,
): RideRank | null {
  if (!rides) return null
  const scored = rides.filter((r): r is { id: number; tss: number; sport?: string | null } =>
    typeof r.tss === 'number' && Number.isFinite(r.tss) && r.tss > 0
    // Bike rides only. The activity feed carries runs and gym sessions, whose
    // TSS sits around 16-18 — including them inflated the denominator ("6th of
    // 72 rides" when the athlete had ridden 59 times) and quietly flattered
    // every cycling rank by padding the bottom of the list with sessions that
    // were never rides. This is a bike-only product; the comparison set is
    // rides.
    && (r.sport == null || r.sport === 'cycling'))
  if (scored.length < 3) return null // too few to rank meaningfully
  const self = scored.find((r) => r.id === activityId)
  if (!self) return null
  const harder = scored.filter((r) => r.tss > self.tss).length
  const rank = harder + 1
  const outOf = scored.length
  const percentile = Math.round(((outOf - rank) / (outOf - 1)) * 100)
  return { rank, outOf, percentile, standout: rank <= Math.max(1, Math.ceil(outOf * 0.1)) }
}

export interface PlanMatch {
  plannedTss: number
  actualTss: number
  /** actual − planned. */
  deltaTss: number
  /** 'on' within ±15%, 'under' / 'over' outside it. The band is wide on
   *  purpose: hitting a TSS target to the point is neither expected nor
   *  desirable, and a narrow band would flag normal riding as a miss. */
  verdict: 'on' | 'under' | 'over'
}

export function planMatch(
  plannedTss: number | null | undefined,
  actualTss: number | null | undefined,
): PlanMatch | null {
  if (plannedTss == null || actualTss == null) return null
  if (!Number.isFinite(plannedTss) || !Number.isFinite(actualTss) || plannedTss <= 0) return null
  const deltaTss = Math.round(actualTss - plannedTss)
  const ratio = actualTss / plannedTss
  const verdict: PlanMatch['verdict'] = ratio < 0.85 ? 'under' : ratio > 1.15 ? 'over' : 'on'
  return { plannedTss: Math.round(plannedTss), actualTss: Math.round(actualTss), deltaTss, verdict }
}

/** Aerobic decoupling → a durability read. Below 5% is the usual "well within
 *  aerobic means" threshold (Friel/Coggan); above 10% says the ride outran the
 *  athlete's current aerobic base, which is a legitimate and useful finding on
 *  a long ride rather than a failure. */
export type DurabilityRead = 'strong' | 'fair' | 'faded'

export function durabilityRead(decouplingPct: number | null | undefined): DurabilityRead | null {
  if (decouplingPct == null || !Number.isFinite(decouplingPct)) return null
  if (decouplingPct < 5) return 'strong'
  if (decouplingPct <= 10) return 'fair'
  return 'faded'
}
