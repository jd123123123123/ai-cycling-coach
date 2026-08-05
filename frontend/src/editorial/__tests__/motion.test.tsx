import { cleanup, render } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTapHighlight } from '../motion/useTapHighlight'
import { MOTION_DURATION_MS, MOTION_EASE, MOTION_STAGGER_MS, prefersReducedMotion, useReveal } from '../motion/useReveal'

afterEach(cleanup)

describe('prefersReducedMotion', () => {
  it('is false when matchMedia is unavailable (jsdom default)', () => {
    expect(window.matchMedia).toBeUndefined()
    expect(prefersReducedMotion()).toBe(false)
  })

  it('reads window.matchMedia when it exists', () => {
    const original = window.matchMedia
    window.matchMedia = (query: string) => ({ matches: query.includes('reduce') }) as MediaQueryList
    expect(prefersReducedMotion()).toBe(true)
    window.matchMedia = original
  })
})

function Probe({ onState }: { onState: (on: boolean, reduced: boolean) => void }) {
  const { ref, on, reduced } = useReveal<HTMLDivElement>()
  onState(on, reduced)
  return <div ref={ref} data-probe />
}

describe('useReveal', () => {
  const originalIO = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver
  const originalMatchMedia = window.matchMedia

  beforeEach(() => {
    // @ts-expect-error -- test cleanup between cases
    delete window.matchMedia
    // @ts-expect-error -- test cleanup between cases
    delete globalThis.IntersectionObserver
  })

  afterEach(() => {
    if (originalIO) (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = originalIO
    else delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver
    if (originalMatchMedia) window.matchMedia = originalMatchMedia
  })

  it('reveals immediately when IntersectionObserver is unavailable (jsdom default) — the honest fallback', () => {
    const states: { on: boolean; reduced: boolean }[] = []
    render(<Probe onState={(on, reduced) => states.push({ on, reduced })} />)
    expect(states[states.length - 1]).toEqual({ on: true, reduced: false })
  })

  it('waits for intersection when IntersectionObserver exists, then reveals once', () => {
    let capturedCallback: IntersectionObserverCallback | null = null
    const disconnect = vi.fn()
    class FakeIO {
      constructor(cb: IntersectionObserverCallback) {
        capturedCallback = cb
      }
      observe() {}
      disconnect = disconnect
    }
    // @ts-expect-error -- installing a minimal fake for the test
    globalThis.IntersectionObserver = FakeIO

    const states: { on: boolean; reduced: boolean }[] = []
    render(<Probe onState={(on, reduced) => states.push({ on, reduced })} />)
    expect(states[states.length - 1].on).toBe(false)

    act(() => {
      capturedCallback!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    })

    expect(states[states.length - 1].on).toBe(true)
    expect(disconnect).toHaveBeenCalled()
  })

  it('prefers-reduced-motion skips the observer and settles immediately', () => {
    window.matchMedia = () => ({ matches: true }) as MediaQueryList
    let ioConstructed = false
    class FakeIO {
      constructor() {
        ioConstructed = true
      }
      observe() {}
      disconnect() {}
    }
    // @ts-expect-error -- installing a minimal fake for the test
    globalThis.IntersectionObserver = FakeIO

    const states: { on: boolean; reduced: boolean }[] = []
    render(<Probe onState={(on, reduced) => states.push({ on, reduced })} />)
    expect(states[states.length - 1]).toEqual({ on: true, reduced: true })
    expect(ioConstructed).toBe(false)
  })
})

describe('motion constants', () => {
  it('duration sits inside the owner-ruled 400-700ms band', () => {
    expect(MOTION_DURATION_MS).toBeGreaterThanOrEqual(400)
    expect(MOTION_DURATION_MS).toBeLessThanOrEqual(700)
  })
  it('uses the ruled soft-decelerating ease', () => {
    expect(MOTION_EASE).toBe('cubic-bezier(0.22, 1, 0.36, 1)')
  })
  it('stages siblings 30-40ms apart', () => {
    expect(MOTION_STAGGER_MS).toBeGreaterThanOrEqual(30)
    expect(MOTION_STAGGER_MS).toBeLessThanOrEqual(40)
  })
})

describe('useTapHighlight', () => {
  function TapProbe() {
    const { isSelected, isDimmed, toggle } = useTapHighlight<number>()
    return (
      <div>
        {[0, 1, 2].map((i) => (
          <button
            key={i}
            data-item={i}
            data-selected={isSelected(i)}
            data-dimmed={isDimmed(i)}
            onClick={() => toggle(i)}
          >
            {i}
          </button>
        ))}
      </div>
    )
  }

  it('selects a tapped item and dims its siblings', () => {
    const { container } = render(<TapProbe />)
    const btn1 = container.querySelector('[data-item="1"]') as HTMLButtonElement
    const btn0 = container.querySelector('[data-item="0"]') as HTMLButtonElement
    act(() => btn1.click())
    expect(btn1.getAttribute('data-selected')).toBe('true')
    expect(btn0.getAttribute('data-dimmed')).toBe('true')
  })

  it('tapping the same item again clears the selection — tapping away restores', () => {
    const { container } = render(<TapProbe />)
    const btn1 = container.querySelector('[data-item="1"]') as HTMLButtonElement
    act(() => btn1.click())
    act(() => btn1.click())
    expect(btn1.getAttribute('data-selected')).toBe('false')
    expect(btn1.getAttribute('data-dimmed')).toBe('false')
  })

  it('nothing is dimmed when nothing is selected', () => {
    const { container } = render(<TapProbe />)
    const buttons = Array.from(container.querySelectorAll('[data-dimmed]'))
    expect(buttons.every((b) => b.getAttribute('data-dimmed') === 'false')).toBe(true)
  })
})
