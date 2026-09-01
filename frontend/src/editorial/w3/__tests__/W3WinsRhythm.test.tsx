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
    expect(screen.getByText(/Wochen mit mindestens einer Fahrt/)).toBeTruthy()
    expect(screen.getByText('von 52')).toBeTruthy()
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

describe('the month grain', () => {
  it('names the strongest month rather than leaving it to be counted', () => {
    render(<W3WinsRhythm vm={BASE} />)
    expect(screen.getByText(/Stärkster Monat: DEZ/)).toBeTruthy()
  })

  it('survives a year with no riding in it at all', () => {
    const empty = months.map((m) => ({ ...m, rides: 0, km: 0, minutes: 0 }))
    render(<W3WinsRhythm vm={{ ...BASE, months: empty, season: null }} />)
    // No peak to name, and no division by zero.
    expect(screen.getByText('In den letzten zwölf Monaten.')).toBeTruthy()
    expect(screen.getByText('0')).toBeTruthy()
  })
})

describe('the week grain', () => {
  it('carries the streak the grid beside it is evidence for', () => {
    render(<W3WinsRhythm vm={BASE} />)
    fireEvent.click(screen.getByRole('tab', { name: 'WOCHE' }))
    expect(screen.getByText(/Längste Serie: 19 Wochen/)).toBeTruthy()
  })

  it('says "1 Woche" rather than "1 Wochen"', () => {
    render(<W3WinsRhythm vm={{ ...BASE, longestStreak: 1 }} />)
    fireEvent.click(screen.getByRole('tab', { name: 'WOCHE' }))
    expect(screen.getByText(/Längste Serie: 1 Woche\./)).toBeTruthy()
  })
})
