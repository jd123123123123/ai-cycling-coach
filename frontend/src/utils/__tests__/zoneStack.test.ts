import { describe, it, expect } from 'vitest'
import { zoneSegmentWidths, fmtZoneClock } from '../zoneStack'

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

describe('zoneSegmentWidths', () => {
  it('splits proportionally and sums to 100', () => {
    const w = zoneSegmentWidths([3600, 1800, 600])
    expect(sum(w)).toBeCloseTo(100, 6)
    expect(w[0]).toBeCloseTo(60, 6)
    expect(w[1]).toBeCloseTo(30, 6)
    expect(w[2]).toBeCloseTo(10, 6)
  })

  it('keeps a tiny-but-real effort visible instead of a sub-pixel sliver', () => {
    // 20s of Z5 inside a 3h ride is 0.18% — under a pixel on a 390px screen,
    // yet it is the most significant thing that happened in the ride.
    const w = zoneSegmentWidths([10780, 20])
    expect(w[1]).toBeGreaterThanOrEqual(1.5)
    expect(sum(w)).toBeCloseTo(100, 6)
  })

  it('takes the floored surplus back from the segments that have headroom', () => {
    const w = zoneSegmentWidths([10000, 5, 5, 5])
    expect(sum(w)).toBeCloseTo(100, 6)
    // The three slivers all reach the floor...
    expect(w[1]).toBeCloseTo(1.5, 6)
    expect(w[2]).toBeCloseTo(1.5, 6)
    expect(w[3]).toBeCloseTo(1.5, 6)
    // ...and the big one absorbs the cost rather than the row overflowing.
    expect(w[0]).toBeCloseTo(95.5, 6)
  })

  it('gives a zero-time zone exactly zero width', () => {
    const w = zoneSegmentWidths([600, 0, 300])
    expect(w[1]).toBe(0)
    expect(sum(w)).toBeCloseTo(100, 6)
  })

  it('returns all zeros for an empty ride rather than dividing by zero', () => {
    expect(zoneSegmentWidths([0, 0])).toEqual([0, 0])
    expect(zoneSegmentWidths([])).toEqual([])
  })

  it('ignores negative input rather than producing negative widths', () => {
    const w = zoneSegmentWidths([600, -50])
    expect(w.every((x) => x >= 0)).toBe(true)
  })
})

describe('fmtZoneClock', () => {
  it('drops the hour component under an hour', () => {
    expect(fmtZoneClock(0)).toBe('0:00')
    expect(fmtZoneClock(65)).toBe('1:05')
    expect(fmtZoneClock(3599)).toBe('59:59')
  })

  it('shows h:mm:ss at and above an hour', () => {
    expect(fmtZoneClock(3600)).toBe('1:00:00')
    expect(fmtZoneClock(7092)).toBe('1:58:12')
  })
})
