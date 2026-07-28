import { describe, it, expect } from 'vitest'
import {
  zoneNumber, rideAdaptation, fitnessEffect, rideRank, planMatch, durabilityRead,
} from '../rideEffect'

describe('zoneNumber', () => {
  it('reads the short, long and spaced spellings the wire has used', () => {
    expect(zoneNumber('z2')).toBe(2)
    expect(zoneNumber('Z2')).toBe(2)
    expect(zoneNumber('zone2')).toBe(2)
    expect(zoneNumber('endurance')).toBe(2)
    expect(zoneNumber('lactate threshold')).toBe(4)
    expect(zoneNumber('VO2max')).toBe(5)
  })

  it('returns null for an unknown key instead of guessing', () => {
    expect(zoneNumber('sweetspot')).toBeNull()
    expect(zoneNumber('')).toBeNull()
  })
})

describe('rideAdaptation', () => {
  it('calls a long steady ride aerobic', () => {
    const a = rideAdaptation({ z1: 18, z2: 71, z3: 8, z4: 3, z5: 0 })!
    expect(a.band).toBe('aerobic')
    expect(a.pctInBand).toBe(89)
    expect(a.decisive).toBe(true)
  })

  it('calls an interval session by its intervals, not by its warm-up', () => {
    // The regression this weighting exists for: 20 min of VO2 inside a 90 min
    // session is the POINT of the session, but it loses a raw time count to
    // the Z1 warm-up, recovery valleys and cool-down.
    const a = rideAdaptation({ z1: 55, z2: 12, z3: 5, z4: 6, z5: 22 })!
    expect(a.band).toBe('vo2')
    // The number shown is the athlete's real share of time, not the weight.
    expect(a.pctInBand).toBe(22)
  })

  it('calls a threshold block threshold', () => {
    const a = rideAdaptation({ z1: 30, z2: 15, z3: 12, z4: 40, z5: 3 })!
    expect(a.band).toBe('threshold')
  })

  it('flags a genuinely mixed ride as not decisive', () => {
    // Weighted: aerobic 40, threshold 22*2.2=48.4 — inside the 1.5x margin.
    const a = rideAdaptation({ z1: 20, z2: 20, z3: 11, z4: 11, z5: 0 })!
    expect(a.decisive).toBe(false)
  })

  it('normalises when the shares do not sum to 100', () => {
    const a = rideAdaptation({ z1: 10, z2: 30 })!
    expect(a.band).toBe('aerobic')
    expect(a.pctInBand).toBe(100)
  })

  it('is null with no usable zone data, never a fabricated band', () => {
    expect(rideAdaptation(null)).toBeNull()
    expect(rideAdaptation({})).toBeNull()
    expect(rideAdaptation({ z1: 0, z2: 0 })).toBeNull()
    expect(rideAdaptation({ sweetspot: 80 })).toBeNull()
  })
})

describe('fitnessEffect', () => {
  const series = [
    { date: '2026-07-08', ctl: 38.0, atl: 30.0, tsb: 8 },
    { date: '2026-07-09', ctl: 38.4, atl: 33.0, tsb: 5.4 },
    { date: '2026-07-10', ctl: 40.6, atl: 45.0, tsb: -4.4 },
  ]

  it('reports the fitness gained and the fatigue it cost', () => {
    const f = fitnessEffect(series, '2026-07-10')!
    expect(f.ctlBefore).toBe(38.4)
    expect(f.ctlAfter).toBe(40.6)
    expect(f.ctlDelta).toBe(2.2)
    expect(f.atlDelta).toBe(12)
    expect(f.tsbAfter).toBe(-4)
  })

  it('reports a negative delta honestly — an easy day on a high CTL loses ground', () => {
    const f = fitnessEffect([
      { date: '2026-07-09', ctl: 50, atl: 40, tsb: 10 },
      { date: '2026-07-10', ctl: 49.3, atl: 38, tsb: 11 },
    ], '2026-07-10')!
    expect(f.ctlDelta).toBe(-0.7)
  })

  it('is null when the series does not reach the ride, or has no prior day', () => {
    expect(fitnessEffect(series, '2026-06-01')).toBeNull()
    // First entry has nothing before it to compare against.
    expect(fitnessEffect(series, '2026-07-08')).toBeNull()
    expect(fitnessEffect([], '2026-07-10')).toBeNull()
    expect(fitnessEffect(null, '2026-07-10')).toBeNull()
  })

  it('does not depend on the input being pre-sorted', () => {
    const shuffled = [series[2], series[0], series[1]]
    expect(fitnessEffect(shuffled, '2026-07-10')!.ctlDelta).toBe(2.2)
  })
})

