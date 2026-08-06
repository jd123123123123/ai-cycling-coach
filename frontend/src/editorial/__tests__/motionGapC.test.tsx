import { act } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import FatigueCurve from '../components/FatigueCurve'
import RouteOptions from '../components/RouteOptions'
import PeakRows from '../components/PeakRows'
import RangeRow from '../components/RangeRow'
import { present, missing } from '../data/value'
import type { TodayModel } from '../data/useTodayModel'
import type { RouteOption } from '../data/useSessionModel'

afterEach(cleanup)

/**
 * jsdom has no IntersectionObserver by default, so `useReveal` falls back to
 * "reveal immediately." Installing a fake that never fires on its own lets
 * these tests observe the true pre-reveal frame before flipping it — same
 * pattern `chartMotion.test.tsx` already uses for Bars/WeekRail/ZoneRows.
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

/** Same idea as `installManualIO`, but for a screen with MULTIPLE independent
 *  `useReveal` observers (each `RouteCard` owns its own) — fires every one
 *  of them, not just whichever constructed last. */
function installManualIOAll() {
  const callbacks: IntersectionObserverCallback[] = []
  class FakeIO {
    constructor(callback: IntersectionObserverCallback) {
      callbacks.push(callback)
    }
    observe() {}
    disconnect() {}
  }
  // @ts-expect-error -- minimal fake for the test
  globalThis.IntersectionObserver = FakeIO
  return {
    fire: () => act(() => {
      for (const cb of callbacks) cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    }),
  }
}

const pmcPresent: TodayModel['pmc'] = present({ fitness: 42, fatigue: 58, form: -16, series: [] })
const recoveryPresent: TodayModel['recovery'] = present({ clearAtLabel: 'Thu', hoursRemaining: 30 })

describe('FatigueCurve motion', () => {
  const originalIO = globalThis.IntersectionObserver
  afterEach(() => { globalThis.IntersectionObserver = originalIO })

  it('the now bar starts at zero width and grows once revealed', () => {
    const { fire } = installManualIO()
    const { container } = render(<FatigueCurve pmc={pmcPresent} recovery={recoveryPresent} />)
    const now = container.querySelector('[data-fatigue-point="now"]') as HTMLElement
    expect(now.style.width).toBe('0%')
    fire()
    expect(now.style.width).not.toBe('0%')
  })

  it('never animates when pmc is missing — renders the reason instead', () => {
    installManualIO()
    const { container } = render(<FatigueCurve pmc={missing('No PMC data.')} recovery={recoveryPresent} />)
    expect(container.querySelector('[data-fatigue-point="now"]')).toBeNull()
    expect(container.textContent).toContain('No PMC data.')
  })

  it('tapping the now point highlights it and dims the neutral label; tapping again restores', () => {
    const { container } = render(<FatigueCurve pmc={pmcPresent} recovery={recoveryPresent} />)
    const now = container.querySelector('[data-fatigue-point="now"]') as HTMLElement
    const spans = container.querySelectorAll('span')
    const neutralLabel = Array.from(spans).find((s) => s.textContent?.includes('42')) as HTMLElement
    act(() => now.click())
    expect(now.style.background).toContain('--st-active')
    expect(neutralLabel.style.color).toContain('--d-2')
    act(() => now.click())
    expect(neutralLabel.style.color).not.toContain('--d-2')
  })
})

describe('RangeRow motion', () => {
  const originalIO = globalThis.IntersectionObserver
  afterEach(() => { globalThis.IntersectionObserver = originalIO })

  it('the mark starts centred and travels to its band position once revealed', () => {
    const { fire } = installManualIO()
    const { container } = render(
      <RangeRow label="HRV" value={present(68)} unit="ms" band={{ low: 55, high: 72, position: 'below' }} />,
    )
    const marker = container.querySelector('[data-range-marker]') as HTMLElement
    expect(marker.style.left).toBe('50%')
    fire()
    expect(marker.style.left).not.toBe('50%')
  })

  it('never renders a marker when band is null — nothing to travel to', () => {
    installManualIO()
    const { container } = render(<RangeRow label="HRV" value={present(68)} unit="ms" band={null} />)
    expect(container.querySelector('[data-range-marker]')).toBeNull()
  })

  it('tapping the marker surfaces the value and band bounds; tapping again hides it', () => {
    const { container } = render(
      <RangeRow label="HRV" value={present(68)} unit="ms" band={{ low: 55, high: 72, position: 'in' }} />,
    )
    const marker = container.querySelector('[data-range-marker]') as HTMLElement
    expect(container.querySelector('[data-range-readout]')).toBeNull()
    act(() => marker.click())
    expect(container.querySelector('[data-range-readout]')?.textContent).toContain('68')
    expect(container.querySelector('[data-range-readout]')?.textContent).toContain('55')
    expect(container.querySelector('[data-range-readout]')?.textContent).toContain('72')
    act(() => marker.click())
    expect(container.querySelector('[data-range-readout]')).toBeNull()
  })
})

