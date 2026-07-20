/**
 * format.ts — shared number- and date-presentation utilities.
 *
 * Rules:
 * - Typographic minus sign U+2212 (−) is used instead of ASCII hyphen-minus (-).
 *   This is non-negotiable per research doc §2.4.4 (tabular-friendly, visually distinct).
 * - Number helpers are pure with no external dependencies; date helpers are the
 *   ONE canonical locale-aware path (date-fns + de locale) — never call
 *   date-fns format() with an EN-literal pattern in a component (audit P1-6).
 */
import { format as dateFnsFormat, parseISO as dateFnsParseISO } from 'date-fns'
import { de as dateFnsDe } from 'date-fns/locale'
import type { Locale as UiLocale } from '../i18n/strings'

function toDate(d: Date | string | number): Date {
  return typeof d === 'string' ? dateFnsParseISO(d) : new Date(d)
}

/**
 * formatDate(d, pattern, locale) — THE canonical locale-aware date formatter.
 * Routes through date-fns with the German locale when locale === 'de', so a
 * German user never reads "Monday, 20. July" chrome.
 *
 * @example
 * formatDate(new Date(2026, 6, 20), 'EEEE, MMM d', 'en')   // "Monday, Jul 20"
 * formatDate(new Date(2026, 6, 20), 'EEEE, d. MMM', 'de')  // "Montag, 20. Juli"
 * formatDate('2026-07-20', 'EEEEEE', 'de')                 // "Mo"  (day-strip initial)
 * formatDate('not-a-date', 'EEE')                          // "—"   (honest dash)
 */
export function formatDate(
  d: Date | string | number,
  pattern: string,
  locale: UiLocale = 'en',
): string {
  const date = toDate(d)
  if (Number.isNaN(date.getTime())) return '—'
  return dateFnsFormat(date, pattern, locale === 'de' ? { locale: dateFnsDe } : undefined)
}

/**
 * formatTime24(d, locale) — locale-appropriate clock time.
 * German gets 24-hour ("10:21" — never "10:21 AM"); English keeps 12-hour.
 *
 * @example
 * formatTime24(new Date(2026, 6, 20, 14, 9), 'de') // "14:09"
 * formatTime24(new Date(2026, 6, 20, 14, 9), 'en') // "2:09 PM"
 */
export function formatTime24(d: Date | string | number, locale: UiLocale = 'en'): string {
  const date = toDate(d)
  if (Number.isNaN(date.getTime())) return '—'
  return locale === 'de'
    ? dateFnsFormat(date, 'HH:mm', { locale: dateFnsDe })
    : dateFnsFormat(date, 'h:mm a')
}

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
