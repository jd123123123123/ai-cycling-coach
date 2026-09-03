import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import W3CrewGoalEditor from '../W3CrewGoalEditor'
import { sheetPanel } from '../w3surfaces'

// The editors reach the network on mount; the sheet's GEOMETRY is what is
// under test, so the hooks are stubbed rather than the render avoided.
vi.mock('../../../hooks/useChallenges', () => ({
  useCreateChallenge: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEditChallenge: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteChallenge: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

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

  const assertBounded = (container: HTMLElement, name: string) => {
    const panel = panelOf(container)
    expect(panel, `${name} has no viewport-capped panel`).not.toBeNull()
    expect(panel!.style.overflowY).toBe('auto')
    expect(panel!.style.overscrollBehavior).toBe('contain')
  }

  it('caps the crew goal editor', () => {
    const { container } = render(
      <W3CrewGoalEditor currentKm={500} onSave={async () => {}} onClose={() => {}} />,
    )
    assertBounded(container, 'W3CrewGoalEditor')
  })

  it('caps the challenge editor', async () => {
    const { default: W3ChallengeEditor } = await import('../W3ChallengeEditor')
    // Wrapped rather than further mocked: the sheet reads a query on mount and
    // the geometry is what is under test, not the fetching.
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = render(
      <QueryClientProvider client={qc}>
        <W3ChallengeEditor onClose={() => {}} />
      </QueryClientProvider>,
    )
    assertBounded(container, 'W3ChallengeEditor')
  })
})
