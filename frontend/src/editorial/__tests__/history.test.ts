import { describe, expect, it } from 'vitest'
import type { ActivityRead } from '../../api/dashboard'
import { bestOtherMonth, bucketByMonth, rankByKm, stepMonth } from '../history/monthBuckets'
import { buildHistoryModel } from '../history/buildHistoryModel'

let nextId = 1
function ride(date: string, km: number, opts: Partial<ActivityRead> = {}): ActivityRead {
  return {
    id: nextId++,
    started_at: `${date}T09:00:00`,
    user_id: 1,
    sport: 'cycling',
    duration_seconds: 3600,
    distance_meters: km * 1000,
    elevation_gain_m: 100,
    tss: 50,
    average_hr: null, max_hr: null, normalized_power: null, average_power: null,
    calories: null, title: null, source: null,
    ...opts,
  }
}

const NOW = new Date(2025, 7, 20) // 20 Aug 2025

describe('month buckets', () => {
  it('groups rides into months, newest first', () => {
    const buckets = bucketByMonth([
      ride('2025-06-04', 40), ride('2025-08-02', 30), ride('2025-08-09', 50), ride('2025-07-11', 20),
    ], NOW)
    expect(buckets.map((b) => b.key)).toEqual(['2025-08', '2025-07', '2025-06'])
    expect(buckets[0].rides).toBe(2)
    expect(buckets[0].km).toBe(80)
  })

  it('counts only cycling — a run inside a bike month is not 812 km of riding', () => {
    const buckets = bucketByMonth([
      ride('2025-08-02', 30),
      ride('2025-08-03', 10, { sport: 'running' }),
      ride('2025-08-04', 5, { sport: 'gym' }),
    ], NOW)
    expect(buckets).toHaveLength(1)
    expect(buckets[0].rides).toBe(1)
    expect(buckets[0].km).toBe(30)
  })

  it('counts a rest day per calendar day, not per ride — two rides in a day is one day trained', () => {
    // 20 days elapsed in August; ridden on the 1st (twice) and the 2nd.
    const buckets = bucketByMonth([
      ride('2025-08-01', 30), ride('2025-08-01', 20), ride('2025-08-02', 25),
    ], NOW)
    expect(buckets[0].restDays).toBe(18)
  })

  it('never reports a month-in-progress\'s unlived days as rest', () => {
    const buckets = bucketByMonth([ride('2025-08-01', 30)], NOW)
    // 20 days elapsed, 1 ridden — not 31 - 1.
    expect(buckets[0].restDays).toBe(19)
  })

  it('ranks a month against the months actually on record', () => {
    const buckets = bucketByMonth([
      ride('2025-06-04', 400), ride('2025-07-11', 100), ride('2025-08-02', 250),
    ], NOW)
    expect(rankByKm(buckets, '2025-06')).toEqual({ rank: 1, of: 3 })
    expect(rankByKm(buckets, '2025-08')).toEqual({ rank: 2, of: 3 })
    expect(rankByKm(buckets, '2025-01')).toBeNull()
    expect(bestOtherMonth(buckets, '2025-08')?.key).toBe('2025-06')
  })

  it('steps only to months that hold rides, and stops at the ends', () => {
    const buckets = bucketByMonth([ride('2025-06-04', 40), ride('2025-08-02', 30)], NOW)
    // July is empty, so stepping back from August lands on June, not an empty page.
    expect(stepMonth(buckets, '2025-08', -1)).toBe('2025-06')
    expect(stepMonth(buckets, '2025-06', -1)).toBeNull()
    expect(stepMonth(buckets, '2025-08', 1)).toBeNull()
  })
})

describe('history model', () => {
  const buckets = bucketByMonth([
    ride('2025-06-04', 400, { elevation_gain_m: 3000, tss: 120 }),
    ride('2025-08-02', 100, { elevation_gain_m: 500, tss: 60 }),
    ride('2025-08-09', 150, { elevation_gain_m: 1800, tss: 180, title: 'Sellaronda' }),
  ], NOW)

  const model = buildHistoryModel({ buckets, key: '2025-08', pmc: [], mmpCurve: null, now: NOW })!

  it('builds every headline from the rides themselves', () => {
    expect(model.period).toContain('August')
    expect(model.wentIn.hero).toBe('250')
    expect(model.wentIn.rank).toBe('#2 of 2 months')
    expect(model.wentIn.rides).toHaveLength(2)
  })

  it('highlights the ride that cost the most', () => {
    const epic = buckets[0].activities.find((a) => a.title === 'Sellaronda')!
    expect(model.wentIn.highlightKey).toBe(String(epic.id))
  })

  it('withholds the chart when the data behind it does not exist', () => {
    // No power profile and no PMC were supplied — the chapters must say so and
    // pass empty series rather than draw a curve from nothing.
    expect(model.cameOut.current).toEqual([])
    expect(model.cameOut.verdict).toMatch(/no power data/i)
    expect(model.cost.days).toEqual([])
    expect(model.cost.verdict).toMatch(/not enough days/i)
    // The projection has no backend at all, so it is always withheld.
    expect(model.setsUp.actual).toEqual([])
  })

  it('offers the open goal only while it can still be won', () => {
    // August is the current month and is 150 km behind June.
    expect(model.openGoal).not.toBeNull()
    expect(model.openGoal!.pct).toBe(63)

    const past = buildHistoryModel({ buckets, key: '2025-06', pmc: [], mmpCurve: null, now: NOW })!
    expect(past.openGoal).toBeNull()
  })

  it('reads a real power curve when there is one', () => {
    const withPower = buildHistoryModel({
      buckets, key: '2025-08', pmc: [],
      mmpCurve: { '5': 1180, '60': 520, '300': 372, '1200': 300, '3600': 260 },
      now: NOW,
    })!
    expect(withPower.cameOut.hero).toBe('372')
    expect(withPower.cameOut.current.map((p) => p.seconds)).toEqual([5, 60, 300, 1200, 3600])
  })

  it('returns nothing for a month with no rides, rather than an empty deck', () => {
    expect(buildHistoryModel({ buckets, key: '2025-07', pmc: [], mmpCurve: null, now: NOW })).toBeNull()
  })
})
