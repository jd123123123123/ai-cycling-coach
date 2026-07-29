/**
 * limitingDriver — of the athlete's overnight signals, which one is actually
 * holding readiness back today.
 *
 * The Körper chapter's "Moment" slot needs one thing to feature, and a flat
 * list of seven tiles does not tell the reader which of them to care about.
 * Every tile already carries the answer: `dev`, the deviation from that
 * athlete's OWN 7-day baseline, negative when worse. This picks the most
 * negative one.
 *
 * Honesty rules:
 *  • A signal with no baseline (`dev: null` — respiration, SpO₂, skin temp,
 *    none of which the feed provides a 7-day average for) can never be named
 *    as the limiter. Absence of a comparison is not evidence of a problem.
 *  • Nothing below baseline returns null, not "the least good one". An athlete
 *    whose every signal is at or above baseline is limited by nothing, and the
 *    UI must be able to say so by rendering no Moment at all.
 *  • Exactly at baseline is NOT limiting. Only strictly below counts.
 *
 * The caller is responsible for the stale-wearable gate: on a day where
 * readiness is withheld, these deviations are computed against days-old
 * values and must not be presented as today's verdict at all.
 */

export interface DriverDatum {
  /** Stable identity for React keys and tests. */
  key: string
  label: string
  /** Already-formatted display value, e.g. "48 ms" or an em-dash. */
  value: string
  /** Already-formatted signed delta vs baseline, e.g. "−15". Null when absent. */
  delta: string | null
  /** Deviation from the athlete's own baseline, clamped [-1, 1].
   *  NEGATIVE = worse than baseline. Null when no baseline exists. */
  dev: number | null
}

export function limitingDriver(drivers: DriverDatum[]): DriverDatum | null {
  let worst: DriverDatum | null = null
  for (const dr of drivers ?? []) {
    if (dr.dev == null || !Number.isFinite(dr.dev) || dr.dev >= 0) continue
    // Strictly less-than keeps ties on the first seen, so the on-screen order
    // decides rather than an arbitrary sort.
    if (worst == null || dr.dev < worst.dev!) worst = dr
  }
  return worst
}
