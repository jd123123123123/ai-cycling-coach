import { describe, it, expect } from 'vitest'
import { toProfilePoints, rollingGrades, GRADE_WINDOW_M } from '../routeProfile'

describe('toProfilePoints', () => {
  it('maps the backend [dist, ele] pairs through', () => {
    expect(toProfilePoints([[0, 500], [100, 510]])).toEqual([
      { distM: 0, eleM: 500 }, { distM: 100, eleM: 510 },
    ])
  })

  it('drops malformed pairs rather than producing NaN geometry', () => {
    const pts = toProfilePoints([[0, 500], [NaN, 510], [200, 520]] as [number, number][])
    expect(pts).toHaveLength(2)
    expect(pts.every((p) => Number.isFinite(p.distM) && Number.isFinite(p.eleM))).toBe(true)
  })

  it('is empty for a profile too short to draw', () => {
    expect(toProfilePoints([[0, 500]])).toEqual([])
    expect(toProfilePoints(null)).toEqual([])
    expect(toProfilePoints(undefined)).toEqual([])
  })
})

describe('rollingGrades', () => {
  it('reports a sustained gradient at its real value', () => {
    // 1 km at a steady 8%: 10 m of rise every 125 m.
    const pts = Array.from({ length: 41 }, (_, i) => ({ distM: i * 25, eleM: 500 + i * 2 }))
    const g = rollingGrades(pts)
    // Past the first window the reading settles on the true 8%.
    expect(g[g.length - 1]).toBeCloseTo(8, 1)
  })

  it('suppresses a barometric spike a per-point delta would report', () => {
    // A 3 m blip across a single 6 m step reads as 50% naively.
    const pts = [
      { distM: 0, eleM: 500 },
      { distM: 300, eleM: 500 },
      { distM: 306, eleM: 503 }, // the blip
      { distM: 600, eleM: 500 },
    ]
    const g = rollingGrades(pts)
    const naive = ((503 - 500) / 6) * 100
    expect(naive).toBeCloseTo(50, 0)
    // Through the window it is a rounding error, not a wall.
    expect(Math.abs(g[2])).toBeLessThan(4)
  })

  it('returns one gradient per point, aligned to the input', () => {
    const pts = Array.from({ length: 12 }, (_, i) => ({ distM: i * 50, eleM: 500 + i }))
    expect(rollingGrades(pts)).toHaveLength(pts.length)
  })

  it('is 0 at the very start, where there is no run behind the point', () => {
    expect(rollingGrades([{ distM: 0, eleM: 500 }])).toEqual([0])
  })

  it('uses a window of at least GRADE_WINDOW_M metres', () => {
    expect(GRADE_WINDOW_M).toBeGreaterThanOrEqual(100)
  })
})
