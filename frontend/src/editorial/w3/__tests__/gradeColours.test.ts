import { describe, it, expect } from 'vitest'
import { gradeColour, gradeColours, GRADE_LEGEND } from '../gradeColours'

/**
 * Colouring the road by how steep it is is the one thing a cycling map can say
 * that a general-purpose one cannot, so what it says has to be right.
 */
describe('gradeColour', () => {
  it('leaves descending and flat road in the brand accent', () => {
    // A −9 % descent and a +9 % climb are not two ends of one scale. Colouring
    // both by magnitude paints a mountain route half red for the half the rider
    // enjoyed most.
    expect(gradeColour(-14)).toBe(gradeColour(0))
    expect(gradeColour(-4)).toBe(gradeColour(2))
  })

  it('ramps only upward, and monotonically', () => {
    const lum = (c: string) => {
      const h = c.replace('#', '')
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    // Redder and darker as it gets steeper — each step must actually differ.
    const steps = [3, 6, 9, 13].map(gradeColour)
    expect(new Set(steps).size).toBe(4)
    expect(lum(steps[3])).toBeLessThan(lum(steps[0]))
  })

  it('does not run off the ends of the scale', () => {
    expect(gradeColour(40)).toBe(gradeColour(13))
    expect(gradeColour(-90)).toBe(gradeColour(-20))
  })
})

describe('gradeColours', () => {
  it('refuses rather than inventing a flat route', () => {
    // `RouteMap` draws its plain accent when `lineColors` is absent. A route
    // coloured entirely "flat" would be a claim about terrain nobody measured.
    expect(gradeColours(null, 10)).toBeNull()
    expect(gradeColours(undefined, 10)).toBeNull()
  })

  it('refuses a ramp that does not line up with the route', () => {
    // MapLibre needs one colour per vertex; a mismatch would silently colour
    // the wrong stretches of road, which is worse than no colour at all.
    expect(gradeColours([1, 2, 3], 4)).toBeNull()
    expect(gradeColours([1, 2, 3], 3)).toHaveLength(3)
  })

  it('gives the legend the same colours the line is drawn in', () => {
    expect(GRADE_LEGEND.map((g) => g.colour)).toEqual(
      [0, 6, 9, 14].map(gradeColour),
    )
  })
})
