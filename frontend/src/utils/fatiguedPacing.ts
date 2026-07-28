/**
 * fatiguedPacing — what you can actually hold on a climb THAT ARRIVES LATE.
 *
 * The gap this closes. Race-day pacing today anchors on the athlete's threshold
 * and hands back one number per gradient band — a number derived from a FRESH
 * test. Every climb on a mountain gran fondo except the first one is ridden
 * fatigued, and the app already knows by how much: `durability_drop` measures
 * the athlete's real power loss after N kJ from their own ride files. Nothing
 * connected the two, so the pacing plan quietly assumed the last climb of a
 * 4-hour day would go at the same watts as the first.
 *
 * This is the "terrain × fatigue" bet in one function: for each climb on the
 * real route, work out how much energy is already spent by the time the rider
 * reaches its base, decay the sustainable power by that athlete's own measured
 * durability, and report the watts that are actually holdable there.
 *
 * ── Honesty rules, which matter more here than anywhere else in the app ──
 * A pacing number a rider takes to a start line must not be invented.
 *  • No measured durability → no fatigue adjustment. The function returns the
 *    fresh figure and says `basis: 'fresh'`, so the UI can say "we haven't
 *    measured your fade yet" rather than implying a model it doesn't have.
 *  • No threshold → null. Everything here is a fraction of threshold.
 *  • The decay is linear in kJ between the measured points and is NOT
 *    extrapolated past the furthest kJ the athlete has actually ridden. Beyond
 *    that the last measured drop is held flat, and `extrapolated` is set, so a
 *    rider doing 5 000 kJ for the first time is told the model is at its edge
 *    rather than given a confident number off the end of the data.
 */

/** One measured durability point: the athlete's power drop after `kJ` of work. */
export interface DurabilityPoint {
  /** Cumulative work at which the fatigued window was measured. */
  kj: number
  /** Percent drop vs the fresh window (positive = lost power). */
  dropPct: number
}

/** A climb on the route, in the order it is ridden. */
export interface RouteClimb {
  /** Metres of ascent. */
  elevM: number
  /** Climb length in metres. */
  distanceM: number
  avgGradePct: number
  /** Cumulative route distance at the climb's BASE, in metres. */
  startDistM: number
}

export type PacingBasis = 'fresh' | 'measured'

export interface ClimbPacing {
  /** 1-based, in riding order. */
  index: number
  elevM: number
  avgGradePct: number
  /** Estimated kJ already spent when the rider reaches this climb's base. */
  kjAtBase: number
  /** Percent of threshold that is holdable here. */
  pctOfThreshold: number
  /** Watts holdable here. */
  watts: number
  /** Watts if the athlete arrived fresh — the number the old plan gave. */
  freshWatts: number
  /** How much this climb's target is reduced by fatigue, in watts. */
  fadeW: number
  basis: PacingBasis
  /** True when kjAtBase is beyond the furthest point ever measured. */
  extrapolated: boolean
}

/**
 * Sustainable fraction of threshold for a climb of a given duration, fresh.
 *
 * Short climbs can be ridden over threshold; long ones cannot. These are the
 * conventional intensity-vs-duration anchors (a ~20 min climb ≈ threshold, an
 * hour ≈ 95%, three hours ≈ 80%), which is the same shape the existing race-day
 * pacing card uses — kept deliberately consistent so the two never disagree.
 */
export function freshFractionForDuration(seconds: number): number {
  const min = seconds / 60
  if (min <= 5) return 1.18
  if (min <= 10) return 1.08
  if (min <= 20) return 1.0
  if (min <= 40) return 0.96
  if (min <= 70) return 0.93
  if (min <= 150) return 0.87
  return 0.82
}

/**
 * Interpolate the athlete's measured power drop at a given kJ.
 *
 * Returns null when there is nothing measured — the caller must then fall back
 * to fresh numbers rather than assume a textbook fade, because durability is
 * the most individual quality in this whole model: two riders with identical
 * CP can differ by 15 percentage points at 3 000 kJ.
 */
export function dropAtKj(
  points: DurabilityPoint[] | null | undefined,
  kj: number,
): { dropPct: number; extrapolated: boolean } | null {
  const pts = (points ?? [])
    .filter((p) => Number.isFinite(p.kj) && Number.isFinite(p.dropPct) && p.kj >= 0)
    .sort((a, b) => a.kj - b.kj)
  if (pts.length === 0) return null
  if (kj <= pts[0].kj) {
    // Before the first measurement, fade in linearly from zero at 0 kJ.
    const f = pts[0].kj > 0 ? kj / pts[0].kj : 1
    return { dropPct: Math.max(0, pts[0].dropPct * f), extrapolated: false }
  }
  const last = pts[pts.length - 1]
  if (kj >= last.kj) {
    // Hold the last measured drop flat rather than extending the trend. A
    // linear extrapolation to 6 000 kJ would invent a collapse nobody observed.
    return { dropPct: Math.max(0, last.dropPct), extrapolated: kj > last.kj }
  }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    if (kj <= b.kj) {
      const span = b.kj - a.kj || 1
      const t = (kj - a.kj) / span
      return { dropPct: Math.max(0, a.dropPct + (b.dropPct - a.dropPct) * t), extrapolated: false }
    }
  }
  return { dropPct: Math.max(0, last.dropPct), extrapolated: false }
}

