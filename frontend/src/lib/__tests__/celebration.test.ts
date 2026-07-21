import { describe, it, expect, beforeEach } from 'vitest'
import {
  STREAK_MILESTONES,
  streakMilestone,
  bestPrEffort,
  prCount,
  durationLabel,
  pbDedupKey,
  streakDedupKey,
  weeklyDedupKey,
  isoWeekKey,
  hasCelebrated,
  markCelebrated,
  type PrEffortLike,
} from '../celebration'

describe('streakMilestone', () => {
  it('returns the milestone only on an exact milestone day', () => {
    for (const m of STREAK_MILESTONES) expect(streakMilestone(m)).toBe(m)
  })
  it('returns null for non-milestone streaks (incl. day after)', () => {
    expect(streakMilestone(0)).toBeNull()
    expect(streakMilestone(1)).toBeNull()
    expect(streakMilestone(8)).toBeNull() // day after the 7 milestone
    expect(streakMilestone(29)).toBeNull()
    expect(streakMilestone(31)).toBeNull()
  })
  it('is tolerant of null/NaN input', () => {
    expect(streakMilestone(null)).toBeNull()
    expect(streakMilestone(undefined)).toBeNull()
    expect(streakMilestone(NaN)).toBeNull()
  })
})

describe('bestPrEffort', () => {
  const mk = (duration_s: number, ride_watts: number, is_pr: boolean): PrEffortLike => ({
    duration_s,
    ride_watts,
    is_pr,
  })
  it('returns the highest-wattage is_pr effort', () => {
    const efforts = [mk(5, 900, true), mk(60, 480, true), mk(1200, 305, true)]
    expect(bestPrEffort(efforts)?.ride_watts).toBe(900)
  })
  it('ignores non-PR efforts even if higher wattage', () => {
    const efforts = [mk(5, 1200, false), mk(1200, 305, true)]
    expect(bestPrEffort(efforts)?.ride_watts).toBe(305)
  })
  it('returns null when there is no real PB', () => {
    expect(bestPrEffort([mk(5, 900, false)])).toBeNull()
    expect(bestPrEffort([])).toBeNull()
    expect(bestPrEffort(null)).toBeNull()
    expect(bestPrEffort([mk(5, 0, true)])).toBeNull() // zero watts is not real
  })
  it('prCount counts season-best efforts', () => {
    expect(prCount([mk(5, 900, true), mk(60, 480, true), mk(1200, 305, false)])).toBe(2)
    expect(prCount(null)).toBe(0)
  })
})

describe('durationLabel', () => {
  it('formats seconds, minutes and hours', () => {
    expect(durationLabel(20)).toBe('20s')
    expect(durationLabel(300)).toBe('5min')
    expect(durationLabel(3600)).toBe('1h')
  })
})

describe('dedup keys', () => {
  it('are stable, namespaced, and instance-scoped', () => {
    expect(pbDedupKey(42)).toBe('celebrate:pb:42')
    expect(streakDedupKey(7)).toBe('celebrate:streak:7')
    expect(weeklyDedupKey('2026-W30')).toBe('celebrate:weekly:2026-W30')
  })
})

describe('isoWeekKey', () => {
  it('produces YYYY-Www and is stable across a week', () => {
    // Local-constructed to mirror real use (athlete-local `new Date()`).
    // 2026-07-20 is a Monday, 2026-07-26 a Sunday — same ISO week.
    expect(isoWeekKey(new Date(2026, 6, 20, 9))).toBe(isoWeekKey(new Date(2026, 6, 26, 23)))
    expect(isoWeekKey(new Date(2026, 6, 20))).toMatch(/^2026-W\d{2}$/)
  })
  it('rolls to a new key the next week', () => {
    const a = isoWeekKey(new Date(2026, 6, 20)) // Mon
    const b = isoWeekKey(new Date(2026, 6, 27)) // next Mon
    expect(a).not.toBe(b)
  })
})

describe('hasCelebrated / markCelebrated (dedup gate)', () => {
  beforeEach(() => {
    const store: Record<string, string> = {}
    ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v
      },
      removeItem: (k: string) => {
        delete store[k]
      },
      clear: () => {},
      key: () => null,
      length: 0,
    } as Storage
  })
  it('is false until marked, true after — fires once', () => {
    const key = pbDedupKey(1001)
    expect(hasCelebrated(key)).toBe(false)
    markCelebrated(key)
    expect(hasCelebrated(key)).toBe(true)
    // A second "instance" of the same achievement stays gated.
    expect(hasCelebrated(key)).toBe(true)
  })
})
