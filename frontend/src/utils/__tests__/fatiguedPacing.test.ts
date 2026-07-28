import { describe, it, expect } from 'vitest'
import {
  freshFractionForDuration, dropAtKj, kjSpentBy, climbSpeedKmh,
  fatiguedClimbPacing, type DurabilityPoint, type RouteClimb,
} from '../fatiguedPacing'

const climbs: RouteClimb[] = [
  { elevM: 637, distanceM: 9200, avgGradePct: 6.9, startDistM: 8_000 },
  { elevM: 799, distanceM: 11_100, avgGradePct: 7.2, startDistM: 42_000 },
  { elevM: 439, distanceM: 5_800, avgGradePct: 7.6, startDistM: 88_000 },
]

// The athlete's OWN measured fade, as durability_drop reports it.
const measured: DurabilityPoint[] = [
  { kj: 1000, dropPct: 3 },
  { kj: 2000, dropPct: 7 },
  { kj: 3000, dropPct: 12 },
]

describe('freshFractionForDuration', () => {
  it('lets short climbs go over threshold and long ones well under', () => {
    expect(freshFractionForDuration(4 * 60)).toBeGreaterThan(1)
    expect(freshFractionForDuration(20 * 60)).toBe(1)
    expect(freshFractionForDuration(60 * 60)).toBeLessThan(1)
    expect(freshFractionForDuration(180 * 60)).toBeLessThan(0.85)
  })

  it('is monotonically non-increasing with duration', () => {
    const mins = [3, 8, 15, 30, 60, 120, 240]
    const fr = mins.map((m) => freshFractionForDuration(m * 60))
    for (let i = 1; i < fr.length; i++) expect(fr[i]).toBeLessThanOrEqual(fr[i - 1])
  })
})

describe('dropAtKj', () => {
  it('interpolates between measured points', () => {
    expect(dropAtKj(measured, 1500)!.dropPct).toBeCloseTo(5, 6)
    expect(dropAtKj(measured, 2500)!.dropPct).toBeCloseTo(9.5, 6)
  })

  it('fades in from zero before the first measurement', () => {
    expect(dropAtKj(measured, 0)!.dropPct).toBe(0)
    expect(dropAtKj(measured, 500)!.dropPct).toBeCloseTo(1.5, 6)
  })

  it('HOLDS the last measured drop flat instead of extrapolating a collapse', () => {
    // A linear trend would predict ~27% at 6000 kJ. Nobody observed that.
    const far = dropAtKj(measured, 6000)!
    expect(far.dropPct).toBe(12)
    expect(far.extrapolated).toBe(true)
  })

  it('marks the exact last point as NOT extrapolated', () => {
    expect(dropAtKj(measured, 3000)!.extrapolated).toBe(false)
  })

  it('is null with nothing measured — durability is too individual to assume', () => {
    expect(dropAtKj([], 2000)).toBeNull()
    expect(dropAtKj(null, 2000)).toBeNull()
  })

  it('tolerates unsorted and malformed input', () => {
    // The NaN point is dropped, leaving 1000→3% and 3000→12%, so 1500 kJ
    // interpolates to 3 + 9 × 0.25 = 5.25 — NOT the 5% the full three-point
    // set gives. Asserting the two-point answer is the point of the test.
    const messy = [{ kj: 3000, dropPct: 12 }, { kj: NaN, dropPct: 5 }, { kj: 1000, dropPct: 3 }]
    expect(dropAtKj(messy, 1500)!.dropPct).toBeCloseTo(5.25, 6)
  })
})

describe('kjSpentBy', () => {
  it('converts distance at a given power into work', () => {
    // 26 km/h for 26 km = 1 h at 200 W = 720 kJ.
    expect(kjSpentBy(26_000, 26, 200)).toBe(720)
  })

  it('is zero at the start and for nonsense input', () => {
    expect(kjSpentBy(0, 26, 200)).toBe(0)
    expect(kjSpentBy(10_000, 0, 200)).toBe(0)
    expect(kjSpentBy(10_000, 26, 0)).toBe(0)
  })
})

describe('climbSpeedKmh', () => {
  it('is slower on steeper gradients at the same W/kg', () => {
    expect(climbSpeedKmh(10, 4)).toBeLessThan(climbSpeedKmh(5, 4))
  })

  it('is faster for a stronger rider on the same gradient', () => {
    expect(climbSpeedKmh(7, 5)).toBeGreaterThan(climbSpeedKmh(7, 3))
  })
})

describe('fatiguedClimbPacing', () => {
  const base = { thresholdWatts: 300, weightKg: 70, climbs, durability: measured }

  it('reduces the target on every later climb — the whole point', () => {
    const p = fatiguedClimbPacing(base)!
    expect(p).toHaveLength(3)
    expect(p[0].kjAtBase).toBeLessThan(p[1].kjAtBase)
    expect(p[1].kjAtBase).toBeLessThan(p[2].kjAtBase)
    // Later climbs carry a bigger fade than the first.
    expect(p[2].fadeW).toBeGreaterThan(p[0].fadeW)
    expect(p[0].basis).toBe('measured')
  })

  it('never reports a fatigued target above the fresh one', () => {
    for (const c of fatiguedClimbPacing(base)!) {
      expect(c.watts).toBeLessThanOrEqual(c.freshWatts)
      expect(c.fadeW).toBeGreaterThanOrEqual(0)
    }
  })

  it('falls back to FRESH numbers and says so when fade was never measured', () => {
    const p = fatiguedClimbPacing({ ...base, durability: null })!
    for (const c of p) {
      expect(c.basis).toBe('fresh')
      expect(c.watts).toBe(c.freshWatts)
      expect(c.fadeW).toBe(0)
    }
  })

  it('flags the climb that sits past the furthest kJ ever ridden', () => {
    // Only measured to 1000 kJ; the late climbs are well beyond it.
    const p = fatiguedClimbPacing({ ...base, durability: [{ kj: 1000, dropPct: 4 }] })!
    expect(p[0].extrapolated).toBe(false)
    expect(p[2].extrapolated).toBe(true)
  })

  it('is null without a threshold — every number here is a fraction of it', () => {
    expect(fatiguedClimbPacing({ ...base, thresholdWatts: null })).toBeNull()
    expect(fatiguedClimbPacing({ ...base, thresholdWatts: 0 })).toBeNull()
  })

  it('is null with no climbs rather than an empty plan', () => {
    expect(fatiguedClimbPacing({ ...base, climbs: [] })).toBeNull()
  })

  it('still works without a weight, using a stated fallback W/kg', () => {
    const p = fatiguedClimbPacing({ ...base, weightKg: null })!
    expect(p).toHaveLength(3)
    expect(p.every((c) => Number.isFinite(c.watts) && c.watts > 0)).toBe(true)
  })

  it('orders climbs by route position, not input order', () => {
    const shuffled = [climbs[2], climbs[0], climbs[1]]
    const p = fatiguedClimbPacing({ ...base, climbs: shuffled })!
    expect(p.map((c) => c.elevM)).toEqual([637, 799, 439])
  })
})