/**
 * Energy already spent by a point in the route, in kJ.
 *
 * Deliberately crude and deliberately transparent: average riding power over
 * the distance covered so far, converted to work. A full physics model (CdA,
 * rolling resistance, per-gradient speed) would look more precise and be no
 * more accurate without wind and mass data the app does not have. `flatWatts`
 * is the athlete's own typical endurance power, so the estimate scales to the
 * rider rather than to a generic one.
 */
export function kjSpentBy(distanceM: number, avgSpeedKmh: number, flatWatts: number): number {
  if (!(distanceM > 0) || !(avgSpeedKmh > 0) || !(flatWatts > 0)) return 0
  const hours = distanceM / 1000 / avgSpeedKmh
  return Math.round((flatWatts * hours * 3600) / 1000)
}

/** Estimated climbing speed in km/h for a gradient at a given W/kg. Used only
 *  to convert a climb's length into a duration, which selects the intensity
 *  band. The classic VAM relation: VAM ≈ (W/kg − 0.6) × 1000 × ... simplified
 *  to the well-known approximation VAM ≈ W/kg × 300 at moderate gradients. */
export function climbSpeedKmh(gradePct: number, wattsPerKg: number): number {
  const g = Math.max(1, gradePct) / 100
  const vam = Math.max(200, wattsPerKg * 300) // vertical metres per hour
  return Math.max(4, (vam / g) / 1000)
}

export interface FatiguedPacingInput {
  thresholdWatts: number | null | undefined
  weightKg: number | null | undefined
  climbs: RouteClimb[]
  durability: DurabilityPoint[] | null | undefined
  /** The athlete's habitual endurance power on the flat, for the kJ estimate.
   *  Falls back to 65% of threshold, the middle of Z2. */
  flatWatts?: number | null
  /** Average moving speed for the flat/rolling sections, km/h. */
  avgSpeedKmh?: number | null
}

/**
 * Per-climb pacing for the real route, adjusted for the fatigue the rider will
 * actually be carrying when they get there.
 */
export function fatiguedClimbPacing(input: FatiguedPacingInput): ClimbPacing[] | null {
  const ftp = input.thresholdWatts
  if (ftp == null || !Number.isFinite(ftp) || ftp <= 0) return null
  const climbs = (input.climbs ?? [])
    .filter((c) => Number.isFinite(c.elevM) && Number.isFinite(c.distanceM) && c.distanceM > 0)
    .sort((a, b) => a.startDistM - b.startDistM)
  if (climbs.length === 0) return null

  const kg = input.weightKg && input.weightKg > 0 ? input.weightKg : null
  const flatW = input.flatWatts && input.flatWatts > 0 ? input.flatWatts : ftp * 0.65
  const avgKmh = input.avgSpeedKmh && input.avgSpeedKmh > 0 ? input.avgSpeedKmh : 26

  return climbs.map((c, i) => {
    const kjAtBase = kjSpentBy(c.startDistM, avgKmh, flatW)
    // Duration drives the fresh intensity band. Without a weight we cannot get
    // W/kg, so fall back to a 3 W/kg climber — stated, not hidden.
    const wkg = kg ? (ftp * 0.95) / kg : 3
    const speed = climbSpeedKmh(c.avgGradePct, wkg)
    const durationS = (c.distanceM / 1000 / speed) * 3600
    const freshFrac = freshFractionForDuration(durationS)
    const freshWatts = Math.round(ftp * freshFrac)

    const drop = dropAtKj(input.durability, kjAtBase)
    const basis: PacingBasis = drop ? 'measured' : 'fresh'
    const decay = drop ? drop.dropPct / 100 : 0
    const pct = freshFrac * (1 - decay)
    const watts = Math.round(ftp * pct)

    return {
      index: i + 1,
      elevM: c.elevM,
      avgGradePct: c.avgGradePct,
      kjAtBase,
      pctOfThreshold: Math.round(pct * 1000) / 10,
      watts,
      freshWatts,
      fadeW: freshWatts - watts,
      basis,
      extrapolated: drop?.extrapolated ?? false,
    }
  })
}
