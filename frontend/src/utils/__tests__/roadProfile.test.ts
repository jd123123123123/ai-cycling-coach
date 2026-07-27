import { describe, it, expect } from 'vitest'
import { expandBlocks, zoneForPctFtp, type PowerStep } from '../roadProfile'
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
    const steps = expandBlocks([block({
      duration_s: 600, target_watts_low: 400, target_watts_high: 420, zone: 6,
      reps: 10, on_s: 15, off_s: 45,
      off_watts_low: 100, off_watts_high: 120, off_pct_ftp: 40,
    })])
    expect(steps).toHaveLength(20)
    expect(steps[0]).toEqual({ watts: 410, zone: 6, durationS: 15, blockIndex: 0 })
    expect(steps[1]).toEqual({ watts: 110, zone: 1, durationS: 45, blockIndex: 0 })
    // Invariant from the ResolvedBlock docs: reps × (on_s + off_s) === duration_s
    expect(steps.reduce((s, x) => s + x.durationS, 0)).toBe(600)
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
