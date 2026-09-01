import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import W3WinsRhythm, { type W3RhythmVm } from '../W3WinsRhythm'

afterEach(cleanup)

/**
 * The rhythm card, which is the one instrument on Erfolge that can lie in
 * three different directions: by offering a comparison it does not have, by
 * flattering a partial month, and by drawing a season the rider never rode.
 */

const months = Array.from({ length: 12 }, (_, i) => ({
  start: `2026-${String(i + 1).padStart(2, '0')}-01`,
  rides: 10,
  km: 100 + i * 50,
  minutes: 600,
}))

const weeks = Array.from({ length: 52 }, (_, i) => ({
  start: `2025-09-${String((i % 28) + 1).padStart(2, '0')}`,
  rides: i % 5 === 0 ? 0 : 2,
  minutes: i % 5 === 0 ? 0 : 180,
}))

const BASE: W3RhythmVm = {
  season: {
    year: 2026, prevYear: 2025,
    current: { rides: 168, km: 6420, minutes: 19_180 },
    previous: { rides: 141, km: 5180, minutes: 16_040 },
  },
  months,
  days: Array.from({ length: 14 }, (_, i) => ({
    start: `2026-08-${String(19 + i).padStart(2, '0')}`,
    rides: i % 3 === 0 ? 0 : 1,
    km: i % 3 === 0 ? 0 : 40 + i * 3,
    minutes: i % 3 === 0 ? 0 : 95,
  })),
  weeks,
  ridden: 46,
  of: 52,
  longestStreak: 19,
}

describe('the grain switch', () => {
  it('opens on the month, which is the grain that reads at a glance', () => {
    render(<W3WinsRhythm vm={BASE} />)
    expect(screen.getByRole('tab', { name: 'MONAT' }).getAttribute('aria-selected')).toBe('true')
  })

  it('offers all three grains when the season resolved', () => {
    render(<W3WinsRhythm vm={BASE} />)
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['SAISON', 'MONAT', 'WOCHE'])
  })

  it('DOES NOT OFFER A SEASON IT CANNOT SHOW', () => {
    // A first-year rider has nothing to compare against. A tab that resolves
    // to an empty panel is worse than no tab.
    render(<W3WinsRhythm vm={{ ...BASE, season: null }} />)
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['MONAT', 'WOCHE'])
    expect(screen.queryByText('SAISON')).toBeNull()
  })

  it('switches the readout when a grain is chosen', () => {
    render(<W3WinsRhythm vm={BASE} />)
    fireEvent.click(screen.getByRole('tab', { name: 'WOCHE' }))
    expect(screen.getByRole('tab', { name: 'WOCHE' }).getAttribute('aria-selected')).toBe('true')
    // The week grain is now the last fourteen days, not the 52-week tally —
    // that moved to its own chapter, because "did you show up" and "how much"
    // are different questions and one card cannot answer both.
    expect(screen.getByText(/In 14 Tagen/)).toBeTruthy()
  })
})

describe('the season grain', () => {
  it('prints both years in full, not just the bars', () => {
    render(<W3WinsRhythm vm={BASE} />)
    fireEvent.click(screen.getByRole('tab', { name: 'SAISON' }))
    expect(screen.getByText('2026')).toBeTruthy()
    expect(screen.getByText('2025')).toBeTruthy()
    // A comparison whose numbers are not printed is the shape that flatters.
    expect(screen.getByText(/6\.420 km/)).toBeTruthy()
    // Twice by design: on the rail's own row, and in the sub-line naming the
    // day it is measured to.
    expect(screen.getAllByText(/5\.180 km/).length).toBeGreaterThan(0)
  })

  it('says the comparison is to the SAME DAY last year', () => {
    render(<W3WinsRhythm vm={BASE} />)
    fireEvent.click(screen.getByRole('tab', { name: 'SAISON' }))
    expect(screen.getByText(/zum selben Tag/)).toBeTruthy()
  })

  it('shows a gain as a plus', () => {
    render(<W3WinsRhythm vm={BASE} />)
    fireEvent.click(screen.getByRole('tab', { name: 'SAISON' }))
    expect(screen.getByText('+24 %')).toBeTruthy()
  })

  it('SHOWS A LOSS AS A LOSS', () => {
    // The card is allowed to be unflattering. A rider down on last year has
    // to be able to see it, or the number means nothing when it is up.
    render(<W3WinsRhythm vm={{
      ...BASE,
      season: { ...BASE.season!, current: { rides: 80, km: 2590, minutes: 8000 } },
    }} />)
    fireEvent.click(screen.getByRole('tab', { name: 'SAISON' }))
    expect(screen.getByText('−50 %')).toBeTruthy()
  })
})

