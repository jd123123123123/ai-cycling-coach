/**
 * roadProfile — the physiology behind "Today's Road".
 *
 * Converts the day's prescribed blocks into a terrain profile plus a forward
 * W′-balance projection. Pure: no React, no network, no GL. The shader draws
 * only what this module produces, so every physiological decision is testable
 * here.
 *
 * Ground level is Critical Power: above CP the athlete spends W′ (a climb),
 * below CP it reconstitutes (a descent). See
 * docs/superpowers/specs/2026-07-27-todays-road-design.md.
 */
import type { ResolvedBlock } from '../api/coach'

/** One constant-power segment of the session, already set-expanded. */
export interface PowerStep {
  watts: number
  zone: number
  durationS: number
  blockIndex: number
}

/** Coggan zone boundaries by % of FTP. Display-only (terrain tint). */
export function zoneForPctFtp(pct: number): number {
  if (pct <= 55) return 1
  if (pct <= 75) return 2
  if (pct <= 90) return 3
  if (pct <= 105) return 4
  if (pct <= 120) return 5
  if (pct <= 150) return 6
  return 7
}

const mid = (lo: number, hi: number) => (lo + hi) / 2

/**
 * Expand blocks into constant-power steps, turning structured sets into their
 * real reps. A set whose off-watts are unknown stays one steady step rather
 * than inventing a recovery power.
 */
export function expandBlocks(blocks: ResolvedBlock[]): PowerStep[] {
  const steps: PowerStep[] = []
  blocks.forEach((b, blockIndex) => {
    if (!(b.duration_s > 0)) return
    const onWatts = mid(b.target_watts_low, b.target_watts_high)
    const reps = b.reps ?? 0
    const onS = b.on_s ?? 0
    const offS = b.off_s ?? 0
    const offLo = b.off_watts_low
    const offHi = b.off_watts_high
    const isSet = reps > 0 && onS > 0 && offS > 0 && offLo != null && offHi != null

    if (!isSet) {
      steps.push({ watts: onWatts, zone: b.zone, durationS: b.duration_s, blockIndex })
      return
    }
    const offWatts = mid(offLo, offHi)
    const offZone = b.off_pct_ftp != null ? zoneForPctFtp(b.off_pct_ftp) : b.zone
    for (let i = 0; i < reps; i++) {
      steps.push({ watts: onWatts, zone: b.zone, durationS: onS, blockIndex })
      steps.push({ watts: offWatts, zone: offZone, durationS: offS, blockIndex })
    }
  })
  return steps
}

/** One terrain sample. `wbal` is null whenever CP/W′ are unknown. */
export interface RoadSample {
  /** Normalized session time, 0..1. */
  t: number
  watts: number
  zone: number
  /** Joules of W′ remaining at this point; null when CP/W′ unknown. */
  wbal: number | null
  blockIndex: number
}

export interface RoadProfile {
  samples: RoadSample[]
  cp: number | null
  wPrime: number | null
  /** Deepest W′ reached; null when CP/W′ unknown. */
  minWbal: number | null
  totalDurationS: number
}

export const MAX_SAMPLES = 512
/** Pathological-input guard: never integrate more than 6 h of 1 Hz samples. */
const MAX_SECONDS = 21600

/**
 * Per-second W′-balance (joules remaining), starting full at W′.
 * Skiba, Clarke, Vanhatalo & Jones (2015) differential model — a direct port of
 * `backend/app/services/w_balance.py::w_prime_balance` so the forward
 * projection and the post-ride trace never disagree.
 */
export function wPrimeBalance(power: number[], cp: number, wPrime: number): number[] {
  let bal = wPrime
  const out: number[] = []
  for (const p of power) {
    if (p > cp) {
      bal -= p - cp
    } else {
      bal += ((wPrime - bal) * (cp - p)) / wPrime
      if (bal > wPrime) bal = wPrime
    }
    out.push(bal)
  }
  return out
}

/** Evenly-spaced indices over [0, n-1], always including both ends. */
function evenIndices(n: number, count: number): number[] {
  if (n <= count) return Array.from({ length: n }, (_, i) => i)
  const out: number[] = []
  for (let k = 0; k < count; k++) out.push(Math.round((k * (n - 1)) / (count - 1)))
  return out
}

/**
 * Build the day's road: set-expanded terrain plus the forward W′ projection.
 * Passing `cp: null` (which the caller must do whenever `model_valid` is false)
 * yields terrain with no W′ — never a substituted default.
 */
export function buildRoadProfile(
  blocks: ResolvedBlock[],
  power: { cp: number | null; wPrime: number | null },
): RoadProfile {
  const steps = expandBlocks(blocks)
  const cp = power.cp != null && power.cp > 0 ? power.cp : null
  const wPrime = power.wPrime != null && power.wPrime > 0 ? power.wPrime : null
  const totalDurationS = steps.reduce((s, x) => s + x.durationS, 0)

  if (steps.length === 0 || totalDurationS <= 0) {
    return { samples: [], cp, wPrime, minWbal: null, totalDurationS: 0 }
  }

  // Flatten to 1 Hz so the W′ integration matches the backend's assumptions.
  const watts: number[] = []
  const zones: number[] = []
  const owners: number[] = []
  for (const s of steps) {
    const secs = Math.max(1, Math.round(s.durationS))
    for (let i = 0; i < secs && watts.length < MAX_SECONDS; i++) {
      watts.push(s.watts)
      zones.push(s.zone)
      owners.push(s.blockIndex)
    }
  }

  const wbal = cp != null && wPrime != null ? wPrimeBalance(watts, cp, wPrime) : null
  const minWbal = wbal != null && wbal.length > 0 ? Math.min(...wbal) : null

  // Resample, always keeping the deepest W′ point — it is the headline.
  const keep = new Set(evenIndices(watts.length, MAX_SAMPLES))
  if (wbal != null && minWbal != null) keep.add(wbal.indexOf(minWbal))
  const idx = [...keep].sort((a, b) => a - b)

  const span = Math.max(1, watts.length - 1)
  const samples: RoadSample[] = idx.map((i) => ({
    t: i / span,
    watts: watts[i],
    zone: zones[i],
    wbal: wbal != null ? wbal[i] : null,
    blockIndex: owners[i],
  }))

  return { samples, cp, wPrime, minWbal, totalDurationS }
}

/**
 * A single steady block synthesized from a planned duration + target watts, for
 * days that have a session but no `interval_structure`. Returns null unless
 * BOTH values are real — a road is never invented from a guess.
 * The terrain reads as a gentle rolling road because the shader's fbm grain is
 * the only relief on a constant-power profile.
 */
export function steadyBlock(
  durationMin: number | null | undefined,
  targetWatts: number | null | undefined,
): ResolvedBlock | null {
  if (durationMin == null || targetWatts == null) return null
  if (!(durationMin > 0) || !(targetWatts > 0)) return null
  return {
    name: '', duration_s: Math.round(durationMin * 60),
    target_watts_low: targetWatts, target_watts_high: targetWatts,
    target_pct_ftp: 0, zone: 2, rpe: 4,
    cadence_low: null, cadence_high: null,
    target_hr_low: null, target_hr_high: null,
  }
}
