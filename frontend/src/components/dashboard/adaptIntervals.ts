/**
 * adaptIntervals — the plan API's interval blocks → the shared ResolvedBlock
 * shape the ribbon and the detail sheet render.
 *
 * Its own module rather than a second export from DayPlanCard: it is pure
 * arithmetic worth unit-testing, and a component file that also exports a
 * function breaks fast refresh.
 */
import type { IntervalBlockOut } from '../../api/weeks'
import type { ResolvedBlock } from '../../api/coach'

/** Map the plan API's blocks onto the shared ResolvedBlock shape.
 *
 *  This used to null out cadence and HR unconditionally and compute watts
 *  against a hardcoded 200 W FTP, so the plan could never show a cadence or
 *  HR prescription and printed the wrong watts for every athlete not at
 *  exactly 200 W. The server now sends all three; we prefer what it resolved,
 *  fall back to the athlete's real threshold, and report nothing at all
 *  rather than guess. */
export function adaptIntervals(
  intervals: IntervalBlockOut[],
  thresholdWatts: number | null,
): ResolvedBlock[] {
  return intervals.map((b, i) => {
    const pct = b.power_target_pct_ftp ?? 0.65
    const derived = thresholdWatts != null && thresholdWatts > 0
      ? { lo: Math.round(pct * thresholdWatts * 0.95), hi: Math.round(pct * thresholdWatts * 1.05) }
      : null
    return {
      name: `Segment ${i + 1}`,
      duration_s: b.duration_seconds,
      target_pct_ftp: pct,
      target_watts_low: b.target_watts_low ?? derived?.lo ?? null,
      target_watts_high: b.target_watts_high ?? derived?.hi ?? null,
      zone: b.zone,
      rpe: Math.round(b.zone * 1.2),
      cadence_low: b.cadence_low ?? null,
      cadence_high: b.cadence_high ?? null,
      target_hr_low: b.target_hr_low ?? null,
      target_hr_high: b.target_hr_high ?? null,
    }
  })
}
