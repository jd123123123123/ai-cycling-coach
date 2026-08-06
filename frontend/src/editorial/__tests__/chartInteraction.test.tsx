import { act } from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import PMCChart from '../components/PMCChart'
import Bars from '../components/Bars'
import WeekRail from '../components/WeekRail'
import { present, missing } from '../data/value'
import type { PmcPoint } from '../data/useTodayModel'

afterEach(cleanup)

/**
 * The owner's own complaint, made concrete: a chart with a role and a
 * tabIndex you can never reach, a click handler that only ever fires from
 * `.click()` in a test, is not what "interactive" means on a phone. Every
 * test here goes through the DOM surface a real finger or a real keyboard
 * would use — `getByRole`/`querySelector` + `fireEvent.pointerDown`/
 * `fireEvent.keyDown` — never a bare hook. `useReveal`'s IntersectionObserver
 * fallback (jsdom has none) already reveals every chart immediately, so no
 * manual-IO scaffolding is needed here the way `chartMotion.test.tsx` needs
 * it to catch the PRE-reveal frame.
 */

// jsdom's `getBoundingClientRect` is all-zero by default — `useScrub`'s own
// x -> nearest-point math needs a real width to convert a clientX into a
// percentage, so every scrub test runs inside this fixed 342px-wide rect.
function stubRect(width = 342) {
  const original = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = () => ({
    left: 0, top: 0, right: width, bottom: 100, width, height: 100, x: 0, y: 0, toJSON() {},
  })
  return () => { Element.prototype.getBoundingClientRect = original }
}

function pmcSeries(days: number): PmcPoint[] {
  return Array.from({ length: days }, (_, i) => ({
    date: `2026-06-${String(i + 1).padStart(2, '0')}`,
    ctl: 40 + i,
    atl: 50 + i,
    tsb: -10 + i,
  }))
}

describe('PMCChart — scrub to read', () => {
  it('the plot is reachable in the DOM: focusable, with a role and a label', () => {
    const { container } = render(<PMCChart series={present(pmcSeries(10))} days={42} />)
    const plot = container.querySelector('[data-pmc-plot]') as HTMLElement
    expect(plot).not.toBeNull()
    expect(plot.getAttribute('role')).toBe('img')
    expect(plot.getAttribute('tabindex')).toBe('0')
    expect(plot.getAttribute('aria-label')).toBeTruthy()
  })

  it('a missing series exposes no interactive plot at all', () => {
    const { container } = render(<PMCChart series={missing('No training history yet.')} days={42} />)
    expect(container.querySelector('[data-pmc-plot]')).toBeNull()
    expect(container.textContent).toContain('No training history yet.')
  })

  it('touching the plot reads the nearest day into an aria-live readout', () => {
    const unstub = stubRect(342)
    const series = pmcSeries(10)
    const { container } = render(<PMCChart series={present(series)} days={42} />)
    const plot = container.querySelector('[data-pmc-plot]') as HTMLElement
    const readout = container.querySelector('[data-pmc-readout]') as HTMLElement
    expect(readout.getAttribute('aria-live')).toBe('polite')
    expect(readout.textContent).toBe('')

    // x=0 is the first (oldest) day in a 10-point, evenly spaced series.
    act(() => { fireEvent.pointerDown(plot, { clientX: 0, pointerId: 1 }) })
    expect(readout.textContent).toContain('FITNESS 40')
    expect(readout.textContent).toContain('ERMÜDUNG 50')

    unstub()
  })

  it('a hairline and one dot per series appear at the touched point', () => {
    const unstub = stubRect(342)
    const { container } = render(<PMCChart series={present(pmcSeries(10))} days={42} />)
    const plot = container.querySelector('[data-pmc-plot]') as HTMLElement
    expect(container.querySelector('[data-pmc-hairline]')).toBeNull()
    act(() => { fireEvent.pointerDown(plot, { clientX: 100, pointerId: 1 }) })
    expect(container.querySelector('[data-pmc-hairline]')).not.toBeNull()
    expect(container.querySelectorAll('[data-pmc-dot]')).toHaveLength(3)
    unstub()
  })

  it('ArrowRight moves the read point forward one day at a time', () => {
    const unstub = stubRect(342)
    const series = pmcSeries(10)
    const { container } = render(<PMCChart series={present(series)} days={42} />)
    const plot = container.querySelector('[data-pmc-plot]') as HTMLElement
    const readout = container.querySelector('[data-pmc-readout]') as HTMLElement

    act(() => { fireEvent.keyDown(plot, { key: 'ArrowRight' }) })
    expect(readout.textContent).toContain('FITNESS 40') // index 0

    act(() => { fireEvent.keyDown(plot, { key: 'ArrowRight' }) })
    expect(readout.textContent).toContain('FITNESS 41') // index 1

    unstub()
  })

  it('End jumps straight to the most recent day', () => {
    const unstub = stubRect(342)
    const series = pmcSeries(10)
    const { container } = render(<PMCChart series={present(series)} days={42} />)
    const plot = container.querySelector('[data-pmc-plot]') as HTMLElement
    const readout = container.querySelector('[data-pmc-readout]') as HTMLElement

    act(() => { fireEvent.keyDown(plot, { key: 'End' }) })
    expect(readout.textContent).toContain('FITNESS 49') // index 9, last day

    unstub()
  })

  it('Escape clears the reading', () => {
    const unstub = stubRect(342)
    const series = pmcSeries(10)
    const { container } = render(<PMCChart series={present(series)} days={42} />)
    const plot = container.querySelector('[data-pmc-plot]') as HTMLElement
    const readout = container.querySelector('[data-pmc-readout]') as HTMLElement

    act(() => { fireEvent.pointerDown(plot, { clientX: 100, pointerId: 1 }) })
    expect(readout.textContent).not.toBe('')

    act(() => { fireEvent.keyDown(plot, { key: 'Escape' }) })
    expect(readout.textContent).toBe('')
    expect(container.querySelector('[data-pmc-hairline]')).toBeNull()

    unstub()
  })
})

