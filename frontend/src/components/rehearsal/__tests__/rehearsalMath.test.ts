import { describe, it, expect } from 'vitest'
import {
  blowUpCeilingW,
  climbStats,
  elevationsFromSegments,
  formatHm,
  formatHms,
  wPrimeCapacity,
} from '../rehearsalMath'
import type { RehearsalClimb, RehearsalSegment } from '../../../api/rehearsal'

const seg = (o: Partial<RehearsalSegment> & { start_m: number }): RehearsalSegment => ({
  gradient_pct: 0,
  power_w: 200,
  speed_ms: 8,
  elapsed_s: 0,
  w_bal_j: 20000,
  climb_id: null,
  ...o,
})

describe('formatHm', () => {
  it('renders hours and minutes', () => {
    expect(formatHm(17520)).toBe('4:52')
    expect(formatHm(19680)).toBe('5:28')
  })

  it('carries a rounded 60th minute into the hour', () => {
    expect(formatHm(3599)).toBe('1:00')
  })
})

describe('formatHms', () => {
  it('drops the hour when there is none', () => {
    expect(formatHms(125)).toBe('2:05')
    expect(formatHms(3725)).toBe('1:02:05')
  })
})

describe('elevationsFromSegments', () => {
  it('integrates gradient over distance', () => {
    const out = elevationsFromSegments([
      seg({ start_m: 0, gradient_pct: 10 }),
      seg({ start_m: 100, gradient_pct: -5 }),
      seg({ start_m: 200 }),
    ])
    expect(out[0]).toBe(0)
    expect(out[1]).toBeCloseTo(10)
    expect(out[2]).toBeCloseTo(5)
  })

  it('is empty for an empty route', () => {
    expect(elevationsFromSegments([])).toEqual([])
  })
})

describe('climbStats', () => {
  const climb: RehearsalClimb = {
    climb_id: 1, start_m: 100, end_m: 300, length_m: 200, elev_gain_m: 16, avg_grade_pct: 8,
  }

  it('averages power, spans elapsed and counts the W′ drop', () => {
    const stats = climbStats(
      [
        seg({ start_m: 0, elapsed_s: 0, w_bal_j: 20000 }),
        seg({ start_m: 100, elapsed_s: 60, w_bal_j: 20000, power_w: 300, climb_id: 1 }),
        seg({ start_m: 200, elapsed_s: 120, w_bal_j: 14000, power_w: 260, climb_id: 1 }),
        seg({ start_m: 300, elapsed_s: 180, w_bal_j: 15000 }),
      ],
      climb,
    )
    expect(stats.meanPowerW).toBe(280)
    expect(stats.timeS).toBe(120)
    expect(stats.wCostJ).toBe(6000)
  })

  it('returns nulls (not zeros) when the climb has no pacing behind it', () => {
    expect(climbStats([], climb)).toEqual({ meanPowerW: null, timeS: null, wCostJ: null })
  })
})

describe('blowUpCeilingW', () => {
  it('reads the post-blow-up cap off the climbing segments', () => {
    const w = blowUpCeilingW(
      [
        seg({ start_m: 0, gradient_pct: 8, power_w: 320 }),
        seg({ start_m: 100, gradient_pct: 8, power_w: 300 }),
        seg({ start_m: 200, gradient_pct: 8, power_w: 265 }),
        seg({ start_m: 300, gradient_pct: -4, power_w: 90 }),
      ],
      200,
    )
    expect(w).toBe(265)
  })

  it('is null past the end of the route', () => {
    expect(blowUpCeilingW([seg({ start_m: 0 })], 9999)).toBeNull()
  })
})

describe('wPrimeCapacity', () => {
  it('is the highest balance seen', () => {
    expect(wPrimeCapacity([seg({ start_m: 0, w_bal_j: 21000 }), seg({ start_m: 1, w_bal_j: 9000 })])).toBe(21000)
  })

  it('is null without segments', () => {
    expect(wPrimeCapacity([])).toBeNull()
  })
})