describe('empty data', () => {
  it('survives a year with no riding in it at all', () => {
    const empty = months.map((m) => ({ ...m, rides: 0, km: 0, minutes: 0 }))
    const noDays = BASE.days.map((d) => ({ ...d, rides: 0, km: 0, minutes: 0 }))
    render(<W3WinsRhythm vm={{ ...BASE, months: empty, days: noDays, season: null }} />)
    fireEvent.click(screen.getByRole('tab', { name: 'WOCHE' }))
    // No peak to scale against, and no division by zero.
    expect(screen.getByText(/an 0 davon gefahren/)).toBeTruthy()
  })
})

describe('the chart re-grains with the tab', () => {
  /**
   * Each tab is one unit finer than the last: a season is drawn as its months,
   * a month as its weeks, a week as its days. Three fixed charts would have
   * been three instruments; this is one at three zooms.
   */
  it('draws months under SAISON', () => {
    render(<W3WinsRhythm vm={BASE} />)
    fireEvent.click(screen.getByRole('tab', { name: 'SAISON' }))
    // 12 months + the two season rails carry no bars of their own.
    expect(screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') !== null)).toHaveLength(12)
  })

  it('draws twelve weeks under MONAT', () => {
    render(<W3WinsRhythm vm={BASE} />)
    expect(screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') !== null)).toHaveLength(12)
    expect(screen.getByText(/letzten zwölf Wochen/)).toBeTruthy()
  })

  it('draws fourteen days under WOCHE', () => {
    render(<W3WinsRhythm vm={BASE} />)
    fireEvent.click(screen.getByRole('tab', { name: 'WOCHE' }))
    expect(screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') !== null)).toHaveLength(14)
    expect(screen.getByText(/In 14 Tagen/)).toBeTruthy()
  })
})

describe('tapping a bar', () => {
  const bars = () => screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') !== null)

  it('GIVES THE BAR THE READOUT — that is the whole point of tapping it', () => {
    render(<W3WinsRhythm vm={BASE} />)
    fireEvent.click(screen.getByRole('tab', { name: 'WOCHE' }))
    fireEvent.click(bars()[1])          // 2026-08-20 → 43 km, 1 ride
    expect(screen.getByText(/Donnerstag/)).toBeTruthy()
    expect(screen.getByText(/1 Fahrt /)).toBeTruthy()
  })

  it('lets go when the same bar is tapped again', () => {
    render(<W3WinsRhythm vm={BASE} />)
    fireEvent.click(screen.getByRole('tab', { name: 'WOCHE' }))
    fireEvent.click(bars()[1])
    expect(bars()[1].getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(bars()[1])
    expect(bars()[1].getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText(/In 14 Tagen/)).toBeTruthy()
  })

  it('says so when the tapped day was a rest day', () => {
    render(<W3WinsRhythm vm={BASE} />)
    fireEvent.click(screen.getByRole('tab', { name: 'WOCHE' }))
    fireEvent.click(bars()[0])          // i % 3 === 0 → no ride
    expect(screen.getByText('Kein Training an diesem Tag.')).toBeTruthy()
  })

  it('DROPS THE SELECTION WHEN THE GRAIN CHANGES', () => {
    // Index 3 means a different period in each grain; carrying it across
    // would silently re-point the readout at something else.
    render(<W3WinsRhythm vm={BASE} />)
    fireEvent.click(screen.getByRole('tab', { name: 'WOCHE' }))
    fireEvent.click(bars()[1])
    fireEvent.click(screen.getByRole('tab', { name: 'MONAT' }))
    expect(bars().every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(screen.getByText(/letzten zwölf Wochen/)).toBeTruthy()
  })
})
