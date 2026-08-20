import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import W3StageRail from '../w3/W3StageRail'
import type { Stage } from '../../api/garage'

/**
 * The rail is the only control on the Today hero, so its rules are worth
 * pinning: it appears only when there is a choice, it never offers a stage the
 * rider does not own, and both ways of using it agree about what "next" is.
 */

const STAGES: Stage[] = [
  { id: 'starter_road', name: 'Startstraße', is_place: false },
  { id: 'night_road', name: 'Nachtstraße', is_place: false },
  { id: 'place:dolomiten', name: 'Dolomiten', is_place: true },
]

afterEach(cleanup)

describe('the stage rail', () => {
  it('draws nothing when there is only one stage', () => {
    // A rail with a single dot is furniture pretending to be a control.
    const { container } = render(
      <W3StageRail vm={{ stages: [STAGES[0]], current: 'starter_road', onSelect: vi.fn() }} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('names where the bike is standing', () => {
    render(<W3StageRail vm={{ stages: STAGES, current: 'place:dolomiten', onSelect: vi.fn() }} />)
    expect(screen.getByText('Dolomiten')).toBeTruthy()
  })

  it('gives every stage a finger-sized target, not a 6px dot', () => {
    render(<W3StageRail vm={{ stages: STAGES, current: 'starter_road', onSelect: vi.fn() }} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(3)
    for (const b of buttons) {
      expect(b.style.width).toBe('28px')
      expect(b.style.height).toBe('28px')
    }
  })

  it('switches on a tap', () => {
    const onSelect = vi.fn()
    render(<W3StageRail vm={{ stages: STAGES, current: 'starter_road', onSelect }} />)
    fireEvent.click(screen.getByLabelText('Dolomiten'))
    expect(onSelect).toHaveBeenCalledWith('place:dolomiten')
  })

  it('does not re-select the stage the bike is already standing in', () => {
    // Re-selecting is not harmless: it would re-post and re-render the screen
    // for a picture that has not changed.
    const onSelect = vi.fn()
    render(<W3StageRail vm={{ stages: STAGES, current: 'starter_road', onSelect }} />)
    fireEvent.click(screen.getByLabelText('Startstraße'))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('marks the current stage for assistive tech', () => {
    render(<W3StageRail vm={{ stages: STAGES, current: 'night_road', onSelect: vi.fn() }} />)
    expect(screen.getByLabelText('Nachtstraße').getAttribute('aria-current')).toBe('true')
  })

  it('swiping left moves to the next stage', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <W3StageRail vm={{ stages: STAGES, current: 'starter_road', onSelect }} />,
    )
    const rail = container.firstChild as HTMLElement
    fireEvent.pointerDown(rail, { clientX: 200, clientY: 100 })
    fireEvent.pointerUp(rail, { clientX: 120, clientY: 104 })
    expect(onSelect).toHaveBeenCalledWith('night_road')
  })

  it('swiping past the end is a no-op rather than a wrap-around', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <W3StageRail vm={{ stages: STAGES, current: 'place:dolomiten', onSelect }} />,
    )
    const rail = container.firstChild as HTMLElement
    fireEvent.pointerDown(rail, { clientX: 200, clientY: 100 })
    fireEvent.pointerUp(rail, { clientX: 120, clientY: 104 })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('leaves a mostly-vertical drag alone', () => {
    // The rail sits inside a scrolling screen; a scroll must not flip a stage.
    const onSelect = vi.fn()
    const { container } = render(
      <W3StageRail vm={{ stages: STAGES, current: 'starter_road', onSelect }} />,
    )
    const rail = container.firstChild as HTMLElement
    fireEvent.pointerDown(rail, { clientX: 200, clientY: 100 })
    fireEvent.pointerUp(rail, { clientX: 150, clientY: 300 })
    expect(onSelect).not.toHaveBeenCalled()
  })
})
