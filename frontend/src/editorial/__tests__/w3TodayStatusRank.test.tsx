// frontend/src/editorial/__tests__/w3TodayStatusRank.test.tsx
//
// "Dein aktueller Status" + "Dein Rang" — the two lower Today sections.
//
// The honesty contract these guard:
//  · a CTL number is never shown without what it MEANS, and that meaning is
//    derived from the rider's own series — a peak is only called a peak when
//    the series says so, and the window it is bounded by is named;
//  · a falling curve inside a recovery block is named as the plan working,
//    never celebrated and never scolded;
//  · crew points are each rider's share of THEIR OWN target — the card says so
//    and converts the gap back into the rider's own TSS;
//  · no crew → an honest empty state, NEVER the old fixture riders.
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import W3TodayStatus from '../w3/W3TodayStatus'
import W3TodayRank from '../w3/W3TodayRank'

const pmcMock = vi.fn()
const weekMock = vi.fn()
const trajMock = vi.fn()
const crewMock = vi.fn()
const standingsMock = vi.fn()

vi.mock('../../hooks/usePMC', () => ({ usePMC: () => pmcMock() }))
vi.mock('../../hooks/useCurrentWeek', () => ({ useCurrentWeek: () => weekMock() }))
vi.mock('../../hooks/useGoalTrajectory', () => ({ useGoalTrajectory: () => trajMock() }))
vi.mock('../../hooks/useCrew', () => ({
  useMyCrew: () => crewMock(),
  useCrewStandings: () => standingsMock(),
}))

afterEach(cleanup)
beforeEach(() => {
  pmcMock.mockReturnValue({ data: undefined })
  weekMock.mockReturnValue({ data: undefined })
  trajMock.mockReturnValue({ data: undefined })
  crewMock.mockReturnValue({ data: undefined })
  standingsMock.mockReturnValue({ data: undefined })
})

const iso = (daysAgo: number) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A dense daily PMC series, newest last, built from a CTL shape. */
const pmcOf = (ctls: number[], atl = (c: number) => c + 4) =>
  ctls.map((c, i) => ({
    date: iso(ctls.length - 1 - i),
    ctl: c,
    atl: atl(c),
    tsb: c - atl(c),
    tss: null,
    daily_tss: null,
  }))

