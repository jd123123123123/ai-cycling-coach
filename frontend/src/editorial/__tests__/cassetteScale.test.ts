// frontend/src/editorial/__tests__/cassetteScale.test.ts
import { describe, it, expect } from 'vitest'
import {
  COG_TEETH,
  MIN_SERIES_FOR_PERCENTILE,
  percentileRank,
  cogIndexFromReadiness,
  cogHalfWidth,
  medianOf,
} from '../components/cassetteScale'

const series = (n: number, from = 40) =>
  Array.from({ length: n }, (_, i) => from + i)

describe('cassetteScale', () => {
  it('has ten cogs, smallest first', () => {
    expect(COG_TEETH).toEqual([11, 13, 15, 17, 19, 21, 24, 28, 32, 34])
  })

  it('ranks a value against its own series', () => {
    expect(percentileRank(50, [10, 20, 30, 40, 50])).toBe(1)
    expect(percentileRank(10, [10, 20, 30, 40, 50])).toBeCloseTo(0.2, 5)
    expect(percentileRank(35, [10, 20, 30, 40, 50])).toBeCloseTo(0.6, 5)
  })

  it('returns 0 for an empty series rather than dividing by zero', () => {
    expect(percentileRank(50, [])).toBe(0)
  })

  it('maps the top of your own range to the 11t', () => {
    const { index, basis } = cogIndexFromReadiness(99, series(30))
    expect(index).toBe(0)
    expect(basis).toBe('percentile')
  })

  it('maps the bottom of your own range to the 34t', () => {
    const { index } = cogIndexFromReadiness(1, series(30))
    expect(index).toBe(9)
  })

  it('falls back to absolute deciles below the history floor', () => {
    const { index, basis } = cogIndexFromReadiness(74, series(MIN_SERIES_FOR_PERCENTILE - 1))
    expect(basis).toBe('decile')
    expect(index).toBe(2)
  })

  it('clamps a readiness outside 0..100 in decile mode', () => {
    expect(cogIndexFromReadiness(140, []).index).toBe(0)
    expect(cogIndexFromReadiness(-5, []).index).toBe(9)
  })

  it('widens monotonically from the 11t to the 34t', () => {
    expect(cogHalfWidth(0)).toBe(34)
    expect(cogHalfWidth(9)).toBe(118)
    for (let i = 1; i < COG_TEETH.length; i++) {
      expect(cogHalfWidth(i)).toBeGreaterThan(cogHalfWidth(i - 1))
    }
  })

  describe('medianOf', () => {
    it('returns the middle value for an odd-length series', () => {
      expect(medianOf([10, 30, 20])).toBe(20)
    })

    it('averages the two middle values for an even-length series', () => {
      expect(medianOf([10, 20, 30, 40])).toBe(25)
    })

    it('returns null for an empty series', () => {
      expect(medianOf([])).toBeNull()
    })

    it('sorts unsorted input before finding the middle', () => {
      expect(medianOf([50, 10, 40, 20, 30])).toBe(30)
    })

    it('does not mutate the caller\'s array', () => {
      const input = [50, 10, 40, 20, 30]
      const copy = [...input]
      medianOf(input)
      expect(input).toEqual(copy)
    })
  })
})
