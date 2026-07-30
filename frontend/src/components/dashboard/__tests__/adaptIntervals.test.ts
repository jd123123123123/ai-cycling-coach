import { describe, it, expect } from 'vitest'
import { adaptIntervals } from '../adaptIntervals'
import type { IntervalBlockOut } from '../../../api/weeks'

const block = (over: Partial<IntervalBlockOut> = {}): IntervalBlockOut => ({
  duration_seconds: 600,
  power_target_pct_ftp: 0.75,
  zone: 3,
  ...over,
})

describe('adaptIntervals', () => {
  it('passes through the cadence and HR the API now sends', () => {
    const [b] = adaptIntervals([block({
      cadence_low: 85, cadence_high: 95, target_hr_low: 140, target_hr_high: 155,
    })], 250)
    expect(b.cadence_low).toBe(85)
    expect(b.cadence_high).toBe(95)
    expect(b.target_hr_low).toBe(140)
    expect(b.target_hr_high).toBe(155)
  })

  it('prefers server-resolved watts over deriving them', () => {
    const [b] = adaptIntervals([block({ target_watts_low: 180, target_watts_high: 200 })], 250)
    expect(b.target_watts_low).toBe(180)
    expect(b.target_watts_high).toBe(200)
  })

  it('derives watts from the real threshold when the server sent none', () => {
    const [b] = adaptIntervals([block({ power_target_pct_ftp: 0.8 })], 300)
    // 0.8 * 300 = 240, +/- 5%
    expect(b.target_watts_low).toBe(228)
    expect(b.target_watts_high).toBe(252)
  })

  it('reports no watts rather than inventing an FTP', () => {
    const [b] = adaptIntervals([block()], null)
    expect(b.target_watts_low).toBeNull()
    expect(b.target_watts_high).toBeNull()
  })
})
