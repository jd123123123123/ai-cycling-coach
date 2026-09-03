import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import W3CrewGoalEditor from '../W3CrewGoalEditor'
import { sheetPanel } from '../w3surfaces'

afterEach(cleanup)

/**
 * A BOTTOM SHEET MUST BE BOUNDED BY THE SCREEN IT IS ON.
 *
 * These overlays align their panel to `flex-end`. With no height cap that is
 * not "it scrolls a little on a small phone" — the overflow goes off the TOP,
 * so on a 667pt device the sheet's own title and close button leave the screen
 * and there is no scroll to bring them back. The content is simply gone.
 *
 * Asserted on the shared helper and on a real sheet using it, so the rule
 * cannot be quietly dropped from one file.
 */

describe('the shared sheet surface', () => {
  it('is capped to the viewport', () => {
    expect(sheetPanel().maxHeight).toBe('calc(100dvh - 28px)')
  })

  it('can scroll when the content will not fit', () => {
    expect(sheetPanel().overflowY).toBe('auto')
  })

  it('DOES NOT HAND THE SCROLL TO THE PAGE BEHIND IT', () => {
    // Over-swiping inside a sheet and watching the feed move underneath is
    // the single most common bottom-sheet defect on iOS.
    expect(sheetPanel().overscrollBehavior).toBe('contain')
  })
})

describe('a sheet that uses it', () => {
  const panelOf = (c: HTMLElement) =>
    [...c.querySelectorAll('div')].find((d) => d.style.maxHeight?.includes('dvh')) ?? null

  it('caps the crew goal editor', () => {
    const { container } = render(
      <W3CrewGoalEditor currentKm={500} onSave={async () => {}} onClose={() => {}} />,
    )
    const panel = panelOf(container)
    expect(panel).not.toBeNull()
    expect(panel!.style.overflowY).toBe('auto')
    expect(panel!.style.overscrollBehavior).toBe('contain')
  })
})
