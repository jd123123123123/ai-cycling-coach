/**
 * format.ts — shared number-presentation utilities for the 06.2 token system.
 *
 * Rules:
 * - Typographic minus sign U+2212 (−) is used instead of ASCII hyphen-minus (-).
 *   This is non-negotiable per research doc §2.4.4 (tabular-friendly, visually distinct).
 * - All functions are pure and have no external dependencies.
 */

/**
 * formatSigned(n, digits=0) — explicit sign, typographic minus (U+2212), tabular-friendly.
 *
 * @example
 * formatSigned(0, 0)    // "0"     (no sign on zero)
 * formatSigned(18, 0)   // "+18"
 * formatSigned(-3.4, 1) // "−3.4"  (NOTE: U+2212, not hyphen-minus)
 */
export function formatSigned(n: number, digits = 0): string {
  if (n === 0) return '0'
  if (n > 0) return '+' + n.toFixed(digits)
  // U+2212 MINUS SIGN (not ASCII hyphen-minus U+002D)
  return '−' + Math.abs(n).toFixed(digits)
}

/**
 * formatHours(seconds) — Whoop-style: ≤9.9h shows one decimal, ≥10h shows integer.
 *
 * @example
 * formatHours(2520)   // "0.7h"
 * formatHours(36000)  // "10h"
 * formatHours(null)   // "—"
 */
export function formatHours(seconds: number | null | undefined): string {
  if (seconds == null || !isFinite(seconds)) return '—'
  const hours = seconds / 3600
  if (hours < 10) return `${hours.toFixed(1)}h`
  return `${Math.round(hours)}h`
}

/**
 * formatDelta(curr, prev) — pct change with sign and "%". Returns null on insufficient data.
 *
 * Returns null if either input is null/undefined/NaN, or if prev is 0 (division by zero).
 *
 * @example
 * formatDelta(110, 100) // "+10%"
 * formatDelta(90, 100)  // "−10%"
 * formatDelta(0, 0)     // null
 */
export function formatDelta(
  curr: number | null | undefined,
  prev: number | null | undefined,
): string | null {
  if (curr == null || prev == null) return null
  if (!isFinite(curr) || !isFinite(prev)) return null
  if (prev === 0) return null
  const pct = ((curr - prev) / prev) * 100
  if (!isFinite(pct)) return null
  return formatSigned(Math.round(pct), 0) + '%'
}
