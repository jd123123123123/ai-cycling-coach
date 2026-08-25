import { describe, it, expect } from 'vitest'
import { text } from '../w3share'

/**
 * The letter-spaced painter must honour `align`.
 *
 * Its spaced branch drew character by character rightwards from `x` whatever
 * the caller asked for, so a right-aligned string ran off the edge of a card
 * that has already left the app. Caught by the story card's `w3.ride` mark
 * printing as "w 3 . ri" against the frame edge.
 */

/** A canvas stand-in that records where each glyph was actually put. */
function stubCtx() {
  const drawn: { ch: string; x: number }[] = []
  const ctx = {
    font: '', fillStyle: '', textAlign: 'left', textBaseline: '',
    measureText: (s: string) => ({ width: s.length * 10 }),
    fillText: (ch: string, x: number) => { drawn.push({ ch, x }) },
  } as unknown as CanvasRenderingContext2D
  return { ctx, drawn }
}

const SPACING = 2          // "abc" → 10+2 + 10+2 + 10 = 34 wide

describe('w3share · text() honours align when letter-spaced', () => {
  it('ends a right-aligned string AT the anchor, never past it', () => {
    const { ctx, drawn } = stubCtx()
    const w = text(ctx, 'abc', 100, 0, 24, '700', '#fff', SPACING, 'right')

    expect(w).toBe(34)
    expect(drawn[0].x).toBe(66)
    expect(drawn[drawn.length - 1].x + 10).toBeLessThanOrEqual(100)
  })

  it('centres a spaced string on the anchor', () => {
    const { ctx, drawn } = stubCtx()
    text(ctx, 'abc', 100, 0, 24, '700', '#fff', SPACING, 'center')
    expect(drawn[0].x).toBe(83)
  })

  it('still starts a left-aligned string at the anchor', () => {
    const { ctx, drawn } = stubCtx()
    text(ctx, 'abc', 100, 0, 24, '700', '#fff', SPACING, 'left')
    expect(drawn[0].x).toBe(100)
  })

  it('leaves the unspaced path to the canvas, which already aligns correctly', () => {
    const { ctx, drawn } = stubCtx()
    const w = text(ctx, 'abc', 100, 0, 24, '700', '#fff', 0, 'right')
    expect(w).toBe(30)
    expect(drawn).toEqual([{ ch: 'abc', x: 100 }])
  })
})
