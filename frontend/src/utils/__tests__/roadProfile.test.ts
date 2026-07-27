import { describe, it, expect } from 'vitest'
import { expandBlocks, zoneForPctFtp, buildRoadProfile, wPrimeBalance, MAX_SAMPLES, steadyBlock, type PowerStep } from '../roadProfile'
import type { ResolvedBlock } from '../../api/coach'

/** Minimal steady block; override what a test cares about. */
function block(over: Partial<ResolvedBlock> = {}): ResolvedBlock {
  return {
    name: 'Block', duration_s: 600,
    target_watts_low: 200, target_watts_high: 220, target_pct_ftp: 70,
    zone: 2, rpe: 4, cadence_low: null, cadence_high: null,
    target_hr_low: null, target_hr_high: null,
    ...over,
  }
}

describe('zoneForPctFtp', () => {
  it('maps Coggan boundaries', () => {
    expect(zoneForPctFtp(50)).toBe(1)
    expect(zoneForPctFtp(70)).toBe(2)
    expect(zoneForPctFtp(85)).toBe(3)
    expect(zoneForPctFtp(100)).toBe(4)
    expect(zoneForPctFtp(115)).toBe(5)
    expect(zoneForPctFtp(140)).toBe(6)
    expect(zoneForPctFtp(200)).toBe(7)
  })

  it('pins the exact boundary values to the lower zone', () => {
    expect(zoneForPctFtp(55)).toBe(1)
    expect(zoneForPctFtp(75)).toBe(2)
    expect(zoneForPctFtp(90)).toBe(3)
    expect(zoneForPctFtp(105)).toBe(4)
    expect(zoneForPctFtp(120)).toBe(5)
    expect(zoneForPctFtp(150)).toBe(6)
  })
})

describe('expandBlocks', () => {
  it('emits one step per steady block, watts averaged from the target range', () => {
    const steps = expandBlocks([block(), block({ target_watts_low: 300, target_watts_high: 320, zone: 4 })])
    expect(steps).toEqual<PowerStep[]>([
      { watts: 210, zone: 2, durationS: 600, blockIndex: 0 },
      { watts: 310, zone: 4, durationS: 600, blockIndex: 1 },
    ])
  })

  it('expands a structured set into reps × (on, off) steps', () => {
    // off_pct_ftp is a FRACTION on the wire (as the backend actually emits it —
    // see backend/app/services/workout_templates.py:457's off_pct_ftp=0.50),
    // not the 0-150+ percent zoneForPctFtp expects.
    const steps = expandBlocks([block({
      duration_s: 600, target_watts_low: 400, target_watts_high: 420, zone: 6,
      reps: 10, on_s: 15, off_s: 45,
      off_watts_low: 100, off_watts_high: 120, off_pct_ftp: 0.50,
    })])
    expect(steps).toHaveLength(20)
    expect(steps[0]).toEqual({ watts: 410, zone: 6, durationS: 15, blockIndex: 0 })
    expect(steps[1]).toEqual({ watts: 110, zone: 1, durationS: 45, blockIndex: 0 })
    // Invariant from the ResolvedBlock docs: reps × (on_s + off_s) === duration_s
    expect(steps.reduce((s, x) => s + x.durationS, 0)).toBe(600)
  })

  it('converts off_pct_ftp fraction → zone correctly (the unit-mismatch regression)', () => {
    // An over/under session: unders at 0.95 IF are genuinely threshold (zone 4)
    // work, not recovery. workout_templates.py:414 emits off_pct_ftp=0.95.
    const overUnder = expandBlocks([block({
      duration_s: 300, target_watts_low: 300, target_watts_high: 320, zone: 5,
      reps: 5, on_s: 30, off_s: 30,
      off_watts_low: 230, off_watts_high: 250, off_pct_ftp: 0.95,
    })])
    expect(overUnder[1].zone).toBe(4)

    // workout_templates.py:457 emits off_pct_ftp=0.50 for a true recovery spin.
    const recovery = expandBlocks([block({
      duration_s: 300, target_watts_low: 300, target_watts_high: 320, zone: 5,
      reps: 5, on_s: 30, off_s: 30,
      off_watts_low: 100, off_watts_high: 120, off_pct_ftp: 0.50,
    })])
    expect(recovery[1].zone).toBe(1)
  })

  it('falls back to a steady step when a set lacks off watts', () => {
    const steps = expandBlocks([block({ reps: 10, on_s: 15, off_s: 45, off_watts_low: null, off_watts_high: null })])
    expect(steps).toEqual([{ watts: 210, zone: 2, durationS: 600, blockIndex: 0 }])
  })

  it('drops non-positive durations and returns [] for no blocks', () => {
    expect(expandBlocks([])).toEqual([])
    expect(expandBlocks([block({ duration_s: 0 })])).toEqual([])
  })
})

describe('wPrimeBalance', () => {
  it('spends W above CP, joule for joule', () => {
    // 10 s at 350 W with CP 250 spends 10 × 100 J = 1000 J.
    const out = wPrimeBalance(Array(10).fill(350), 250, 20000)
    expect(out).toHaveLength(10)
    expect(out[9]).toBeCloseTo(19000, 6)
  })

  it('reconstitutes below CP without ever exceeding W prime', () => {
    const spent = wPrimeBalance(Array(60).fill(400), 250, 20000)
    const recovered = wPrimeBalance(Array(600).fill(100), 250, 20000)
    expect(spent[59]).toBeLessThan(20000)
    // Starting full and soft-pedalling can never overfill the tank.
    expect(Math.max(...recovered)).toBeLessThanOrEqual(20000)
  })

  it('goes negative on exhaustion (models task failure)', () => {
    const out = wPrimeBalance(Array(400).fill(400), 250, 20000)
    expect(out[399]).toBeLessThan(0)
  })
})

