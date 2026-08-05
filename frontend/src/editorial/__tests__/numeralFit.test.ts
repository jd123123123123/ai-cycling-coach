import { describe, expect, it } from 'vitest'
import { numeralFit } from '../components/numeralFit'

describe('numeralFit', () => {
  it('sits at the max size for a short numeral', () => {
    expect(numeralFit('98')).toEqual({ fontSize: 146, letterSpacing: -9 })
  })

  it('does not shrink the common two-digit case', () => {
    expect(numeralFit('91').fontSize).toBe(146)
  })

  it('shrinks a five-glyph clock time to fit the content column', () => {
    const { fontSize, letterSpacing } = numeralFit('22:30')
    expect(fontSize).toBe(110)
    expect(letterSpacing).toBeCloseTo(-6.8, 1)
  })

  it('shrinks further, never exceeding the max, for a long string', () => {
    const { fontSize } = numeralFit('2,847,000')
    expect(fontSize).toBeLessThan(110)
    expect(fontSize).toBeLessThanOrEqual(146)
  })

  it('renders the missing-arm em dash at full size', () => {
    expect(numeralFit('—')).toEqual({ fontSize: 146, letterSpacing: -9 })
  })
})
