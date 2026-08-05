import { describe, expect, it } from 'vitest'
import { buildTodayModel, type TodayModelInputs } from '../data/useTodayModel'
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
  it('formats the date meta the way the pen does', () => {
    const m = buildTodayModel(base())
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
})
