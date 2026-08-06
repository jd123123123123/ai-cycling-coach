import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSwipeStep } from '../motion/useSwipeStep'

const STEPS = ['a', 'b', 'c', 'd'] as const

function Host({ current, onSelect }: { current: string; onSelect: (next: string) => void }) {
  const swipe = useSwipeStep(STEPS, current, onSelect)
  return <div data-testid="surface" {...swipe} />
}

function swipe(el: Element, fromX: number, toX: number, fromY = 0, toY = 0) {
  fireEvent.pointerDown(el, { clientX: fromX, clientY: fromY })
  fireEvent.pointerUp(el, { clientX: toX, clientY: toY })
}

afterEach(cleanup)

describe('useSwipeStep', () => {
  it('a leftward swipe past the threshold moves to the NEXT step', () => {
    const onSelect = vi.fn()
    const { getByTestId } = render(<Host current="b" onSelect={onSelect} />)
    swipe(getByTestId('surface'), 300, 200) // dx = -100
    expect(onSelect).toHaveBeenCalledWith('c')
  })

  it('a rightward swipe past the threshold moves to the PREVIOUS step', () => {
    const onSelect = vi.fn()
    const { getByTestId } = render(<Host current="b" onSelect={onSelect} />)
    swipe(getByTestId('surface'), 200, 300) // dx = +100
    expect(onSelect).toHaveBeenCalledWith('a')
  })

  it('swiping past the last step is a no-op, not a wrap-around', () => {
    const onSelect = vi.fn()
    const { getByTestId } = render(<Host current="d" onSelect={onSelect} />)
    swipe(getByTestId('surface'), 300, 200)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('swiping past the first step is a no-op, not a wrap-around', () => {
    const onSelect = vi.fn()
    const { getByTestId } = render(<Host current="a" onSelect={onSelect} />)
    swipe(getByTestId('surface'), 200, 300)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('a short drag under the threshold does nothing', () => {
    const onSelect = vi.fn()
    const { getByTestId } = render(<Host current="b" onSelect={onSelect} />)
    swipe(getByTestId('surface'), 300, 280) // dx = -20, under the 40px threshold
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('a mostly-vertical drag (a scroll) is not read as a horizontal swipe', () => {
    const onSelect = vi.fn()
    const { getByTestId } = render(<Host current="b" onSelect={onSelect} />)
    swipe(getByTestId('surface'), 300, 250, 0, 200) // dx = -50, dy = 200
    expect(onSelect).not.toHaveBeenCalled()
  })
})
