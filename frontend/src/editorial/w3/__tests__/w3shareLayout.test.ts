import { describe, it, expect } from 'vitest'
import { STORY_SAFE } from '../w3share'

/**
 * A story card is drawn once and then leaves the app. It cannot re-lay itself
 * out when it turns out Instagram's reply bar is sitting on the footer, so the
 * safe area is pinned here rather than trusted.
 */

describe('story cards · Instagram safe areas', () => {
  it('is the 9:16 story canvas', () => {
    expect(STORY_SAFE.width).toBe(1080)
    expect(STORY_SAFE.height).toBe(1920)
  })

  it('keeps the top clear of the profile row and close button', () => {
    // Instagram's own creative guidance: 250px.
    expect(STORY_SAFE.top).toBeGreaterThanOrEqual(250)
  })

  it('keeps the bottom clear of the reply bar, which is taller than the header', () => {
    expect(STORY_SAFE.bottom).toBeGreaterThanOrEqual(STORY_SAFE.top)
    // 370 is the figure the pen's spec frame `XLPb0` labels its lower red band
    // with. This asserted 310 and the constant WAS 310, so the pair agreed with
    // each other and with nothing else: sixty pixels of every card's footer sat
    // under Instagram's reply bar and both the code and its test called it fine.
    expect(STORY_SAFE.bottom).toBeGreaterThanOrEqual(370)
  })

  it('sets the side margin the pen draws, not one this file invented', () => {
    // `XLPb0` puts its margin guides at x=24 and x=335 on a 360-wide artboard —
    // 72 and 1005 at 1080, so 6.67 %. This used to demand 8–12 % on the grounds
    // that 96px "is where a magazine sets a full-bleed page", which is a fine
    // sentence and not what the drawings do: the three cards in the family all
    // set their type from x=24, so a margin of 96 here put every element on
    // every one of them 24px inside its own drawing.
    const pct = STORY_SAFE.side / STORY_SAFE.width
    expect(STORY_SAFE.side).toBe(72)
    expect(pct).toBeGreaterThanOrEqual(0.06)
    expect(pct).toBeLessThanOrEqual(0.09)
  })

  it('leaves the readable band the majority of the frame', () => {
    const readable = STORY_SAFE.height - STORY_SAFE.top - STORY_SAFE.bottom
    expect(readable / STORY_SAFE.height).toBeGreaterThan(0.6)
  })

  it('puts the last baseline above the reply bar', () => {
    expect(STORY_SAFE.contentBottom).toBe(STORY_SAFE.height - STORY_SAFE.bottom)
    expect(STORY_SAFE.contentBottom).toBeLessThan(STORY_SAFE.height)
  })
})
