import { act } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Bars from '../components/Bars'
import WeekRail from '../components/WeekRail'
import ZoneRows from '../components/ZoneRows'
import { present } from '../data/value'

afterEach(cleanup)

/**
 * jsdom has no IntersectionObserver by default, so `useReveal` falls back to
 * "reveal immediately" — these tests can't observe the pre-reveal frame that
 * way. Installing a fake IntersectionObserver that never fires lets them
 * assert the true initial (zero/baseline) state before flipping it and
 * checking the settled state, matching how a real browser behaves for a
 * chart that starts below the fold.
 */
function installManualIO() {
  let cb: IntersectionObserverCallback | null = null
  class FakeIO {
    constructor(callback: IntersectionObserverCallback) {
      cb = callback
    }
    observe() {}
    disconnect() {}
  }
  // @ts-expect-error -- minimal fake for the test
  globalThis.IntersectionObserver = FakeIO
  return {
    fire: () => act(() => cb!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)),
  }
}

describe('Bars motion', () => {
  const originalIO = globalThis.IntersectionObserver
  afterEach(() => { globalThis.IntersectionObserver = originalIO })

  it('starts every present bar at zero height and grows to its target once revealed', () => {
    const { fire } = installManualIO()
    const { container } = render(<Bars blocks={[{ label: '1', minutes: 4, watts: present(305) }]} />)
    const bar = container.querySelector('[data-block]') as HTMLElement
    expect(bar.style.height).toBe('0px')

    fire()

    expect(bar.style.height).not.toBe('0px')
  })

  it('never animates a block with no watts value — it renders its ghost height immediately', () => {
    installManualIO()
    const { container } = render(<Bars blocks={[{ label: '1', minutes: 4, watts: { missing: 'No target set.' } }]} />)
    const bar = container.querySelector('[data-block]') as HTMLElement
    expect(bar.style.height).toBe('8px')
  })

  it('tapping a present bar lifts it and dims its sibling; tapping again restores both', () => {
    const { container } = render(<Bars blocks={[
      { label: '1', minutes: 4, watts: present(200) },
      { label: '2', minutes: 4, watts: present(100) },
    ]} />)
    const bars = container.querySelectorAll('[data-block]')
    act(() => (bars[0] as HTMLElement).click())
    expect((bars[0] as HTMLElement).style.background).toContain('--st-active')
    expect((bars[1] as HTMLElement).style.background).toContain('--d-2')

    act(() => (bars[0] as HTMLElement).click())
    expect((bars[0] as HTMLElement).style.background).not.toContain('--st-active')
    expect((bars[1] as HTMLElement).style.background).not.toContain('--d-2')
  })
})

describe('WeekRail motion', () => {
  const originalIO = globalThis.IntersectionObserver
  afterEach(() => { globalThis.IntersectionObserver = originalIO })

  it('starts a present day at zero height and grows once revealed', () => {
    const { fire } = installManualIO()
    const { container } = render(<WeekRail days={[{ letter: 'M', tss: present(64) }]} />)
    const bar = container.querySelector('[data-week-day] div') as HTMLElement
    expect(bar.style.height).toBe('0px')
    fire()
    expect(bar.style.height).not.toBe('0px')
  })
})

describe('reduced motion disables the transition entirely', () => {
  let originalMatchMedia: typeof window.matchMedia
  beforeEach(() => {
    originalMatchMedia = window.matchMedia
    window.matchMedia = () => ({ matches: true }) as MediaQueryList
  })
  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('Bars settles at its final height on the very first render, with no transition string', () => {
    const { container } = render(<Bars blocks={[{ label: '1', minutes: 4, watts: present(305) }]} />)
    const bar = container.querySelector('[data-block]') as HTMLElement
    expect(bar.style.height).not.toBe('0px')
    expect(bar.style.transition).toBe('')
  })

  it('ZoneRows renders every zone at final width immediately, no transition string', () => {
    const { container } = render(<ZoneRows zones={present([
      { name: 'Z1', lowBpm: 0, highBpm: 124, seconds: 600 },
      { name: 'Z2', lowBpm: 124, highBpm: 141, seconds: 400 },
    ])} />)
    const bars = container.querySelectorAll('[data-zone-bar]')
    expect(bars.length).toBe(2)
    for (const bar of bars) {
      expect((bar as HTMLElement).style.transition).toBe('')
    }
  })
})
