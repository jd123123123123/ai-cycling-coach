import { describe, it, expect } from 'vitest'
import { fadeRunway } from '../W3TodayView'

/**
 * The band below the hero exists to hide a colour STEP. Its length must follow
 * the size of that step, or it becomes either a visible seam or dead screen.
 */
describe('fadeRunway', () => {
  const PAGE = '#0B0B0B'

  it('spends nothing when the picture already ends in the page colour', () => {
    // THE BUG THIS PINS. The stage plate was re-rendered to end at #080A0B —
    // three levels off the app's own black — and the band stayed hard-coded at
    // 180 px, fading black into black. That left ~110 px of empty screen
    // between the hero and the first thing the coach says, guarding against a
    // step that no longer existed.
    expect(fadeRunway('#080a0b', PAGE)).toBe(0)
    expect(fadeRunway(PAGE, PAGE)).toBe(0)
  })

  it('spends the full runway on the step it was written for', () => {
    // #32353F against #0B0B0B is what the plate used to hand over.
    expect(fadeRunway('#32353f', PAGE)).toBe(180)
  })

  it('scales in between rather than switching', () => {
    const mid = fadeRunway('#1e1e22', PAGE)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(180)
  })

  it('keeps the full runway when the colour could not be read', () => {
    // `useGroundColour` returns null on a tainted canvas. Unknown means assume
    // the worst: a visible seam is a defect, dead space is only a waste.
    expect(fadeRunway(null, PAGE)).toBe(180)
    expect(fadeRunway('#abc', PAGE)).toBe(180)
  })
})
