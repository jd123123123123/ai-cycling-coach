/**
 * BlockBars expansion — structured composite sets (reps/on_s/off_s from the
 * backend) must drive the on/off stripes; name parsing survives only as the
 * legacy fallback for old persisted rows.
 */
import { describe, expect, it } from 'vitest'
import { expandBlocks, zoneForPct } from '../BlockBars'
import type { ResolvedBlock } from '../../../api/coach'

const block = (over: Partial<ResolvedBlock>): ResolvedBlock => ({
  name: 'Main',
  duration_s: 600,
  target_watts_low: 190,
  target_watts_high: 210,
  target_pct_ftp: 0.8,
  zone: 3,
  rpe: 6,
  cadence_low: null,
  cadence_high: null,
  target_hr_low: null,
  target_hr_high: null,
  ...over,
})

describe('expandBlocks — explicit structured sets', () => {
  it('expands reps/on_s/off_s into proportional on/off stripes at real intensities', () => {
    const micro = block({
      name: 'Microburst set (30×15/45s)',
      duration_s: 1800,
      target_pct_ftp: 1.5,
      zone: 6,
      reps: 30,
      on_s: 15,
      off_s: 45,
      off_pct_ftp: 0.5,
    })
    const segs = expandBlocks([micro])
    expect(segs).toHaveLength(60)
    // ON stripe: 15s at 150%, zone 6.
    expect(segs[0]).toEqual({ duration_s: 15, pct: 1.5, zone: 6 })
    // OFF stripe: 45s at the real 50% recovery, zone-colored from intensity.
    expect(segs[1]).toEqual({ duration_s: 45, pct: 0.5, zone: 1 })
    // Total duration is preserved exactly.
    expect(segs.reduce((a, s) => a + s.duration_s, 0)).toBe(1800)
  })

  it('colors high-intensity "off" (over-under 95% under) as Z4, not recovery', () => {
    const ou = block({
      name: 'OU set 1 (5×1/1min)',
      duration_s: 600,
      target_pct_ftp: 1.05,
      zone: 4,
      reps: 5,
      on_s: 60,
      off_s: 60,
      off_pct_ftp: 0.95,
    })
    const segs = expandBlocks([ou])
    expect(segs).toHaveLength(10)
    expect(segs[1].pct).toBe(0.95)
    expect(segs[1].zone).toBe(4)
  })

  it('structured fields WIN over a name whose math would not fit', () => {
    // Name says 4×15/15 (does not fit 600s) but real fields say 5×60/60.
    const b = block({
      name: '4×15/15 something',
      duration_s: 600,
      reps: 5,
      on_s: 60,
      off_s: 60,
      off_pct_ftp: 0.5,
    })
    expect(expandBlocks([b])).toHaveLength(10)
  })

  it('falls back to name parsing for legacy rows without structured fields', () => {
    const legacy = block({ name: '30×30/30 micro set', duration_s: 1800, target_pct_ftp: 1.2, zone: 5 })
    const segs = expandBlocks([legacy])
    expect(segs).toHaveLength(60)
    expect(segs[1].zone).toBe(1)
  })

  it('leaves steady blocks 1:1 and ignores null structured fields', () => {
    const steady = block({ reps: null, on_s: null, off_s: null, off_pct_ftp: null })
    expect(expandBlocks([steady])).toHaveLength(1)
  })
})

describe('zoneForPct', () => {
  it('maps %FTP to Coggan zones', () => {
    expect(zoneForPct(0.5)).toBe(1)
    expect(zoneForPct(0.65)).toBe(2)
    expect(zoneForPct(0.85)).toBe(3)
    expect(zoneForPct(0.95)).toBe(4)
    expect(zoneForPct(1.15)).toBe(5)
    expect(zoneForPct(1.5)).toBe(6)
    expect(zoneForPct(1.8)).toBe(7)
  })
})
