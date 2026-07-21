import { describe, it, expect } from 'vitest'
import { deriveExtraSessions, type ExtraActivity } from '../extraSessions'

// Fixed anchor: Tuesday 21 Jul 2026, local midday. 7-day window covers 15–21 Jul.
const TODAY = new Date(2026, 6, 21, 12, 0, 0)

// Activity at local time on a given day-of-month in Jul 2026.
const act = (
  dayOfMonth: number,
  hour: number,
  sport: string,
  extra: Partial<ExtraActivity> = {},
): ExtraActivity => ({
  started_at: new Date(2026, 6, dayOfMonth, hour, 0, 0).toISOString(),
  sport,
  duration_seconds: 45 * 60,
  tss: 20,
  ...extra,
})

describe('deriveExtraSessions', () => {
  it('honest empty state with no activities', () => {
    const m = deriveExtraSessions([], TODAY)
    expect(m.count).toBe(0)
    expect(m.sessions).toEqual([])
    expect(m.extraTss).toBe(0)
    expect(m.sharePct).toBe(null)
    expect(m.windowTss).toBe(0)
  })

  it('a single planned bike ride per day yields NO extra sessions', () => {
    const m = deriveExtraSessions([act(20, 10, 'cycling', { tss: 60 }), act(19, 9, 'cycling', { tss: 50 })], TODAY)
    expect(m.count).toBe(0)
    expect(m.windowTss).toBe(110)
  })

  it('a second ride the same day is additional; the first is primary', () => {
    const m = deriveExtraSessions([
      act(20, 8, 'cycling', { tss: 60 }),   // primary
      act(20, 17, 'cycling', { tss: 40 }),  // 2nd ride → additional
    ], TODAY)
    expect(m.count).toBe(1)
    expect(m.sessions[0].kind).toBe('ride')
    expect(m.extraTss).toBe(40)
    expect(m.byKind.ride).toBe(1)
    // Share = 40 / (60 + 40) = 40%
    expect(m.sharePct).toBe(40)
  })

  it('non-cycling sessions are additional even without any ride that day', () => {
    const m = deriveExtraSessions([
      act(19, 8, 'gym', { tss: 17 }),
      act(15, 10, 'running', { tss: 16 }),
    ], TODAY)
    expect(m.count).toBe(2)
    expect(m.byKind.gym).toBe(1)
    expect(m.byKind.run).toBe(1)
    expect(m.extraTss).toBe(33)
    expect(m.sharePct).toBe(100) // no primary ride in window, all load is extra
  })

  it('mixed day: ride primary, run additional; plus standalone gym/run', () => {
    const m = deriveExtraSessions([
      act(20, 15, 'cycling', { tss: 49 }),  // primary (first cycling of day 20)
      act(20, 16, 'running', { tss: 18 }),  // additional
      act(19, 8, 'gym', { tss: 17 }),       // additional
      act(15, 10, 'running', { tss: 16 }),  // additional
      act(17, 10, 'cycling', { tss: 63 }),  // primary (only ride that day)
    ], TODAY)
    expect(m.count).toBe(3)
    expect(m.withLoad).toBe(3)
    expect(m.withoutLoad).toBe(0)
    expect(m.extraTss).toBe(51) // 18 + 17 + 16
    expect(m.windowTss).toBe(163) // 49+18+17+16+63
    expect(m.sharePct).toBe(Math.round((51 / 163) * 100))
    // newest first
    expect(m.sessions[0].dayKey.endsWith('-20')).toBe(true)
  })

  it('a load-less extra session is counted but not summed (duration-only)', () => {
    const m = deriveExtraSessions([
      act(20, 8, 'cycling', { tss: 60 }),                 // primary
      act(20, 18, 'gym', { tss: null, duration_seconds: 40 * 60 }), // additional, no load
    ], TODAY)
    expect(m.count).toBe(1)
    expect(m.withLoad).toBe(0)
    expect(m.withoutLoad).toBe(1)
    expect(m.extraTss).toBe(0)
    expect(m.sessions[0].tss).toBe(null)
    expect(m.sessions[0].durationSec).toBe(40 * 60)
  })

  it('excludes activities older than the 7-day window', () => {
    const m = deriveExtraSessions([
      act(13, 10, 'gym', { tss: 30 }),  // 8 days before → out of window
      act(15, 10, 'gym', { tss: 20 }),  // exactly 6 days before → in window
    ], TODAY)
    expect(m.count).toBe(1)
    expect(m.extraTss).toBe(20)
  })

  it('buckets an unplanned sport (padel) as "other"', () => {
    const m = deriveExtraSessions([act(19, 18, 'padel', { tss: 25 })], TODAY)
    expect(m.count).toBe(1)
    expect(m.sessions[0].kind).toBe('other')
    expect(m.byKind.other).toBe(1)
  })
})
