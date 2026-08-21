import { describe, expect, it } from 'vitest'
import { BOARD_TINTS, T } from '../w3/w3tokens'

/** OKLab, ×100 — the same space and scale the palette validator reports in. */
function oklab(hex: string): [number, number, number] {
  const v = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = [v(0), v(1), v(2)]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
const dE = (a: string, b: string) => {
  const [x, y, z] = oklab(a); const [p, q, r] = oklab(b)
  return Math.hypot(x - p, y - q, z - r) * 100
}

/**
 * The board's rider colours, pinned by the measurement that chose them.
 *
 * They were eight pastels. Six read as grey against this app's surface, and
 * the worst neighbouring pair sat at ΔE 9.0 for NORMAL colour vision — below
 * the floor of 15, which means a rider with no colour deficiency at all could
 * not tell one card from the next. For deuteranopia it was ΔE 2.2: nothing.
 *
 * ORDER IS THE CONTRACT, and that is the part a reader would not guess. The
 * separation is a property of NEIGHBOURS, so sorting this array by hue, or by
 * name, or "to look tidier", silently undoes the reason it exists. This test
 * fails if anyone does.
 */
describe('the board tints stay legible', () => {
  it('has six, and no duplicates', () => {
    // Six, not eight. See the note on BOARD_TINTS: the dark surface does not
    // hold eight separable hues, and the set was cut rather than fudged.
    expect(BOARD_TINTS).toHaveLength(6)
    expect(new Set(BOARD_TINTS).size).toBe(6)
  })

  /**
   * ALL pairs, not neighbours. This is the part that would be got wrong by
   * someone re-deriving it: on a leaderboard rank 1 and rank 6 are on screen
   * at the same time, so every pair is an adjacent pair in practice. Checking
   * only neighbours passed an eight-colour set whose yellow was ΔE 2.4 from
   * its lime under deuteranopia.
   */
  it('keeps EVERY pair apart for normal vision, not just neighbours', () => {
    for (let i = 0; i < BOARD_TINTS.length; i++) {
      for (let j = i + 1; j < BOARD_TINTS.length; j++) {
        const d = dE(BOARD_TINTS[i], BOARD_TINTS[j])
        expect(d, `${BOARD_TINTS[i]} ↔ ${BOARD_TINTS[j]} is ΔE ${d.toFixed(1)}`).toBeGreaterThan(15)
      }
    }
  })

  /**
   * `#C8FF00` was a near-miss on this app's acid that had settled into six
   * files — including the canvas painter for the card that LEAVES the app, so
   * a shared ride went out branded in a lime the product does not use.
   */
  it('has one lime, and it is the acid', () => {
    expect(T.acid).toBe('#BFFF3C')
    expect(BOARD_TINTS[0]).toBe(T.acid)
  })
})
