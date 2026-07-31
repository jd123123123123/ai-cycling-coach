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
  elevation_m: null,
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

  // The API now measures altitude per segment. Integrating gradients is only
  // the fallback for rehearsals stored before that field existed.
  it('prefers the measured altitude over the integrated one', () => {
    const out = elevationsFromSegments([
      seg({ start_m: 0, gradient_pct: 10, elevation_m: 1200 }),
      seg({ start_m: 100, gradient_pct: -5, elevation_m: 1210 }),
    ])
    expect(out).toEqual([1200, 1210])
  })

  it('falls back to the gradients when even one altitude is missing', () => {
    const out = elevationsFromSegments([
      seg({ start_m: 0, gradient_pct: 10, elevation_m: 1200 }),
      seg({ start_m: 100, gradient_pct: -5, elevation_m: null }),
    ])
    expect(out[0]).toBe(0)
    expect(out[1]).toBeCloseTo(10)
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

  // No measured W′ → the whole balance series is zero → `max(0, 0 − 0)` is a
  // fabricated "0,0 kJ", which reads as "this climb is free".
  it('returns a null W′ cost when the whole balance series is zero', () => {
    const stats = climbStats(
      [
        seg({ start_m: 100, elapsed_s: 60, w_bal_j: 0, power_w: 300, climb_id: 1 }),
        seg({ start_m: 200, elapsed_s: 120, w_bal_j: 0, power_w: 260, climb_id: 1 }),
      ],
      climb,
    )
    expect(stats.wCostJ).toBeNull()
    // The pacing figures are real and survive.
    expect(stats.meanPowerW).toBe(280)
  })

  it('returns nulls for the paced figures on an unpaced rehearsal', () => {
    const stats = climbStats(
      [
        seg({ start_m: 100, climb_id: 1, power_w: null, elapsed_s: null, w_bal_j: null }),
        seg({ start_m: 200, climb_id: 1, power_w: null, elapsed_s: null, w_bal_j: null }),
      ],
      climb,
    )
    expect(stats).toEqual({ meanPowerW: null, timeS: null, wCostJ: null })
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

  it('stops at the recovery and ignores a later, uncapped surge above CP', () => {
    // Blow-up at km 1: two capped-at-CP segments (w_bal_j near empty), then a
    // descent that refills W′, then a later climb where `race` attempts well
    // above CP again now that the rider has recovered. The ceiling must stay
    // at the capped value from the FIRST blown run, not follow the surge.
    const w = blowUpCeilingW(
      [
        seg({ start_m: 0, gradient_pct: 8, power_w: 320, w_bal_j: 20000 }),
        seg({ start_m: 1000, gradient_pct: 8, power_w: 250, w_bal_j: 400 }),
        seg({ start_m: 2000, gradient_pct: 8, power_w: 250, w_bal_j: 300 }),
        seg({ start_m: 3000, gradient_pct: -5, power_w: 90, w_bal_j: 15000 }),
        seg({ start_m: 4000, gradient_pct: 9, power_w: 300, w_bal_j: 12000 }),
      ],
      1000,
    )
    expect(w).toBe(250)
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
