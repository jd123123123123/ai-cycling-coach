// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import W3RidesView, { type W3RideCard, type W3RidesVm } from '../W3RidesView'

/**
 * DER ZEITRAUM MUSS DIE LISTE SCHNEIDEN.
 *
 * Saison / Monat / Woche sass als lokaler Zustand im Kopf, und die Liste
 * darunter -- ein Geschwister -- konnte ihn nicht sehen. Wer auf WOCHE stellte,
 * bekam eine Wochenzahl ueber allen Fahrten des Jahres. Diese Datei haelt fest,
 * dass beide denselben Ausschnitt zeigen.
 */

vi.mock('../W3HeroShell', () => ({ useHeroPanel: (dock: React.ReactNode) => ({ inShell: false, portal: dock }) }))
vi.mock('../W3StatusBar', () => ({ default: () => null }))
vi.mock('../W3TabBar', () => ({ default: () => null }))
vi.mock('../W3TopBar', () => ({ default: ({ title }: { title: string }) => <header>{title}</header> }))
vi.mock('../../../hooks/useAthleteProfile', () => ({ useAthleteProfile: () => ({ data: null }) }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: () => {} }) }))
vi.mock('motion/react', () => ({
  useReducedMotion: () => true,
  motion: { div: ({ children, ...rest }: { children?: React.ReactNode; [k: string]: unknown }) => {
    const p = { ...rest }; for (const k of ['initial','animate','exit','transition','whileTap']) delete p[k]
    return <div {...p}>{children}</div> } },
}))

/** Der Server nennt die Fenster; der Test nennt sie genauso. */
const grain = (label: string, start: string) => ({
  label, km: 100, rides: 1, hours: 4, elevation_m: 900,
  buckets: [{ start, km: 100, rides: 1, hours: 4, elevation_m: 900 }],
})
vi.mock('../../../hooks/useActivityRhythm', () => ({
  useActivityRhythm: () => ({ data: {
    season: grain('2026', '2026-01-01'),
    month:  grain('Letzte 30 Tage', '2026-08-18'),
    week:   grain('Letzte 7 Tage', '2026-09-10'),
  } }),
}))

const ride = (id: number, title: string, dateISO: string, dateLabel: string): W3RideCard => ({
  id, title, dateLabel, dateISO, km: '40.3', speed: '30.1', power: '210', dur: '1:20',
  note: null, indoor: false, race: false, recent: false, polyline: null,
})

// Eine Fahrt je Fenster: gestern, letzten Monat, im Fruehjahr.
const RIDES = [
  ride(1, 'Fahrt diese Woche', '2026-09-15T16:00:00Z', 'MO 15 SEP'),
  ride(2, 'Fahrt letzten Monat', '2026-08-20T16:00:00Z', 'MI 20 AUG'),
  ride(3, 'Fahrt im Fruehjahr', '2026-04-03T16:00:00Z', 'FR 03 APR'),
]
const VM = {
  totalKm: '2.312', count: '3 Fahrten', saddleTime: '85', avgSpeed: '27.2', avgPower: '198',
  barMonths: [{ km: 100, label: 'Sep', year: 2026 }], rides: RIDES, goal: null, prAnnounce: null,
} as unknown as W3RidesVm

const view = () => render(<MemoryRouter><W3RidesView vm={VM} /></MemoryRouter>)
afterEach(cleanup)

describe('Fahrten: der Zeitraum schneidet die Liste', () => {
  it('zeigt in der Saison alle drei Fahrten', () => {
    view()
    expect(screen.getByText('Fahrt diese Woche')).toBeTruthy()
    expect(screen.getByText('Fahrt letzten Monat')).toBeTruthy()
    expect(screen.getByText('Fahrt im Fruehjahr')).toBeTruthy()
  })

  it('laesst auf WOCHE nur die Fahrt aus dem Wochenfenster stehen', () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Woche' }))
    expect(screen.getByText('Fahrt diese Woche')).toBeTruthy()
    expect(screen.queryByText('Fahrt letzten Monat')).toBeNull()
    expect(screen.queryByText('Fahrt im Fruehjahr')).toBeNull()
  })

  it('laesst auf MONAT das Fruehjahr weg, die letzten dreissig Tage aber stehen', () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Monat' }))
    expect(screen.getByText('Fahrt diese Woche')).toBeTruthy()
    expect(screen.getByText('Fahrt letzten Monat')).toBeTruthy()
    expect(screen.queryByText('Fahrt im Fruehjahr')).toBeNull()
  })

  it('nennt in der Ueberschrift das Fenster des Servers und zaehlt, was dasteht', () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Woche' }))
    expect(screen.getByText('1 Fahrt · Letzte 7 Tage')).toBeTruthy()
  })
})