const renderIn = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('Dein aktueller Status', () => {
  it('renders an honest empty card — not a shape — with no PMC on the wire', () => {
    renderIn(<W3TodayStatus />)
    expect(screen.getByText('Dein aktueller Status')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('calls a real peak a peak, and names the window it is bounded by', () => {
    const ctls = Array.from({ length: 40 }, (_, i) => 30 + i) // strictly rising
    pmcMock.mockReturnValue({ data: { entries: pmcOf(ctls) } })
    renderIn(<W3TodayStatus />)
    // CTL now — the headline number and the chart readout agree on it.
    expect(screen.getAllByText('69').length).toBeGreaterThan(0)
    expect(screen.getByText('BESTWERT')).toBeTruthy()
    expect(screen.getByText(/Höchster Fitnessstand der letzten 40 Tage/)).toBeTruthy()
  })

  it('withholds the BESTWERT badge from a rider with no real history behind it', () => {
    // 90 stored days, but only 20 of them carry any training: this rider is at
    // their "90-day high" every morning by construction, so the badge would be
    // free dopamine. The 4-week move is shown instead.
    const ctls = [...Array.from({ length: 70 }, () => 0), ...Array.from({ length: 20 }, (_, i) => 1 + i)]
    pmcMock.mockReturnValue({ data: { entries: pmcOf(ctls) } })
    renderIn(<W3TodayStatus />)
    expect(screen.queryByText('BESTWERT')).toBeNull()
    expect(screen.queryByText(/Höchster Fitnessstand/)).toBeNull()
    expect(screen.getByText(/CTL in vier Wochen/)).toBeTruthy()
  })

  it('does NOT call it a peak when the rider is below their own best', () => {
    // Rose to 70, then fell away — today is not the best day in the window.
    const ctls = [...Array.from({ length: 30 }, (_, i) => 40 + i), ...Array.from({ length: 10 }, (_, i) => 69 - i * 3)]
    pmcMock.mockReturnValue({ data: { entries: pmcOf(ctls) } })
    renderIn(<W3TodayStatus />)
    expect(screen.queryByText('BESTWERT')).toBeNull()
  })

  it('frames a falling curve in a recovery week as the plan working', () => {
    const ctls = [...Array.from({ length: 30 }, () => 70), ...Array.from({ length: 10 }, (_, i) => 70 - i)]
    pmcMock.mockReturnValue({ data: { entries: pmcOf(ctls) } })
    weekMock.mockReturnValue({ data: { meso_block: { block_position: 'recovery', progression: null } } })
    renderIn(<W3TodayStatus />)
    expect(screen.getByText(/Entlastungswoche/)).toBeTruthy()
  })

  it('shows the server projection with its real required-vs-actual weekly TSS', () => {
    pmcMock.mockReturnValue({ data: { entries: pmcOf(Array.from({ length: 40 }, () => 60)) } })
    trajMock.mockReturnValue({
      data: {
        days_to_goal: 63, ctl_now: 60, ctl_7d_delta: 1, ctl_projected_at_goal: 78,
        ctl_target: 80, tsb_projected_at_goal: 5, taper_window: 'ideal', on_track: 'on_track',
        weekly_tss_required: 520, weekly_tss_actual: 430, narrative_hook: '',
        projection_basis: 'plan_simulation', event_name: 'Harz Extrem', event_date: null,
        event_type: null, target_priority: 'A',
      },
    })
    renderIn(<W3TodayStatus />)
    expect(screen.getByText('Harz Extrem')).toBeTruthy()
    expect(screen.getByText('AUF KURS')).toBeTruthy()
    expect(screen.getByText('in 9 Wochen')).toBeTruthy()
    expect(screen.getByText(/520 TSS pro Woche — aktuell fährst du 430/)).toBeTruthy()
  })

  it('omits the projection entirely when the backend says it cannot project', () => {
    pmcMock.mockReturnValue({ data: { entries: pmcOf(Array.from({ length: 40 }, () => 60)) } })
    trajMock.mockReturnValue({
      data: {
        days_to_goal: 63, ctl_now: 60, ctl_7d_delta: null, ctl_projected_at_goal: 78,
        ctl_target: null, tsb_projected_at_goal: null, taper_window: 'unknown', on_track: 'unknown',
        weekly_tss_required: null, weekly_tss_actual: null, narrative_hook: '',
        projection_basis: 'insufficient_data', event_name: 'Harz Extrem', event_date: null,
        event_type: null, target_priority: null,
      },
    })
    renderIn(<W3TodayStatus />)
    expect(screen.queryByText('Harz Extrem')).toBeNull()
  })
})

describe('Dein Rang', () => {
  const row = (over: Partial<Record<string, unknown>>) => ({
    user_id: 1, handle: 'rider', is_you: false, weekly_score: 300, weekly_tss: 300,
    daily_pct: [0, 100, 0, 120, 0, 80, 0], distance_km: 120, wkg: 3.4, vo2max: 52,
    weekly_target_tss: 420, daily_target_tss: 60, ...over,
  })

  it('shows the honest empty state — and none of the old fixture riders', () => {
    renderIn(<W3TodayRank />)
    expect(screen.getByText('Dein Rang')).toBeTruthy()
    expect(screen.getByText('Noch keine Crew')).toBeTruthy()
    expect(screen.queryByText('Mara')).toBeNull()
    expect(screen.queryByText('Timo')).toBeNull()
    expect(screen.queryByText(/UM DIE WELT/)).toBeNull()
  })

  it('converts the gap to the rider ahead into the rider’s OWN TSS', () => {
    standingsMock.mockReturnValue({
      data: {
        crew_id: 1, week_start: iso(3), week_end: iso(-3),
        daily_target_tss: 60, weekly_target_tss: 420, points_basis: 'own_weekly_target',
        standings: [
          row({ user_id: 2, handle: 'timo', weekly_score: 500 }),
          row({ user_id: 1, handle: 'du', is_you: true, weekly_score: 350, weekly_tss: 210, daily_target_tss: 60, weekly_target_tss: 420 }),
        ],
      },
    })
    renderIn(<W3TodayRank />)
    expect(screen.getByText('#2')).toBeTruthy()
    // 150 points ÷ 100 × the rider's OWN 60 TSS daily target = 90 TSS.
    expect(screen.getByText(/Noch 150 Punkte auf @timo — für dich 90 TSS\./)).toBeTruthy()
    expect(screen.getByText('210 / 420 TSS')).toBeTruthy()
  })

  it('states the scoring basis so a stronger rider does not look automatically better', () => {
    standingsMock.mockReturnValue({
      data: {
        crew_id: 1, week_start: iso(3), week_end: iso(-3),
        daily_target_tss: 60, weekly_target_tss: 420, points_basis: 'own_weekly_target',
        standings: [row({ user_id: 1, handle: 'du', is_you: true, weekly_score: 700 })],
      },
    })
    renderIn(<W3TodayRank />)
    expect(screen.getByText(/dein Anteil an deinem EIGENEN Tagesziel \(60 TSS\)/)).toBeTruthy()
    expect(screen.getByText(/mehr Stunden allein bringen niemanden nach vorn/)).toBeTruthy()
  })
})