describe('buildRoadProfile', () => {
  const hard = [block({ duration_s: 300, target_watts_low: 200, target_watts_high: 200, zone: 2 }),
                block({ duration_s: 240, target_watts_low: 330, target_watts_high: 330, zone: 4 }),
                block({ duration_s: 300, target_watts_low: 150, target_watts_high: 150, zone: 1 })]

  it('reports total duration and caps sample count', () => {
    const p = buildRoadProfile(hard, { cp: 250, wPrime: 20000 })
    expect(p.totalDurationS).toBe(840)
    expect(p.samples.length).toBeGreaterThan(1)
    expect(p.samples.length).toBeLessThanOrEqual(MAX_SAMPLES)
    expect(p.samples[0].t).toBe(0)
    expect(p.samples[p.samples.length - 1].t).toBeCloseTo(1, 6)
  })

  it('drains W prime on the threshold block and refills it after', () => {
    const p = buildRoadProfile(hard, { cp: 250, wPrime: 20000 })
    expect(p.minWbal).not.toBeNull()
    expect(p.minWbal!).toBeLessThan(20000)
    const last = p.samples[p.samples.length - 1].wbal!
    expect(last).toBeGreaterThan(p.minWbal!)
  })

  it('preserves the deepest W prime point through resampling', () => {
    const p = buildRoadProfile(hard, { cp: 250, wPrime: 20000 })
    const lowest = Math.min(...p.samples.map((s) => s.wbal!))
    expect(lowest).toBeCloseTo(p.minWbal!, 6)
  })

  it('still renders terrain but no W prime when CP is unknown', () => {
    const p = buildRoadProfile(hard, { cp: null, wPrime: null })
    expect(p.samples.length).toBeGreaterThan(1)
    expect(p.samples.every((s) => s.wbal === null)).toBe(true)
    expect(p.minWbal).toBeNull()
    expect(p.cp).toBeNull()
    expect(p.samples.some((s) => s.watts === 330)).toBe(true)
  })

  it('returns an empty profile for no blocks', () => {
    const p = buildRoadProfile([], { cp: 250, wPrime: 20000 })
    expect(p.samples).toEqual([])
    expect(p.totalDurationS).toBe(0)
    expect(p.minWbal).toBeNull()
  })

  it('never substitutes a default CP or W prime when either is zero or negative', () => {
    for (const power of [
      { cp: 0, wPrime: 20000 },
      { cp: 250, wPrime: 0 },
      { cp: -250, wPrime: 20000 },
      { cp: 250, wPrime: -20000 },
    ]) {
      const p = buildRoadProfile(hard, power)
      expect(p.samples.length).toBeGreaterThan(1)
      expect(p.samples.every((s) => s.wbal === null)).toBe(true)
      expect(p.minWbal).toBeNull()
      // A non-positive value is sanitized to null; it is never substituted
      // with a default, and it never lets a *valid* companion value through
      // to the W'bal integration (checked above via wbal === null).
      expect(p.cp).toBe(power.cp > 0 ? power.cp : null)
      expect(p.wPrime).toBe(power.wPrime > 0 ? power.wPrime : null)
    }
  })

  it('caps totalDurationS to the span actually integrated when a session exceeds MAX_SECONDS', () => {
    const MAX_SECONDS = 21600
    const long = [block({ duration_s: MAX_SECONDS + 3600, target_watts_low: 200, target_watts_high: 200, zone: 2 })]
    const p = buildRoadProfile(long, { cp: 250, wPrime: 20000 })
    expect(p.totalDurationS).toBe(MAX_SECONDS)
    expect(p.samples.length).toBeLessThanOrEqual(MAX_SAMPLES)
    expect(p.samples[p.samples.length - 1].t).toBeCloseTo(1, 6)
  })
})

describe('steadyBlock', () => {
  it('builds one honest steady block from a duration and a target', () => {
    const b = steadyBlock(90, 200, 250)!
    expect(b.duration_s).toBe(5400)
    expect(b.target_watts_low).toBe(200)
    expect(b.target_watts_high).toBe(200)
    expect(b.reps ?? null).toBeNull()
  })

  it('refuses to invent a road without a duration, a target, or a threshold', () => {
    expect(steadyBlock(90, null, 250)).toBeNull()
    expect(steadyBlock(null, 200, 250)).toBeNull()
    expect(steadyBlock(0, 200, 250)).toBeNull()
    expect(steadyBlock(90, 200, null)).toBeNull()
    expect(steadyBlock(90, 200, 0)).toBeNull()
  })

  it('feeds a profile that still drains nothing below CP', () => {
    const p = buildRoadProfile([steadyBlock(60, 200, 250)!], { cp: 250, wPrime: 20000 })
    expect(p.samples.length).toBeGreaterThan(1)
    expect(p.minWbal).toBeCloseTo(20000, 0)
  })

  it('derives zone from the actual intensity factor, never the substituted zone-2 default', () => {
    // 320W against a 300W threshold is ~107% IF — genuinely a VO2/zone-5 push,
    // not the old hardcoded endurance-blue zone 2.
    const highIf = steadyBlock(20, 320, 300)!
    expect(highIf.zone).not.toBe(2)
    expect(highIf.zone).toBe(5)
    expect(highIf.target_pct_ftp).toBeCloseTo(320 / 300, 6)

    // A genuinely easy target should still land in zone 2.
    const endurance = steadyBlock(60, 195, 300)!
    expect(endurance.zone).toBe(2)
  })
})
