/**
 * limitingDriver — of the athlete's overnight signals, which one is actually
 * holding readiness back today.
 *
 * The Körper chapter's "Moment" slot needs one thing to feature, and a flat
 * list of six tiles does not tell the reader which of them to care about.
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
 *  • Below baseline is not enough on its own — it must clear
 *    MEANINGFUL_DEVIATION. Noise-level negatives (an integer feed value
 *    wobbling against a float rolling average) are technically < 0 on roughly
 *    half of all days, and can even round to a displayed "−0" delta. Naming
 *    those as "limiting" asserts a verdict the display itself can't support.
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

// `dev` is clamped to [-1, 1] across all six signals. 0.15 of that range is
// roughly the display-rounding noise floor for the three signals that carry
// a real baseline: ~3ms of HRV's /20 divisor, ~1.2bpm of resting HR's /8
// divisor, ~3 points of sleep's /20 divisor. Below that magnitude the signal
// cannot even show a nonzero rounded delta (e.g. hrvNow=47, hrv7=47.4 gives
// dev=-0.02 and a delta string that rounds to "−0"), so calling it "limiting"
// would be citing evidence the UI can't actually display.
const MEANINGFUL_DEVIATION = -0.15

export function limitingDriver<T extends DriverDatum>(drivers: T[]): T | null {
  let worst: T | null = null
  for (const dr of drivers ?? []) {
    if (dr.dev == null || !Number.isFinite(dr.dev) || dr.dev >= MEANINGFUL_DEVIATION) continue
    // Strictly less-than keeps ties on the first seen, so the on-screen order
    // decides rather than an arbitrary sort.
    if (worst == null || dr.dev < worst.dev!) worst = dr
  }
  return worst
}
