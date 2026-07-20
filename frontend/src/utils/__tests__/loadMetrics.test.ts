/**
 * loadMetrics.test.ts — pins the behavior of the canonical load/form selectors
 * (usability audit P0-5: one producer per number).
 *
 * The properties under test are exactly the contradictions the audit found:
 *   - displayed TSB must reconcile with displayed CTL/ATL (33 − 26 = 7),
 *   - days-to-event must use calendar-day semantics (never flip at noon),
 *   - day bucketing must be local-timezone aware (a 00:30 Berlin ride is
 *     not "yesterday").
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { latestLoad, daysToEvent, localDayKey, isTodayLocal } from '../loadMetrics'
import type { PMCEntry } from '../../api/dashboard'

function entry(date: string, ctl: number, atl: number): PMCEntry {
  return { date, ctl, atl, tsb: ctl - atl, daily_tss: null }
}

describe('latestLoad', () => {
  it('returns null for missing or empty series', () => {
    expect(latestLoad(undefined)).toBeNull()
    expect(latestLoad(null)).toBeNull()
    expect(latestLoad([])).toBeNull()
  })

  it('derives tsb from the DISPLAYED (rounded) ctl/atl, even when raw rounding disagrees', () => {
    // Raw tsb = 32.4 − 25.6 = 6.8 → Math.round would show +7,
    // but the user sees CTL 32 and ATL 26, so the only honest TSB is 32 − 26 = 6.
    const load = latestLoad([entry('2026-07-20', 32.4, 25.6)])!
    expect(load.ctl).toBe(32)
    expect(load.atl).toBe(26)
    expect(load.tsb).toBe(6)
    expect(load.tsb).toBe(load.ctl - load.atl)
    expect(load.tsb).not.toBe(Math.round(32.4 - 25.6)) // the bug this API exists to prevent
  })

  it('reads the LAST entry of the series', () => {
    const load = latestLoad([entry('2026-07-19', 50, 40), entry('2026-07-20', 33.2, 26.4)])!
    expect(load.ctl).toBe(33)
    expect(load.atl).toBe(26)
    expect(load.tsb).toBe(7)
  })

  it('computes dCtl7 against the entry 7 days back, null when history is short', () => {
    const short = latestLoad([entry('2026-07-19', 30, 30), entry('2026-07-20', 32, 30)])!
    expect(short.dCtl7).toBeNull()

    const series: PMCEntry[] = [
      entry('2026-07-13', 28.6, 30), // len-8 → baseline
      entry('2026-07-14', 29, 30),
      entry('2026-07-15', 29.5, 30),
      entry('2026-07-16', 30, 30),
      entry('2026-07-17', 30.5, 30),
      entry('2026-07-18', 31, 30),
      entry('2026-07-19', 31.5, 30),
      entry('2026-07-20', 32.4, 30), // last
    ]
    // round(32.4 − 28.6) = round(3.8) = 4 — rounded once on the difference,
    // not derived from independently-rounded endpoints.
    expect(latestLoad(series)!.dCtl7).toBe(4)
  })
})

describe('daysToEvent (calendar-day semantics)', () => {
  const now = new Date(2026, 6, 20, 8, 0) // Mon 2026-07-20 08:00 local

  it('event tomorrow at 23:59 is 1 day away (not 2 via ceil over ms)', () => {
    expect(daysToEvent(new Date(2026, 6, 21, 23, 59), now)).toBe(1)
  })

  it('event later today is 0 days away regardless of clock time', () => {
    expect(daysToEvent(new Date(2026, 6, 20, 23, 59), now)).toBe(0)
    expect(daysToEvent(new Date(2026, 6, 20, 0, 1), now)).toBe(0)
  })

  it('accepts yyyy-mm-dd strings as local midnight', () => {
    expect(daysToEvent('2026-07-21', now)).toBe(1)
    expect(daysToEvent('2026-07-20', now)).toBe(0)
    expect(daysToEvent('2026-12-06', now)).toBe(139)
  })

  it('is stable across the time of day of `now` (never flips at noon)', () => {
    const morning = new Date(2026, 6, 20, 0, 1)
    const night = new Date(2026, 6, 20, 23, 59)
    expect(daysToEvent('2026-12-06', morning)).toBe(daysToEvent('2026-12-06', night))
  })

  it('returns null for missing or invalid input', () => {
    expect(daysToEvent(null, now)).toBeNull()
    expect(daysToEvent(undefined, now)).toBeNull()
    expect(daysToEvent('not-a-date', now)).toBeNull()
  })
})

describe('localDayKey / isTodayLocal (TZ=Europe/Berlin)', () => {
  // vi.stubEnv avoids a direct `process` reference (tsconfig.app has no node
  // types); Node re-reads TZ on Date construction, so this takes effect live.
  beforeAll(() => {
    vi.stubEnv('TZ', 'Europe/Berlin')
  })
  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('buckets a UTC evening timestamp onto the LOCAL next day', () => {
    // 23:30 UTC on Mar 1 = 00:30 Berlin (CET, +01:00) on Mar 2.
    const utcEvening = '2026-03-01T23:30:00Z'
    expect(localDayKey(utcEvening)).toBe('2026-03-02')
    // …which is exactly why `iso.slice(0, 10)` is banned:
    expect(utcEvening.slice(0, 10)).toBe('2026-03-01')
  })

  it('keeps a mid-day UTC timestamp on the same local day', () => {
    expect(localDayKey('2026-03-01T12:00:00Z')).toBe('2026-03-01')
  })

  it('formats Date inputs as local yyyy-MM-dd with zero padding', () => {
    expect(localDayKey(new Date(2026, 0, 5, 9, 0))).toBe('2026-01-05')
  })

  it('isTodayLocal matches timestamps on the local current day only', () => {
    const now = new Date(2026, 2, 2, 8, 0) // Mar 2, 08:00 Berlin
    expect(isTodayLocal('2026-03-01T23:30:00Z', now)).toBe(true) // 00:30 Berlin Mar 2
    expect(isTodayLocal('2026-03-01T12:00:00Z', now)).toBe(false)
    expect(isTodayLocal('2026-03-02T10:00:00Z', now)).toBe(true)
  })
})
