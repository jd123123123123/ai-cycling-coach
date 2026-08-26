import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import W3WrappedView from '../W3WrappedView'
import { buildWrappedVm } from '../w3wrapped'
import type { Wrapped } from '../../../pages/WeeklyWrapped'

/**
 * The deck's MECHANICS, which need no browser: it mounts, a tap advances, hold
 * pauses, and the share exists only on the last slide. Appearance still needs a
 * real render — this covers "does it work", never "does it look right".
 *
 * Queries are scoped to each render's own container rather than the global
 * `screen`, so a leaked render from a previous test cannot make a query
 * ambiguous.
 */

const W: Wrapped = {
  week_start: '2026-08-18', week_end: '2026-08-24', has_rides: true,
  totals: { sessions: 5, hours: 8.25, km: 214.6, tss: 486, active_days: 5, saddle_hm: '8:15 h' },
  planned_tss: 450, ctl_delta: 2.4, route: null,
  distance_comparison: null, saddle_line: null, daily_effort: [],
  elevation_m: 2140, peak_power: null, best_ride: null, rides: 5, zero_missed: true,
}

afterEach(cleanup)

function deck(onClose?: () => void) {
  const { container } = render(<W3WrappedView vm={buildWrappedVm(W)} onClose={onClose} />)
  const btn = (label: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
  const text = (t: string) =>
    [...container.querySelectorAll('span')].some((e) => e.textContent?.trim() === t)
  return { container, next: () => btn('Weiter'), back: () => btn('Zurück'), close: () => btn('Schließen'), text }
}

describe('W3 Wrapped · the deck runs', () => {
  it('opens on the promise slide, with no figure on it', () => {
    const d = deck()
    expect(d.text('Sieben Tage.')).toBe(true)
    expect(d.text('214,6')).toBe(false)   // slide two's number, not yet
  })

  it('advances when the right side is tapped', () => {
    const d = deck()
    fireEvent.click(d.next())
    expect(d.text('214,6')).toBe(true)
  })

  it('goes back when the left side is tapped', () => {
    const d = deck()
    fireEvent.click(d.next())
    fireEvent.click(d.back())
    expect(d.text('Sieben Tage.')).toBe(true)
  })

  it('does not run off the end', () => {
    const d = deck()
    for (let i = 0; i < 20; i++) fireEvent.click(d.next())
    expect(d.text('Woche teilen')).toBe(true)
  })

  it('offers the share only once the deck is finished', () => {
    expect(deck().text('Woche teilen')).toBe(false)
  })

  it('advances on its own, and holding stops it', () => {
    vi.useFakeTimers()
    try {
      const d = deck()
      act(() => { vi.advanceTimersByTime(6000) })
      expect(d.text('214,6')).toBe(true)

      // Hold freezes the clock: six more seconds must not advance the deck.
      fireEvent.pointerDown(d.next())
      act(() => { vi.advanceTimersByTime(6000) })
      expect(d.text('214,6')).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('closes when asked', () => {
    const onClose = vi.fn()
    const d = deck(onClose)
    fireEvent.click(d.close())
    expect(onClose).toHaveBeenCalled()
  })
})
