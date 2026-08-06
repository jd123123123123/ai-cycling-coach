import { describe, expect, it } from 'vitest'
import { buildTodayModel, compassPoint, type TodayModelInputs } from '../data/useTodayModel'
import { isPresent } from '../data/value'

const base = (over: Partial<TodayModelInputs> = {}): TodayModelInputs => ({
  now: new Date(2026, 6, 22, 9, 0),
  state: 'rest',
  snapshot: { body_battery: { wake: null, now: null, now_at: null }, stress: { wake: null, now: null, now_at: null },
    hrv_overnight_avg: 68, training_readiness: 74, recovery_time_hours: 11,
    generated_at: '2026-07-22T06:00:00', cached: false },
  yesterdayMetric: null, todayMetric: null, streak: null, pmc: null, recoveryEta: null,
  session: null, brief: undefined, weather: null, activitiesToday: [], health: null,
  tomorrowWorkout: null, isLoading: false,
  ...over,
})

describe('buildTodayModel', () => {
  it('formats the date meta in German by default — EDITORIAL II ships in German', () => {
    const m = buildTodayModel(base())
    // de-DE's own short weekday/month via Intl, not a hand-written array —
    // "MI 22 JULI" (Node's ICU has no 3-letter German month abbreviation
    // for July; "Juli" already IS the short form).
    expect(m.dateLabel).toEqual({ value: 'MI 22 JULI' })
  })

  it('formats the date meta in English when locale is explicitly en', () => {
    const m = buildTodayModel(base({ locale: 'en' }))
    expect(m.dateLabel).toEqual({ value: 'WED 22 JUL' })
  })

  it('carries readiness and its delta against yesterday', () => {
    const m = buildTodayModel(base({
      yesterdayMetric: { training_readiness: 66 } as never,
    }))
    expect(m.readiness).toEqual({ value: { score: 74, deltaVsYesterday: 8 } })
  })

  it('reports a null delta when yesterday has no reading — not zero', () => {
    const m = buildTodayModel(base())
    expect(isPresent(m.readiness) && m.readiness.value.deltaVsYesterday).toBeNull()
  })

  it('marks HRV missing with a dated reason when the snapshot has none', () => {
    const m = buildTodayModel(base({
      snapshot: { ...base().snapshot!, hrv_overnight_avg: null },
    }))
    expect(isPresent(m.hrv)).toBe(false)
    expect(m.hrv).toHaveProperty('missing')
  })

  it('reads sleep stages from sleep_detail, not from flat columns', () => {
    const m = buildTodayModel(base({
      todayMetric: { sleep_detail: { total_s: 27000, deep_s: 4800, rem_s: 5400, light_s: 15600, awake_s: 1200 } } as never,
    }))
    expect(isPresent(m.sleep) && m.sleep.value.deepS).toBe(4800)
  })

  it('never invents a session when none is planned', () => {
    expect(isPresent(buildTodayModel(base()).session)).toBe(false)
  })

  it('marks whatThisChanges missing when the brief has neither adaptations nor a post-ride review', () => {
    const m = buildTodayModel(base({
      brief: { adaptations: null, post_ride_review: null } as never,
    }))
    expect(isPresent(m.whatThisChanges)).toBe(false)
    expect(m.whatThisChanges).toEqual({ missing: 'Der Coach hat sich zu dieser Fahrt noch nicht geäußert.' })
  })

  it('splits whatThisChanges into the ON YOU and ON THE PLAN claims from real fields', () => {
    const m = buildTodayModel(base({
      brief: {
        adaptations: { summary: 'Thursday VO2 targets rise 10 W', changes: [] },
        post_ride_review: { physiological_read: 'Threshold moves to 288 W', goal_trajectory: 'trending up', next_session_nudge: 'Tomorrow stays easy.' },
      } as never,
    }))
    expect(isPresent(m.whatThisChanges)).toBe(true)
    if (isPresent(m.whatThisChanges)) {
      expect(m.whatThisChanges.value.onYou.claim).toBe('Threshold moves to 288 W')
      expect(m.whatThisChanges.value.onThePlan.claim).toBe('Thursday VO2 targets rise 10 W')
    }
  })

  it('unlockLabel is missing even when tomorrow itself is present — no time-of-day source exists', () => {
    const m = buildTodayModel(base({
      tomorrowWorkout: { title: 'Recovery Spin', description: 'Forty-five minutes, easy.' } as never,
    }))
    expect(isPresent(m.tomorrow)).toBe(true)
    if (isPresent(m.tomorrow)) {
      expect(isPresent(m.tomorrow.value.unlockLabel)).toBe(false)
      expect(m.tomorrow.value.unlockLabel).toEqual({ missing: 'Keine Startzeit für morgen geplant.' })
    }
  })

  it('ride.kj is missing (not estimated from calories) when average_power is null', () => {
    const m = buildTodayModel(base({
      activitiesToday: [{ id: 1, sport: 'cycling', average_power: null, duration_seconds: 3600 } as never],
    }))
    expect(isPresent(m.ride)).toBe(true)
    if (isPresent(m.ride)) expect(m.ride.value.kj).toBeNull()
  })
})

describe('compassPoint', () => {
  it('rounds a bearing to the German compass point the wind blows FROM', () => {
    expect(compassPoint(0)).toBe('N')
    expect(compassPoint(45)).toBe('NO')
    expect(compassPoint(180)).toBe('S')
    expect(compassPoint(315)).toBe('NW')
  })

  it('rounds to the nearest point rather than truncating', () => {
    expect(compassPoint(23)).toBe('NO')
    expect(compassPoint(22)).toBe('N')
  })

  it('wraps past 360 and normalises a negative bearing', () => {
    expect(compassPoint(360)).toBe('N')
    expect(compassPoint(350)).toBe('N')
    expect(compassPoint(-45)).toBe('NW')
  })

  it('has no reading rather than a default heading', () => {
    expect(compassPoint(null)).toBeNull()
    expect(compassPoint(undefined)).toBeNull()
    expect(compassPoint(Number.NaN)).toBeNull()
  })
})
