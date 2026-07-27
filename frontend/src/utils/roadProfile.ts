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
