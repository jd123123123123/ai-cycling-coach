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
    // Design pass (2026-08-06): CONTENT_W dropped 342→326 when Cover's own
    // photographic inset widened 24→32px per side (see numeralFit.ts's own
    // doc comment) — this recomputed expectation follows from that, not a
    // change to the shrink formula itself.
    const { fontSize, letterSpacing } = numeralFit('22:30')
    expect(fontSize).toBe(105)
    expect(letterSpacing).toBeCloseTo(-6.5, 1)
  })

  it('shrinks further, never exceeding the max, for a long string', () => {
    const { fontSize } = numeralFit('2,847,000')
    expect(fontSize).toBeLessThan(105)
    expect(fontSize).toBeLessThanOrEqual(146)
  })

  it('renders the missing-arm em dash at full size', () => {
    expect(numeralFit('—')).toEqual({ fontSize: 146, letterSpacing: -9 })
  })
})
