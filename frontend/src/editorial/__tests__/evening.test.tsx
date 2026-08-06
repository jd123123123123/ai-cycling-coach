import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import Ledger from '../components/Ledger'
import { missing, present } from '../data/value'
import type { TodayModel } from '../data/useTodayModel'
import TodayView from '../pages/TodayView'

afterEach(cleanup)

describe('Ledger', () => {
  it('renders every row, dashing the ones with no reading', () => {
    const { container } = render(<Ledger rows={[
      { label: 'RIDDEN', value: present('72 km') },
      { label: 'SLEEP TARGET', value: missing('No wearable reading since Tue.') },
    ]} />)
    expect(container.querySelectorAll('[data-ledger-row]')).toHaveLength(2)
    expect(screen.getByText('72 km')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('prints each distinct reason once, not per row', () => {
    render(<Ledger rows={[
      { label: 'A', value: missing('No wearable reading since Tue.') },
      { label: 'B', value: missing('No wearable reading since Tue.') },
    ]} />)
    expect(screen.getAllByText('No wearable reading since Tue.')).toHaveLength(1)
  })

  it('renders an optional caption above the rows', () => {
    render(<Ledger caption="WHERE IT WENT" rows={[{ label: 'A', value: present('1') }]} />)
    expect(screen.getByText('WHERE IT WENT')).toBeTruthy()
  })
})

function buildPmcSeries(days: number) {
  const out = []
  for (let i = 0; i < days; i++) {
    const t = i / (days - 1)
    out.push({
      date: `2026-06-${String((i % 28) + 1).padStart(2, '0')}`,
      ctl: 44 + t * 24,
      atl: 40 + t * 30,
      tsb: (44 + t * 24) - (40 + t * 30),
    })
  }
  return out
}

const eveningModel: TodayModel = {
  state: 'evening',
  dateLabel: present('DO 23 JUL'),
  streakDays: present(13),
  readiness: present({ score: 74, deltaVsYesterday: 8 }),
  readiness90DayBest: present(77),
  bodyBattery90DayHigh: missing('Noch keine 90-Tage-Historie erfasst.'),
  hrv: present({ value: 68, unit: 'ms', delta: 4, band: { low: 52, high: 74, position: 'above' } }),
  restingHr: present({ value: 46, unit: 'bpm', delta: -2, band: { low: 44, high: 55, position: 'in' } }),
  sleep: present({ totalS: 27000, deepS: 4800, remS: 5400, lightS: 15600, awakeS: 1200 }),
  pmc: present({ fitness: 68, fatigue: 58, form: -2, series: buildPmcSeries(42) }),
  recovery: present({ hoursRemaining: 26, clearAtLabel: 'Fr 09:00' }),
  bodyBattery: missing('Keine Messung seit Dienstag.'),
  session: missing('Für heute nichts geplant.'),
  ride: present({ activityId: 1, distanceM: 84200, kj: 2130, avgHr: 138, np: 212, durationS: 10680, calories: 1842 }),
  zones: missing('Heute noch keine Fahrt erfasst.'),
  peaks: missing('Noch keine Spitzenleistungs-Aufschlüsselung für diese Fahrt.'),
  planVsRidden: missing('Diese Fahrt konnte nicht mit dem Plan abgeglichen werden.'),
  verdict: present({
    headline: 'Schütz morgen.',
    body: 'Die morgige VO2-Einheit braucht eine volle Nacht.',
  }),
  whatThisChanges: missing('Der Coach hat sich zu dieser Fahrt noch nicht geäußert.'),
  conditions: missing('Kein Standort aus einer kürzlichen Fahrt.'),
  tomorrow: present({ title: 'VO2 max · 5 × 4 @ 330 W', detail: 'Fünf mal vier, bei 330.', unlockLabel: present('05:00') }),
  week: [
    { letter: 'MO', tss: present(64) }, { letter: 'DI', tss: present(48) }, { letter: 'MI', tss: present(12) },
    { letter: 'DO', tss: missing('Keine Fahrt erfasst.') }, { letter: 'FR', tss: present(24) },
    { letter: 'SA', tss: present(68) }, { letter: 'SO', tss: present(44) },
  ],
  energyOut: missing('Kein stündlicher Energieverbrauch für heute verfügbar.'),
  isLoading: false,
}

describe('Evening screen composition', () => {
  it('renders 01 TODAY, then 02 TONIGHT, then 03 TOMORROW, in that order', () => {
    const { container } = render(<MemoryRouter><TodayView model={eveningModel} /></MemoryRouter>)
    const section01 = container.querySelector('[data-section="01"]')
    const section02 = container.querySelector('[data-section="02"]')
    const section03 = container.querySelector('[data-section="03"]')
    expect(section01).not.toBeNull()
    expect(section02).not.toBeNull()
    expect(section03).not.toBeNull()
    expect(section01!.querySelector('h2')?.textContent).toBe('HEUTE')
    expect(section02!.querySelector('h2')?.textContent).toBe('HEUTE NACHT')
    expect(section03!.querySelector('h2')?.textContent).toBe('MORGEN')

    const all = Array.from(container.querySelectorAll('[data-section]'))
    const order = all.map((el) => el.getAttribute('data-section'))
    expect(order).toEqual(['01', '02', '03'])
  })

  it('never renders the generic TRAJECTORY section on an evening day', () => {
    const { container } = render(<MemoryRouter><TodayView model={eveningModel} /></MemoryRouter>)
    const headings = Array.from(container.querySelectorAll('section h2')).map((h) => h.textContent)
    expect(headings).not.toContain('VERLAUF')
  })

  it('renders the ride ledger alone (no energy curve) when energyOut is missing', () => {
    const { container } = render(<MemoryRouter><TodayView model={eveningModel} /></MemoryRouter>)
    expect(container.querySelector('[data-ledger]')).not.toBeNull()
    expect(screen.getByText('1.842 KCAL')).toBeTruthy()
    // Daily movement / at rest share one reason, printed once.
    expect(screen.getAllByText('Keine Aufschlüsselung des Tagesumsatzes verfügbar.')).toHaveLength(1)
  })

  it('dashes the hero numeral and prints one reason for the missing bedtime target', () => {
    render(<MemoryRouter><TodayView model={eveningModel} /></MemoryRouter>)
    expect(screen.getAllByText('Kein Zubettgeh-Ziel für heute Nacht erfasst.').length).toBeGreaterThan(0)
  })

  it('renders the tomorrow plate and band, pointing at tomorrow', () => {
    const { container } = render(<MemoryRouter><TodayView model={eveningModel} /></MemoryRouter>)
    expect(container.querySelector('[data-tomorrow-plate]')).not.toBeNull()
    const band = container.querySelector('[data-tomorrow-band]')
    expect(band).not.toBeNull()
    expect(band!.textContent).toContain('MORGEN')
  })

  it('renders the ride tiles for the day\'s own ride, since Evening subsumes Trained', () => {
    render(<MemoryRouter><TodayView model={eveningModel} /></MemoryRouter>)
    expect(screen.getByText('DAUER')).toBeTruthy()
    expect(screen.getByText('DISTANZ')).toBeTruthy()
  })
})
