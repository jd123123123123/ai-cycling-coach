import { describe, it, expect } from 'vitest'
import { STORY_SAFE, type StoryField, type StoryLayout } from '../w3share'
import { EDITABLE_FIELDS } from '../w3storyEdit'

/**
 * The story editor lets a rider touch a word on the finished picture instead of
 * hunting for its field in a list below it. That only works if the tap targets
 * are where the words are — and the failure mode is silent: a target that has
 * drifted looks exactly like one that has not, right up until a rider taps the
 * headline and gets the dateline's keyboard.
 *
 * `renderStoryCard` emits the rectangles as it paints, so they cannot drift
 * from the type. What this file pins is the CONTRACT around them: which fields
 * each layout offers, and that the editor and the renderer agree on that list.
 *
 * The geometry itself is asserted in a browser-shaped test — canvas text
 * metrics do not exist in jsdom, so measuring here would be measuring a stub.
 */

const LAYOUTS: StoryLayout[] = ['wrap', 'full', 'silent', 'trace', 'headline', 'viewfinder', 'effort']

describe('which words each layout offers', () => {
  it('opens on the screen the rider pressed share from', async () => {
    const { STORY_FORMATS } = await import('../w3storyEdit')
    /** Every other format is a RE-composition of the same ride. `wrap` is the
     *  composition they were already looking at, so defaulting to anything else
     *  answers a question nobody asked. */
    expect(STORY_FORMATS[0].id).toBe('wrap')
  })

  it('covers every layout, so a new one cannot ship without a decision', () => {
    for (const l of LAYOUTS) expect(EDITABLE_FIELDS[l]).toBeDefined()
  })

  it('offers nothing on the silent card, which is its whole point', () => {
    /** `silent` prints no sentence at all. Offering a text field for words the
     *  format refuses to draw is how a settings screen grows. */
    expect(EDITABLE_FIELDS.silent).toEqual([])
  })

  it('never offers the same field twice in one layout', () => {
    for (const l of LAYOUTS) {
      const fields = EDITABLE_FIELDS[l]
      expect(new Set(fields).size).toBe(fields.length)
    }
  })

  it('only ever offers language, never a measurement', () => {
    /** THE RULE THIS SCREEN IS BUILT ON. A share sheet where you can retype the
     *  wattage is a lie generator. `StoryField` is the type that enforces it;
     *  this asserts nothing has been widened past it. */
    const allowed: StoryField[] = ['routeName', 'dateline', 'lead', 'emphasis', 'ticker']
    for (const l of LAYOUTS) {
      for (const f of EDITABLE_FIELDS[l]) expect(allowed).toContain(f)
    }
  })
})

describe('the safe area the zones live in', () => {
  it('is the pen spec frame, not the canvas edge', () => {
    /** 250 / 370 come from pen `XLPb0`. A zone outside them is a tap target
     *  under Instagram's own furniture. */
    expect(STORY_SAFE.top).toBe(250)
    expect(STORY_SAFE.bottom).toBe(370)
    expect(STORY_SAFE.width).toBe(1080)
    expect(STORY_SAFE.height).toBe(1920)
  })
})

describe('swiping through the formats', () => {
  it('walks the list one at a time', async () => {
    const { stepFormat, STORY_FORMATS } = await import('../w3storyEdit')
    // Anchored on the list rather than on a hard-coded id: `wrap` was added at
    // the front later, and a test that names the first format has to be edited
    // every time the order is reconsidered.
    expect(stepFormat(STORY_FORMATS[0].id, 1)).toBe(STORY_FORMATS[1].id)
    expect(stepFormat(STORY_FORMATS[1].id, -1)).toBe(STORY_FORMATS[0].id)
  })

  it('stops at both ends instead of wrapping', async () => {
    const { stepFormat, STORY_FORMATS } = await import('../w3storyEdit')
    const last = STORY_FORMATS[STORY_FORMATS.length - 1].id
    /** A rider who wraps cannot tell whether they have seen all six. */
    expect(stepFormat(STORY_FORMATS[0].id, -1)).toBe(STORY_FORMATS[0].id)
    expect(stepFormat(last, 1)).toBe(last)
  })
})
