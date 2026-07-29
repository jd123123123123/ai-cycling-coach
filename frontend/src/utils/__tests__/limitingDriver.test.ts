import { describe, it, expect } from 'vitest'
import { limitingDriver, type DriverDatum } from '../limitingDriver'

function d(key: string, dev: number | null): DriverDatum {
  return { key, label: key.toUpperCase(), value: '42', delta: null, dev }
}

describe('limitingDriver', () => {
  it('picks the signal furthest below baseline', () => {
    const worst = limitingDriver([d('hrv', -0.2), d('rhr', -0.75), d('sleep', -0.4)])
    expect(worst?.key).toBe('rhr')
  })

  it('ignores signals with no baseline to compare against', () => {
    // Respiration, SpO2 and skin temp pass dev: null — they have no 7-day
    // baseline in the feed, so they can never be named as the limiter.
    // -0.3 clears the meaningful-deviation floor, isolating this test's
    // actual intent (null exclusion) from the floor tested separately below.
    const worst = limitingDriver([d('spo2', null), d('hrv', -0.3)])
    expect(worst?.key).toBe('hrv')
  })

  it('returns null when nothing is below baseline — an athlete can be limited by nothing', () => {
    expect(limitingDriver([d('hrv', 0.3), d('sleep', 0.1), d('rhr', 0)])).toBeNull()
  })

  it('treats exactly-at-baseline as not limiting', () => {
    expect(limitingDriver([d('hrv', 0)])).toBeNull()
  })

  it('is null for an empty list rather than throwing', () => {
    expect(limitingDriver([])).toBeNull()
  })

  it('ignores non-finite deviations instead of ranking them', () => {
    const worst = limitingDriver([d('bad', NaN), d('hrv', -0.2)])
    expect(worst?.key).toBe('hrv')
  })

  it('breaks ties in input order, so the display order decides', () => {
    const worst = limitingDriver([d('hrv', -0.5), d('sleep', -0.5)])
    expect(worst?.key).toBe('hrv')
  })

  it('carries the driver through untouched, so the caller can render its real value', () => {
    const rich: DriverDatum = { key: 'hrv', label: 'HRV', value: '48 ms', delta: '−15', dev: -0.7 }
    expect(limitingDriver([rich, d('sleep', -0.1)])).toEqual(rich)
  })

  it('does not name a driver whose deviation is noise, not a real limiter', () => {
    // -0.02 is technically negative but far inside the display-rounding floor
    // — the kind of deviation the original bug (a rounded "−0" delta shown as
    // evidence) came from. Real limiters clear the floor; noise does not.
    expect(limitingDriver([d('hrv', -0.02), d('sleep', 0.3)])).toBeNull()
  })

  it('still names a driver whose deviation is real, not just below zero', () => {
    expect(limitingDriver([d('hrv', -0.4), d('sleep', 0.1)])?.key).toBe('hrv')
  })
})
