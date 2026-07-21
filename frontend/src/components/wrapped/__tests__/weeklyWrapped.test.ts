import { describe, it, expect } from 'vitest'
import { isoWeekKey } from '../../dashboard/WeeklyWrappedBanner'
import { effortCaption, type Wrapped } from '../../../pages/WeeklyWrapped'

function makeWrapped(over: Partial<Wrapped> = {}): Wrapped {
  return {
    week_start: '2026-07-13',
    week_end: '2026-07-19',
    has_rides: true,
    totals: { sessions: 4, hours: 6, km: 240, tss: 500, active_days: 4, saddle_hm: '6h 00m' },
    planned_tss: null,
    ctl_delta: null,
    daily_effort: [
      { key: 'mon', date: '2026-07-13', tss: 60, km: 30, sessions: 1, peak: false },
      { key: 'tue', date: '2026-07-14', tss: 0, km: 0, sessions: 0, peak: false },
      { key: 'wed', date: '2026-07-15', tss: 0, km: 0, sessions: 0, peak: false },
      { key: 'thu', date: '2026-07-16', tss: 0, km: 0, sessions: 0, peak: false },
      { key: 'fri', date: '2026-07-17', tss: 0, km: 0, sessions: 0, peak: false },
      { key: 'sat', date: '2026-07-18', tss: 240, km: 95, sessions: 1, peak: true },
      { key: 'sun', date: '2026-07-19', tss: 0, km: 0, sessions: 0, peak: false },
    ],
    elevation_m: null,
    peak_power: null,
    best_ride: null,
    rides: 4,
    zero_missed: true,
    ...over,
  }
}

describe('isoWeekKey', () => {
  it('produces a padded ISO week handle', () => {
    // 2026-07-15 (local) is in ISO week 29.
    expect(isoWeekKey(new Date(2026, 6, 15, 12))).toBe('2026-W29')
  })
  it('is stable across a Mon–Sun ISO week (local days)', () => {
    const mon = isoWeekKey(new Date(2026, 6, 13, 12))
    const sun = isoWeekKey(new Date(2026, 6, 19, 12))
    expect(mon).toBe(sun)
  })
})

describe('effortCaption', () => {
  it('names the peak day when one carried the week', () => {
    const cap = effortCaption(makeWrapped(), true)
    expect(cap).toContain('240 TSS')
    expect(cap).toContain('500 TSS')
  })
  it('degrades to a quiet-week line when no peak day', () => {
    const flat = makeWrapped({ daily_effort: makeWrapped().daily_effort.map((d) => ({ ...d, tss: 0, peak: false })) })
    const cap = effortCaption(flat, false)
    expect(cap.toLowerCase()).toContain('quiet')
  })
})