describe('Bars — keyboard parity for a categorical chart', () => {
  it('the row is reachable in the DOM: focusable, with role="group" and a label', () => {
    const { container } = render(<Bars blocks={[
      { label: 'Warm-up', minutes: 10, watts: present(150) },
      { label: 'Interval', minutes: 4, watts: present(300) },
    ]} />)
    const row = container.querySelector('[data-bars]') as HTMLElement
    expect(row.getAttribute('role')).toBe('group')
    expect(row.getAttribute('tabindex')).toBe('0')
    expect(row.getAttribute('aria-label')).toBeTruthy()
  })

  it('a chart with no present blocks exposes no keyboard target', () => {
    const { container } = render(<Bars blocks={[
      { label: 'Warm-up', minutes: 10, watts: missing('No target set.') },
    ]} />)
    const row = container.querySelector('[data-bars]') as HTMLElement
    expect(row.getAttribute('tabindex')).toBeNull()
  })

  it('ArrowRight selects the first block, then moves to the next, with an aria-live readout', () => {
    const { container } = render(<Bars blocks={[
      { label: 'Warm-up', minutes: 10, watts: present(150) },
      { label: 'Interval', minutes: 4, watts: present(300) },
    ]} />)
    const row = container.querySelector('[data-bars]') as HTMLElement
    const readout = container.querySelector('[data-bars-readout]') as HTMLElement
    expect(readout.getAttribute('aria-live')).toBe('polite')

    act(() => { fireEvent.keyDown(row, { key: 'ArrowRight' }) })
    const blocks = container.querySelectorAll('[data-block]')
    expect((blocks[0] as HTMLElement).style.background).toContain('--st-active')
    expect(readout.textContent).toContain('150')

    act(() => { fireEvent.keyDown(row, { key: 'ArrowRight' }) })
    expect((blocks[1] as HTMLElement).style.background).toContain('--st-active')
    expect(readout.textContent).toContain('300')
  })

  it('Escape clears the keyboard selection', () => {
    const { container } = render(<Bars blocks={[{ label: 'Warm-up', minutes: 10, watts: present(150) }]} />)
    const row = container.querySelector('[data-bars]') as HTMLElement
    act(() => { fireEvent.keyDown(row, { key: 'ArrowRight' }) })
    expect((container.querySelector('[data-block]') as HTMLElement).style.background).toContain('--st-active')
    act(() => { fireEvent.keyDown(row, { key: 'Escape' }) })
    expect((container.querySelector('[data-block]') as HTMLElement).style.background).not.toContain('--st-active')
  })
})

describe('WeekRail — keyboard parity, missing days skipped', () => {
  it('keyboard navigation never lands on a dashed (missing) day', () => {
    const { container } = render(<WeekRail days={[
      { letter: 'M', tss: missing('No ride recorded.') },
      { letter: 'T', tss: present(64) },
    ]} />)
    const rail = container.querySelector('[data-week-rail]') as HTMLElement
    const readout = container.querySelector('[data-week-rail-readout]') as HTMLElement

    act(() => { fireEvent.keyDown(rail, { key: 'ArrowRight' }) })
    // Only Tuesday (index 1) is a valid stop — Monday's dash is never reachable.
    expect(readout.textContent).toContain('T')
    expect(readout.textContent).toContain('64')
  })

  it('a week with every day missing exposes no keyboard target', () => {
    const { container } = render(<WeekRail days={[
      { letter: 'M', tss: missing('No ride recorded.') },
    ]} />)
    expect((container.querySelector('[data-week-rail]') as HTMLElement).getAttribute('tabindex')).toBeNull()
  })
})

describe('reduced motion does not disable interaction', () => {
  let originalMatchMedia: typeof window.matchMedia
  beforeEach(() => {
    originalMatchMedia = window.matchMedia
    window.matchMedia = () => ({ matches: true }) as MediaQueryList
  })
  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('PMCChart still scrubs with motion switched off', () => {
    const unstub = stubRect(342)
    const { container } = render(<PMCChart series={present(pmcSeries(10))} days={42} />)
    const plot = container.querySelector('[data-pmc-plot]') as HTMLElement
    act(() => { fireEvent.pointerDown(plot, { clientX: 0, pointerId: 1 }) })
    expect((container.querySelector('[data-pmc-readout]') as HTMLElement).textContent).toContain('FITNESS 40')
    unstub()
  })

  it('Bars keyboard nav still works with motion switched off', () => {
    const { container } = render(<Bars blocks={[{ label: 'Warm-up', minutes: 10, watts: present(150) }]} />)
    const row = container.querySelector('[data-bars]') as HTMLElement
    act(() => { fireEvent.keyDown(row, { key: 'ArrowRight' }) })
    expect((container.querySelector('[data-block]') as HTMLElement).style.background).toContain('--st-active')
  })
})
