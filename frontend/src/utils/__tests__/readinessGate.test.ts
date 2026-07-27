import { describe, it, expect } from 'vitest'
import {
  readinessFreshness,
  withholdReadiness,
  dayKeyDiff,
  STALE_AFTER_DAYS,
} from '../readinessGate'

const TODAY = '2026-07-27'

describe('dayKeyDiff', () => {
  it('counts whole days between two local day keys', () => {
    expect(dayKeyDiff('2026-07-27', '2026-07-20')).toBe(7)
    expect(dayKeyDiff('2026-07-27', '2026-07-27')).toBe(0)
    expect(dayKeyDiff('2026-07-27', '2026-07-28')).toBe(-1)
  })

  it('spans a month boundary', () => {
    expect(dayKeyDiff('2026-08-02', '2026-07-31')).toBe(2)
  })

  it('returns null for an unparseable key rather than NaN', () => {
    expect(dayKeyDiff('not-a-date', TODAY)).toBeNull()
  })
})

describe('readinessFreshness', () => {
  it('is "none" when the athlete has no overnight history at all', () => {
    expect(readinessFreshness([], TODAY).gate).toBe('none')
    expect(readinessFreshness(null, TODAY).gate).toBe('none')
  })

  it('is "none" when rows exist but carry no overnight signal', () => {
    // A daytime-only row (steps, stress) says nothing about the night.
    const rows = [{ date: TODAY, sleep_score: null, hrv_status: null, resting_hr: null }]
    expect(readinessFreshness(rows, TODAY).gate).toBe('none')
  })

  it('is "fresh" when today carries any single overnight signal', () => {
    for (const row of [
      { date: TODAY, sleep_score: 80 },
      { date: TODAY, hrv_status: 73 },
      { date: TODAY, resting_hr: 49 },
    ]) {
      const f = readinessFreshness([row], TODAY)
      expect(f.gate).toBe('fresh')
      expect(f.ageDays).toBe(0)
    }
  })

  it('is "pending" the morning after — yesterday synced, today has not', () => {
    const f = readinessFreshness([{ date: '2026-07-26', sleep_score: 88 }], TODAY)
    expect(f.gate).toBe('pending')
    expect(f.ageDays).toBe(1)
    expect(f.lastOvernightKey).toBe('2026-07-26')
  })

  it('is "stale" once the gap reaches STALE_AFTER_DAYS', () => {
    const key = `2026-07-${27 - STALE_AFTER_DAYS}`
    expect(readinessFreshness([{ date: key, sleep_score: 88 }], TODAY).gate).toBe('stale')
  })

  it('is "stale" for the week-old watch that stopped syncing (the 2026-07-27 bug)', () => {
    const f = readinessFreshness(
      [
        { date: '2026-07-20', sleep_score: 80, hrv_status: 73, resting_hr: 49 },
        { date: '2026-07-19', sleep_score: 98, hrv_status: 75, resting_hr: 48 },
      ],
      TODAY,
    )
    expect(f.gate).toBe('stale')
    expect(f.ageDays).toBe(7)
    expect(f.lastOvernightKey).toBe('2026-07-20')
  })

  it('picks the freshest row regardless of array order', () => {
    const f = readinessFreshness(
      [
        { date: '2026-07-10', sleep_score: 70 },
        { date: '2026-07-26', sleep_score: 70 },
        { date: '2026-07-14', sleep_score: 70 },
      ],
      TODAY,
    )
    expect(f.ageDays).toBe(1)
  })

  it('ignores future-dated rows so clock skew cannot mask real staleness', () => {
    const f = readinessFreshness(
      [
        { date: '2026-07-30', sleep_score: 90 }, // impossible; device clock ahead
        { date: '2026-07-20', sleep_score: 80 },
      ],
      TODAY,
    )
    expect(f.gate).toBe('stale')
    expect(f.ageDays).toBe(7)
  })
})

describe('withholdReadiness', () => {
  it('withholds the score while pending or stale', () => {
    for (const gate of ['pending', 'stale'] as const) {
      expect(withholdReadiness({ gate, trainedToday: false, sidelined: false })).toBe(true)
    }
  })

  it('shows the score when today has its own overnight data', () => {
    expect(withholdReadiness({ gate: 'fresh', trainedToday: false, sidelined: false })).toBe(false)
  })

  it('does not withhold for an athlete with no wearable — that is the empty state', () => {
    expect(withholdReadiness({ gate: 'none', trainedToday: false, sidelined: false })).toBe(false)
  })

  it('yields to the post-ride and sidelined heroes, which explain themselves', () => {
    expect(withholdReadiness({ gate: 'stale', trainedToday: true, sidelined: false })).toBe(false)
    expect(withholdReadiness({ gate: 'stale', trainedToday: false, sidelined: true })).toBe(false)
  })
})
