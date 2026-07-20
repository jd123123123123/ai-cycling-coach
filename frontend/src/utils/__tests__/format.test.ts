/**
 * format.test.ts — canonical locale-aware date helpers (audit P1-6).
 * A German user must never read English chrome dates ("Monday, 20. July",
 * "12:09 PM") — formatDate/formatTime24 are THE one path for date rendering.
 */
import { describe, it, expect } from 'vitest'
import { formatDate, formatTime24, formatSigned, formatHours, formatDelta, honestPercent } from '../format'

// Monday, 20 July 2026, 14:09 local.
const d = new Date(2026, 6, 20, 14, 9)

describe('formatDate', () => {
  it('renders English patterns without a locale option', () => {
    expect(formatDate(d, 'EEEE, MMM d', 'en')).toBe('Monday, Jul 20')
    expect(formatDate(d, 'EEE', 'en')).toBe('Mon')
  })

  it('renders German day and month names with locale de', () => {
    expect(formatDate(d, 'EEEE, d. MMM', 'de')).toBe('Montag, 20. Juli')
    expect(formatDate(d, 'd. MMMM yyyy', 'de')).toBe('20. Juli 2026')
  })

  it('renders German day-strip initials (EEEEEE → Mo/Di/…)', () => {
    expect(formatDate(d, 'EEEEEE', 'de')).toBe('Mo')
    expect(formatDate(new Date(2026, 6, 22), 'EEEEEE', 'de')).toBe('Mi')
  })

  it('accepts ISO strings (parseISO path)', () => {
    expect(formatDate('2026-07-20', 'EEEEEE', 'de')).toBe('Mo')
    expect(formatDate('2026-07-20', 'EEE', 'en')).toBe('Mon')
  })

  it('defaults to English when no locale is passed', () => {
    expect(formatDate(d, 'EEEE')).toBe('Monday')
  })

  it('returns an honest dash for invalid input', () => {
    expect(formatDate('not-a-date', 'EEE', 'de')).toBe('—')
  })
})

describe('formatTime24', () => {
  it('gives German users a 24-hour clock — never AM/PM', () => {
    expect(formatTime24(d, 'de')).toBe('14:09')
    expect(formatTime24(new Date(2026, 6, 20, 9, 5), 'de')).toBe('09:05')
  })

  it('keeps 12-hour clock for English', () => {
    expect(formatTime24(d, 'en')).toBe('2:09 PM')
  })

  it('returns an honest dash for invalid input', () => {
    expect(formatTime24('garbage', 'de')).toBe('—')
  })
})

// Existing pure number helpers still behave (guard against regressions from
// the date-helper additions in the same module).
describe('number helpers (regression)', () => {
  it('formatSigned uses the typographic minus', () => {
    expect(formatSigned(-3.4, 1)).toBe('−3.4')
    expect(formatSigned(18)).toBe('+18')
  })
  it('formatHours renders dash on null', () => {
    expect(formatHours(null)).toBe('—')
    expect(formatHours(2520)).toBe('0.7h')
  })
})

// ── Honest-dash enforcement (audit P2-16): untracked NEVER renders as 0. ──
describe('honestPercent', () => {
  it('renders a rounded percent for tracked values', () => {
    expect(honestPercent(87.4)).toBe('87%')
    expect(honestPercent(99.6)).toBe('100%')
  })
  it('renders a TRACKED zero as 0% — real zeros are real', () => {
    expect(honestPercent(0)).toBe('0%')
    expect(honestPercent(0, true)).toBe('0%')
  })
  it('never renders an untracked series as 0%', () => {
    expect(honestPercent(0, false)).toBe('—')
    expect(honestPercent(42, false)).toBe('—')
  })
  it('renders the honest dash for missing input', () => {
    expect(honestPercent(null)).toBe('—')
    expect(honestPercent(undefined)).toBe('—')
    expect(honestPercent(Number.NaN)).toBe('—')
    expect(honestPercent(Infinity)).toBe('—')
  })
})

describe('formatDelta — null in, null out (never coerced to 0%)', () => {
  it('computes signed percent change', () => {
    expect(formatDelta(110, 100)).toBe('+10%')
    expect(formatDelta(90, 100)).toBe('−10%')
    expect(formatDelta(100, 100)).toBe('0%')
  })
  it('returns null when either side is missing', () => {
    expect(formatDelta(null, 100)).toBeNull()
    expect(formatDelta(110, null)).toBeNull()
    expect(formatDelta(undefined, undefined)).toBeNull()
    expect(formatDelta(Number.NaN, 100)).toBeNull()
  })
  it('returns null on a zero baseline instead of inventing a number', () => {
    expect(formatDelta(0, 0)).toBeNull()
    expect(formatDelta(50, 0)).toBeNull()
  })
})

describe('formatSigned — missing is a dash, not a zero', () => {
  it('renders the honest dash for null/undefined/NaN', () => {
    expect(formatSigned(null)).toBe('—')
    expect(formatSigned(undefined)).toBe('—')
    expect(formatSigned(Number.NaN)).toBe('—')
  })
  it('still renders a real zero as "0"', () => {
    expect(formatSigned(0)).toBe('0')
  })
})