describe('rideRank', () => {
  const rides = [
    { id: 1, tss: 151 }, { id: 2, tss: 63 }, { id: 3, tss: 49 },
    { id: 4, tss: 41 }, { id: 5, tss: 120 },
  ]

  it('ranks by training load, hardest first', () => {
    expect(rideRank(rides, 1)).toMatchObject({ rank: 1, outOf: 5, percentile: 100, standout: true })
    expect(rideRank(rides, 5)).toMatchObject({ rank: 2, outOf: 5 })
    expect(rideRank(rides, 4)).toMatchObject({ rank: 5, percentile: 0 })
  })

  it('excludes rides with no TSS rather than counting them as easy', () => {
    const withUntracked = [...rides, { id: 6, tss: null }, { id: 7, tss: undefined }]
    expect(rideRank(withUntracked, 1)!.outOf).toBe(5)
  })

  it('ranks against RIDES only — runs and gym sessions are not the comparison set', () => {
    // Their TSS sits around 16-18, so counting them padded the bottom of the
    // list and inflated the denominator ("6th of 72" on 59 actual rides).
    const mixed = [
      ...rides.map((r) => ({ ...r, sport: 'cycling' })),
      { id: 8, tss: 18, sport: 'running' },
      { id: 9, tss: 17, sport: 'gym' },
    ]
    expect(rideRank(mixed, 1)!.outOf).toBe(5)
  })

  it('keeps rides whose sport is absent — an unlabelled ride is still a ride', () => {
    expect(rideRank(rides, 1)!.outOf).toBe(5)
  })

  it('declines to rank when there are too few rides to mean anything', () => {
    expect(rideRank([{ id: 1, tss: 100 }, { id: 2, tss: 50 }], 1)).toBeNull()
  })

  it('is null when the ride itself is not in the window', () => {
    expect(rideRank(rides, 99)).toBeNull()
  })
})

describe('planMatch', () => {
  it('accepts a wide on-plan band — hitting TSS exactly is not the goal', () => {
    expect(planMatch(100, 100)!.verdict).toBe('on')
    expect(planMatch(100, 88)!.verdict).toBe('on')
    expect(planMatch(100, 114)!.verdict).toBe('on')
  })

  it('flags a real under- or over-shoot', () => {
    expect(planMatch(100, 60)).toMatchObject({ verdict: 'under', deltaTss: -40 })
    expect(planMatch(100, 140)).toMatchObject({ verdict: 'over', deltaTss: 40 })
  })

  it('is null without a real planned target', () => {
    expect(planMatch(null, 100)).toBeNull()
    expect(planMatch(0, 100)).toBeNull()
    expect(planMatch(100, null)).toBeNull()
  })
})

describe('durabilityRead', () => {
  it('maps decoupling onto the standard aerobic-durability bands', () => {
    expect(durabilityRead(2.1)).toBe('strong')
    expect(durabilityRead(4.9)).toBe('strong')
    expect(durabilityRead(7)).toBe('fair')
    expect(durabilityRead(10)).toBe('fair')
    expect(durabilityRead(22.9)).toBe('faded')
  })

  it('is null when decoupling could not be computed', () => {
    expect(durabilityRead(null)).toBeNull()
    expect(durabilityRead(undefined)).toBeNull()
  })
})
