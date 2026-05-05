/**
 * confidence.ts — honesty-layer utility for the Phase 7.05 "one screen of truth" mandate.
 *
 * Why this exists:
 * - Single call site replaces 11+ places where consumers would otherwise inline
 *   `if (n_days >= 7) ...` with inconsistent threshold values.
 * - The `preconditions` record is optional so polarized (only n_days) and CTL trend
 *   (n_days + has_ftp) share the same signature without overloading.
 * - Returns 'high' | 'low' (binary, not a 0..1 score). The UI only ever needs to
 *   switch between "show the number" and "show the placeholder." We don't want a
 *   third state in v1.
 *
 * Threshold mandate (from 07.05 phase research doc):
 *   HRV         → min 7 days
 *   CTL trend   → min 14 days
 *   Polarized   → min 7 days
 *
 * NO React. NO async. NO date-fns. Pure function over plain objects.
 */

export type ConfidenceLevel = 'high' | 'low'

export interface ConfidenceInput {
  /** Number of days of relevant data the metric is computed from. */
  n_days?: number | null
  /** Minimum days required for 'high' confidence (e.g. 7 for HRV, 14 for CTL trend). */
  min_days: number
  /**
   * Optional preconditions — any false/null/undefined flag forces 'low'.
   * Examples: { has_ftp: false } → no PMC trend; { has_lthr: null } → no HR zones.
   */
  preconditions?: Record<string, boolean | null | undefined>
}

/**
 * confidence(input) — determine whether a metric has sufficient data for display.
 *
 * Returns 'low' if:
 *   - n_days is missing or below min_days
 *   - any precondition value is false, null, or undefined
 *
 * Returns 'high' only when ALL conditions are satisfied.
 */
export function confidence(input: ConfidenceInput): ConfidenceLevel {
  const days = input.n_days ?? 0
  if (days < input.min_days) return 'low'
  if (input.preconditions) {
    for (const v of Object.values(input.preconditions)) {
      if (v === false || v == null) return 'low'
    }
  }
  return 'high'
}

// ── Standard threshold constants ─────────────────────────────────────────────
// Export as named constants so consumers never magic-number these values.
// Changing a threshold here changes it everywhere; a renamed constant is a
// compile-time error in confidence.test.ts even before vitest is installed.

/** Minimum days of HRV data required for high-confidence display. */
export const MIN_DAYS_HRV = 7

/** Minimum days of load data required for a high-confidence CTL trend. */
export const MIN_DAYS_CTL_TREND = 14

/** Minimum days of activity data required for high-confidence polarized distribution. */
export const MIN_DAYS_POLARIZED = 7
