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
    expect(STORY_SAFE.bottom).toBeGreaterThanOrEqual(310)
  })

  it('sets a side margin an editorial page would recognise, not a screenshot', () => {
    // 64px on 1080 is 6% and reads as an export. 96 is 9%.
    const pct = STORY_SAFE.side / STORY_SAFE.width
    expect(pct).toBeGreaterThanOrEqual(0.08)
    expect(pct).toBeLessThanOrEqual(0.12)
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