describe('PeakRows motion', () => {
  const originalIO = globalThis.IntersectionObserver
  afterEach(() => { globalThis.IntersectionObserver = originalIO })

  const peaks = present([
    { duration: '5s', watts: 900, percentOfSeasonBest: null },
    { duration: '1min', watts: 450, percentOfSeasonBest: null },
  ])

  it('a row bar starts at zero width and grows to its scaled target once revealed', () => {
    const { fire } = installManualIO()
    const { container } = render(<PeakRows total={missing('none')} peaks={peaks} />)
    const bar = container.querySelector('[data-peak-bar]') as HTMLElement
    expect(bar.style.width).toBe('0%')
    fire()
    expect(bar.style.width).not.toBe('0%')
  })

  it('never renders a bar when peaks is missing', () => {
    installManualIO()
    const { container } = render(<PeakRows total={missing('none')} peaks={missing('No peak-power analysis yet.')} />)
    expect(container.querySelector('[data-peak-bar]')).toBeNull()
  })

  it('tapping a row lifts its bar and dims its sibling; tapping again restores both', () => {
    const { container } = render(<PeakRows total={missing('none')} peaks={peaks} />)
    const rows = container.querySelectorAll('[data-peak-row]')
    const bars = container.querySelectorAll('[data-peak-bar]')
    act(() => (rows[0] as HTMLElement).click())
    expect((bars[0] as HTMLElement).style.background).toContain('--st-active')
    expect((bars[1] as HTMLElement).style.background).toContain('--d-2')
    expect(container.querySelector('[data-peak-readout]')?.textContent).toContain('900')

    act(() => (rows[0] as HTMLElement).click())
    expect((bars[0] as HTMLElement).style.background).not.toContain('--st-active')
    expect((bars[1] as HTMLElement).style.background).not.toContain('--d-2')
    expect(container.querySelector('[data-peak-readout]')).toBeNull()
  })
})

const twoRoutes: RouteOption[] = [
  {
    key: 'r1', optionLetter: 'A', name: 'Loop One', distanceKm: 40, ascentM: present(300), rideCount: 4,
    trackPolyline: present([[47.1, 8.1], [47.2, 8.2], [47.3, 8.1]]),
  },
  {
    key: 'r2', optionLetter: 'B', name: 'Loop Two', distanceKm: 60, ascentM: present(500), rideCount: 2,
    trackPolyline: present([[47.0, 8.0], [47.1, 8.1], [47.2, 8.0]]),
  },
]

describe('RouteOptions motion', () => {
  const originalIO = globalThis.IntersectionObserver
  afterEach(() => { globalThis.IntersectionObserver = originalIO })

  it('a track wrap starts fully clipped and draws in once revealed', () => {
    const { fire } = installManualIOAll()
    const { container } = render(<RouteOptions routes={present(twoRoutes)} />)
    const wrap = container.querySelector('[data-route-sketch-wrap]') as HTMLElement
    expect(wrap.style.clipPath).toBe('inset(0 100% 0 0)')
    fire()
    expect(wrap.style.clipPath).toBe('inset(0 0% 0 0)')
  })

  it('never wraps or draws a track for a route with no polyline', () => {
    installManualIO()
    const routes: RouteOption[] = [
      { key: 'r3', optionLetter: 'A', name: 'Untracked', distanceKm: 10, ascentM: present(50), rideCount: 1, trackPolyline: missing('No GPS track recorded for this route.') },
    ]
    const { container } = render(<RouteOptions routes={present(routes)} />)
    expect(container.querySelector('[data-route-sketch-wrap]')).toBeNull()
    expect(container.textContent).toContain('No GPS track recorded for this route.')
  })

  it('tapping a card selects it and dims its sibling; tapping again restores both', () => {
    const { container } = render(<RouteOptions routes={present(twoRoutes)} />)
    const cards = container.querySelectorAll('[data-route-card]')
    act(() => (cards[0] as HTMLElement).click())
    const names = container.querySelectorAll('p')
    expect((names[0] as HTMLElement).style.color).toContain('--st-active')
    expect((names[1] as HTMLElement).style.color).toContain('--d-2')

    act(() => (cards[0] as HTMLElement).click())
    expect((names[0] as HTMLElement).style.color).not.toContain('--st-active')
    expect((names[1] as HTMLElement).style.color).not.toContain('--d-2')
  })
})

describe('reduced motion disables the transition entirely (Task C components)', () => {
  let originalMatchMedia: typeof window.matchMedia
  beforeEach(() => {
    originalMatchMedia = window.matchMedia
    window.matchMedia = () => ({ matches: true }) as MediaQueryList
  })
  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('FatigueCurve settles at final width immediately, no transition string', () => {
    const { container } = render(<FatigueCurve pmc={pmcPresent} recovery={recoveryPresent} />)
    const now = container.querySelector('[data-fatigue-point="now"]') as HTMLElement
    expect(now.style.width).not.toBe('0%')
    expect(now.style.transition).toBe('')
  })

  it('RangeRow places the marker at its final position immediately, no transition string', () => {
    const { container } = render(
      <RangeRow label="HRV" value={present(68)} unit="ms" band={{ low: 55, high: 72, position: 'below' }} />,
    )
    const marker = container.querySelector('[data-range-marker]') as HTMLElement
    expect(marker.style.left).not.toBe('50%')
    expect(marker.style.transition).toBe('')
  })

  it('PeakRows renders every bar at final width immediately, no transition string', () => {
    const { container } = render(<PeakRows total={missing('none')} peaks={present([
      { duration: '5s', watts: 900, percentOfSeasonBest: null },
    ])} />)
    const bar = container.querySelector('[data-peak-bar]') as HTMLElement
    expect(bar.style.width).not.toBe('0%')
    expect(bar.style.transition).toBe('')
  })

  it('RouteOptions renders the track fully drawn in immediately, no transition string', () => {
    const { container } = render(<RouteOptions routes={present(twoRoutes)} />)
    const wrap = container.querySelector('[data-route-sketch-wrap]') as HTMLElement
    expect(wrap.style.clipPath).toBe('inset(0 0% 0 0)')
    expect(wrap.style.transition).toBe('')
  })
})
