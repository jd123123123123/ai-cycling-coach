import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import W3RidesDock from '../W3RidesDock'
import type { ActivityRhythm } from '../../../api/rhythm'

afterEach(cleanup)

// The dock measures its own open height with a ResizeObserver, which jsdom
// does not implement. Stubbed rather than worked around: the measurement is
// real behaviour worth keeping, and the alternative is a component that
// branches on being under test.
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver ?? (RO as never)

/**
 * The Fahrten dock's grain switch.
 *
 * The defect the switch would otherwise have created is the one worth testing:
 * a rider taps WOCHE, the headline becomes seven days, and everything under it
 * keeps quoting the year.
 */

const bucket = (start: string, km: number, rides = 1) => ({
  start, km, rides, hours: km / 25, elevation_m: Math.round(km * 8),
})

// Bucket counts are the server's real ones — twelve months, FIVE weeks (the
// ISO weeks covering thirty days, not twelve), seven days. A fixture with a
// nicer count than production is how this app has repeatedly shipped charts
// that were wrong only against the real payload.
const RHYTHM: ActivityRhythm = {
  season: {
    label: '2026', km: 2312.5, rides: 62, hours: 85.1, elevation_m: 24860,
    buckets: Array.from({ length: 12 }, (_, i) =>
      bucket(`2026-${String(i + 1).padStart(2, '0')}-01`, i === 6 ? 420 : 120 + i * 10)),
  },
  month: {
    label: 'Letzte 30 Tage', km: 268.4, rides: 7, hours: 11.2, elevation_m: 3140,
    buckets: [
      bucket('2026-08-03', 40), bucket('2026-08-10', 92),
      bucket('2026-08-17', 0, 0), bucket('2026-08-24', 76), bucket('2026-08-31', 60.4),
    ],
  },
  week: {
    label: 'Letzte 7 Tage', km: 96.2, rides: 2, hours: 4.1, elevation_m: 780,
    buckets: [
      bucket('2026-08-26', 0, 0), bucket('2026-08-27', 41.1), bucket('2026-08-28', 0, 0),
      bucket('2026-08-29', 0, 0), bucket('2026-08-30', 55.1), bucket('2026-08-31', 0, 0),
      bucket('2026-09-01', 0, 0),
    ],
  },
}

const VM = {
  totalKm: '4.812', totalUnit: 'km', progress: 0.63, ofGoalPct: '63 %',
  goalChip: 'VON 7.500 KM', toGoLabel: 'noch 2.688 km', paceLabel: '+4 %', paceAhead: true,
  bars: Array.from({ length: 12 }, () => 0.5),
  barMonths: Array.from({ length: 12 }, (_, i) => ({ km: 100, label: 'Jan', year: 2026 + i * 0 })),
  barsAccentFrom: 9,
  stats: [
    { label: 'Ø TEMPO', value: '28,4', unit: 'km/h' },
    { label: 'Ø LEISTUNG', value: '214', unit: 'W' },
    { label: 'SATTELZEIT', value: '170', unit: 'h' },
  ] as [never, never, never],
  expand: 1,
}

const draw = (rhythm: ActivityRhythm | null = RHYTHM) =>
  render(<W3RidesDock vm={{ ...VM, rhythm } as never} />)

const tabs = () => screen.getAllByRole('tab').map((t) => t.textContent)
const bars = () => screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') !== null)

describe('the switch appears only when it has something to switch to', () => {
  it('is absent while the three windows are still loading', () => {
    draw(null)
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
  })

  it('keeps the season behaviour in the meantime rather than blanking', () => {
    draw(null)
    expect(screen.getByText('4.812')).toBeTruthy()
    expect(screen.getByText('63 %')).toBeTruthy()
  })

  it('offers all three once they arrive', () => {
    draw()
    expect(tabs()).toEqual(['SAISON', 'MONAT', 'WOCHE'])
  })
})

describe('the selected window owns the whole panel', () => {
  it('opens on the season', () => {
    draw()
    expect(screen.getByRole('tab', { name: 'SAISON' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('2.313')).toBeTruthy()
    expect(bars()).toHaveLength(12)
  })

  it('RE-VALUES THE HEADLINE, not just the chart', () => {
    draw()
    fireEvent.click(screen.getByRole('tab', { name: 'WOCHE' }))
    expect(screen.getByText('96')).toBeTruthy()
    expect(screen.queryByText('2.313')).toBeNull()
  })

  it('RE-VALUES THE KPI TILES — the bug the switch would otherwise create', () => {
    // A week's headline with the year's averages underneath is the lie.
    draw()
    fireEvent.click(screen.getByRole('tab', { name: 'WOCHE' }))
    expect(screen.getByText('2')).toBeTruthy()       // rides that week
    expect(screen.getByText('4,1')).toBeTruthy()     // hours that week
    expect(screen.getByText('780')).toBeTruthy()     // elevation that week
    expect(screen.queryByText('28,4')).toBeNull()    // the season's Ø Tempo is gone
  })

  it('draws the server\'s own bucket count, never a hard-coded one', () => {
    // FIVE weeks for a thirty-day window, not twelve. Hard-coding would drop
    // the sixth on a Monday, when the window opens mid-week.
    draw()
    fireEvent.click(screen.getByRole('tab', { name: 'MONAT' }))
    expect(bars()).toHaveLength(5)
    expect(screen.getByText('5 WOCHEN')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'WOCHE' }))
    expect(bars()).toHaveLength(7)
  })

  it('prints the server\'s label rather than composing one', () => {
    // "Letzte 30 Tage", never "September" — the 30-day figure is not
    // September's, and naming it so would misstate what the number is.
    draw()
    fireEvent.click(screen.getByRole('tab', { name: 'MONAT' }))
    expect(screen.getByText('LETZTE 30 TAGE')).toBeTruthy()
  })
})

describe('the meter is always named by the chip beside it', () => {
  it('is the goal on the season', () => {
    draw()
    expect(screen.getByText('VON 7.500 KM')).toBeTruthy()
    expect(screen.getByText('63 %')).toBeTruthy()
  })

  it('is the ridden share elsewhere, and says so', () => {
    draw()
    fireEvent.click(screen.getByRole('tab', { name: 'WOCHE' }))
    expect(screen.getByText('2/7')).toBeTruthy()   // two days ridden of seven
    expect(screen.queryByText('63 %')).toBeNull()
  })
})

describe('tapping a bar', () => {
  it('hands it the headline', () => {
    draw()
    fireEvent.click(screen.getByRole('tab', { name: 'WOCHE' }))
    fireEvent.click(bars()[1])                       // 27 Aug, 41.1 km
    expect(screen.getByText('41')).toBeTruthy()
  })

  it('lets go on a second tap', () => {
    draw()
    fireEvent.click(screen.getByRole('tab', { name: 'WOCHE' }))
    fireEvent.click(bars()[1])
    expect(bars()[1].getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(bars()[1])
    expect(bars()[1].getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('96')).toBeTruthy()
  })

  it('DROPS THE SELECTION WHEN THE GRAIN CHANGES', () => {
    // Bar 3 is a different period in each window; carrying the index across
    // would silently re-point the headline at something else.
    draw()
    fireEvent.click(screen.getByRole('tab', { name: 'WOCHE' }))
    fireEvent.click(bars()[1])
    fireEvent.click(screen.getByRole('tab', { name: 'MONAT' }))
    expect(bars().every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(screen.getByText('268')).toBeTruthy()
  })
})
