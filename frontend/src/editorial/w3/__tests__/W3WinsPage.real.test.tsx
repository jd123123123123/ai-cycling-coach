import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import ach from './fixtures/realAchievements.json'
import curve from './fixtures/realPowerCurve.json'
import ftp from './fixtures/realFtpHistory.json'

/**
 * ERFOLGE, AGAINST THE ACCOUNT'S OWN PAYLOAD.
 *
 * The three JSON files beside this test were pulled from production, not
 * written. That is the whole point: every previous defect on this screen
 * survived a green suite because the fixtures described a server that does not
 * exist — a 12-minute power duration the payload has no point for, an "8:15 h"
 * the formatter cannot emit, a consistency sentence the page stopped
 * composing. A harness that invents a nicer shape than production is how this
 * page shipped with three of six power bars and looked complete.
 *
 * This account is also usefully AWKWARD, which a hand-written fixture never
 * is: one FTP measurement (so that chapter cannot draw), no previous season
 * (so the year comparison must not be offered), and 12 of 15 badges earned.
 */

vi.mock('../../../hooks/useAchievements', () => ({
  useAchievements: () => ({ data: ach, isLoading: false, isError: false, refetch: vi.fn(), isFetching: false }),
}))
vi.mock('../../../hooks/usePowerProfileView', () => ({
  usePowerProfileView: () => ({ data: curve, isLoading: false }),
}))
vi.mock('../../../hooks/useFtpHistory', () => ({
  useFtpHistory: () => ({ data: ftp, isLoading: false }),
}))
// The room is not under test; the page renders standalone when there is no
// shell to portal into, which `useHeroPanel` already supports.
vi.mock('../W3HeroShell', () => ({ useHeroPanel: () => ({ inShell: false, portal: null }) }))
// The challenges door fetches its live counts; this suite renders without a
// QueryClientProvider, so the hook is stubbed to "not yet resolved".
vi.mock('../../../hooks/useRewardChallenges', () => ({
  useRewardChallenges: () => ({ data: undefined }),
}))

// This suite verifies the performance chapter; the collection and shell have
// separate interaction coverage and must not issue account queries here.
vi.mock('../W3TopBar', () => ({default: () => null}))
vi.mock('../W3TabBar', () => ({default: () => null}))
vi.mock('../W3SceneCollection', () => ({default: () => <div>Sammlung</div>}))

const { default: W3WinsPage } = await import('../W3WinsPage')

afterEach(cleanup)

const draw = () => {
 const result=render(<MemoryRouter><W3WinsPage /></MemoryRouter>)
 fireEvent.click(screen.getByRole('button',{name:'Leistung & Abzeichen'}))
 return result
}

describe('the page draws real content for a real account', () => {
  it('IS NOT BLANK', () => {
    // The failure this test exists for: a screen that resolves to nothing but
    // its dock, which reads to a rider as a black page under the panel.
    const { container } = draw()
    expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(200)
  })

  it('never tells a rider with 62 rides that they have never ridden', () => {
    draw()
    expect(screen.queryByText(/Deine erste gewertete Fahrt füllt diese Seite/)).toBeNull()
  })

  it('draws every chapter this account has the data for', () => {
    draw()
    expect(screen.getByText('DEIN RHYTHMUS')).toBeTruthy()
    expect(screen.getByText('KONSTANZ · LETZTE 52 WOCHEN')).toBeTruthy()
    expect(screen.getByText('BESTWERTE · LEISTUNGSKURVE')).toBeTruthy()
    expect(screen.getByText('MEILENSTEINE')).toBeTruthy()
    expect(screen.getByText('AUSZEICHNUNGEN')).toBeTruthy()
    expect(screen.getByText('DEIN GRÖSSTER TAG')).toBeTruthy()
  })

  it('omits the threshold chapter, because one measurement is not a change', () => {
    // This account has exactly one FTP reading. A "your threshold moved" card
    // needs two, and inventing a trend from one point is the defect.
    expect(ftp.history).toHaveLength(1)
    draw()
    expect(screen.queryByText('SCHWELLENLEISTUNG')).toBeNull()
  })
})

describe('the power curve, which shipped missing half its rows', () => {
  it('draws ALL SIX server durations, not the four the page used to hard-code', () => {
    draw()
    for (const label of ['5 s', '15 s', '1 Min', '5 Min', '20 Min', '60 Min']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it('asks for no duration the server does not send', () => {
    // 720 s was hard-coded here and has never existed in the payload.
    const seconds = curve.curve.map((c) => c.seconds)
    expect(seconds).not.toContain(720)
    expect(screen.queryByText('12 Min')).toBeNull()
  })
})

describe('the season grain is not offered to a first-season rider', () => {
  it('has no previous year in the payload', () => {
    expect(ach.rhythm.season).toBeNull()
  })

  it('so the switch shows only the two grains it can actually draw', () => {
    draw()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['MONAT', 'WOCHE'])
  })
})

describe('the payload carries what this screen now reads', () => {
  it('has all three rhythm grains', () => {
    expect(ach.rhythm.months).toHaveLength(12)
    expect(ach.rhythm.days).toHaveLength(14)
    expect(ach.consistency.weeks).toHaveLength(52)
  })

  it('carries the badge detail the cabinet opens onto', () => {
    expect(ach.unlocked.every((u) => typeof u.detail === 'string')).toBe(true)
    expect(ach.in_progress.every((p) => typeof p.detail === 'string')).toBe(true)
  })
})
