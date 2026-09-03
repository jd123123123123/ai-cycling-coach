import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { ChallengeMetric, ChallengeParticipant, CrewChallenge } from '../../../api/challenges'

// The network, replaced. Every assertion below is about what the cut DOES with
// what the server said, never about reaching a server.
const fetchCrewChallenges = vi.fn()
vi.mock('../../../api/challenges', async (orig) => ({
  ...(await orig<typeof import('../../../api/challenges')>()),
  fetchCrewChallenges: () => fetchCrewChallenges(),
}))

// WHO AM I is a second read, and the card's whole colour logic hangs off it.
let meId: number | null = 7
vi.mock('../../../hooks/useAthleteProfile', () => ({
  useAthleteProfile: () => ({ data: meId == null ? undefined : { user_id: meId } }),
}))

// jsdom ships no ResizeObserver; motion touches it on some paths.
if (!('ResizeObserver' in globalThis)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

import W3FeedChallenges from '../W3FeedChallenges'

afterEach(cleanup)
beforeEach(() => {
  meId = 7
  fetchCrewChallenges.mockReset().mockResolvedValue([])
})

const rider = (over: Partial<ChallengeParticipant> = {}): ChallengeParticipant => ({
  user_id: 7, handle: 'jannis', value: 120, reached: false, pct: 24, ...over,
})

/** Ends far enough out that the eyebrow is stable whenever this test runs. */
const endsOn = () => {
  const d = new Date()
  d.setDate(d.getDate() + 6)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const challenge = (over: Partial<CrewChallenge> = {}): CrewChallenge => ({
  id: 1, name: '500 km zusammen', metric: 'distance_km', target: 500,
  period: 'week', starts_on: '2026-09-01', ends_on: endsOn(),
  creator_handle: 'luca', created_at: '2026-09-01T08:00:00Z',
  participants: [rider()],
  ...over,
})

const wrap = (ui: ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('the unit is the metric’s own', () => {
  // Every member of ChallengeMetric, and the unit a German rider says for it.
  const cases: [ChallengeMetric, number, string][] = [
    ['tss', 300, 'Ziel: 300 TSS'],
    ['distance_km', 500, 'Ziel: 500 km'],
    ['active_days', 5, 'Ziel: 5 Tage'],
    ['hours', 10, 'Ziel: 10 Stunden'],
    ['kj', 20000, 'Ziel: 20.000 kJ'],
    ['rides', 8, 'Ziel: 8 Fahrten'],
  ]

  for (const [metric, target, expected] of cases) {
    it(`prints the target of a ${metric} challenge as "${expected}"`, async () => {
      fetchCrewChallenges.mockResolvedValue([challenge({ metric, target })])
      wrap(<W3FeedChallenges />)
      expect(await screen.findByText(expected)).toBeTruthy()
    })
  }

  it('says kilometres and hours in tenths, rides and days whole', async () => {
    fetchCrewChallenges.mockResolvedValue([
      challenge({ id: 1, metric: 'distance_km', target: 500, participants: [rider({ value: 82.4 })] }),
      challenge({ id: 2, metric: 'rides', target: 8, participants: [rider({ value: 3 })] }),
    ])
    wrap(<W3FeedChallenges />)
    expect(await screen.findByText('82,4')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })
})

describe('whose figure the card shows', () => {
  it('shows MY progress when I am a participant, with no borrowed-figure label', async () => {
    fetchCrewChallenges.mockResolvedValue([
      challenge({
        participants: [rider({ user_id: 9, handle: 'luca', value: 300 }), rider({ user_id: 7, value: 120 })],
      }),
    ])
    wrap(<W3FeedChallenges />)
    // The hero numeral is mine (120), not the leader's (300).
    expect(await screen.findByText('120')).toBeTruthy()
    expect(screen.queryByText(/Du fährst nicht mit/)).toBeNull()
  })

  it('falls back to the leader when I am not in the challenge, and says so', async () => {
    meId = 999
    fetchCrewChallenges.mockResolvedValue([
      challenge({
        participants: [rider({ user_id: 9, handle: 'luca', value: 300 }), rider({ user_id: 4, handle: 'mara', value: 210 })],
      }),
    ])
    wrap(<W3FeedChallenges />)
    expect(await screen.findByText('Du fährst nicht mit · Führung: luca')).toBeTruthy()
    // The leader's figure, drawn as the leader's — the card never claims it.
    expect(screen.getByText('300')).toBeTruthy()
  })
})

describe('the standings list', () => {
  it('caps at five rows and counts the rest out loud', async () => {
    const many = Array.from({ length: 8 }).map((_, i) =>
      rider({ user_id: 100 + i, handle: `rider${i}`, value: 400 - i * 10 }),
    )
    fetchCrewChallenges.mockResolvedValue([challenge({ participants: many })])
    wrap(<W3FeedChallenges />)

    expect(await screen.findByText('rider0')).toBeTruthy()
    expect(screen.getByText('rider4')).toBeTruthy()
    expect(screen.queryByText('rider5')).toBeNull()
    expect(screen.getByText('+3 weitere')).toBeTruthy()
  })

  it('says nothing about a remainder when everyone fits', async () => {
    fetchCrewChallenges.mockResolvedValue([
      challenge({ participants: [rider({ user_id: 1, handle: 'a' }), rider({ user_id: 2, handle: 'b' })] }),
    ])
    wrap(<W3FeedChallenges />)
    expect(await screen.findByText('a')).toBeTruthy()
    expect(screen.queryByText(/weitere/)).toBeNull()
  })
})

describe('the states before there is a challenge', () => {
  it('renders no button in the empty state when there is nothing to call', async () => {
    fetchCrewChallenges.mockResolvedValue([])
    wrap(<W3FeedChallenges />)
    expect(await screen.findByText('Deine Crew hat gerade keine Challenge.')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offers the create button only when a handler was given, and calls it', async () => {
    const onCreate = vi.fn()
    fetchCrewChallenges.mockResolvedValue([])
    wrap(<W3FeedChallenges onCreate={onCreate} />)
    const btn = await screen.findByRole('button', { name: 'Challenge erstellen' })
    fireEvent.click(btn)
    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it('says the read failed rather than going blank', async () => {
    fetchCrewChallenges.mockRejectedValue(new Error('boom'))
    const { container } = wrap(<W3FeedChallenges />)
    await waitFor(
      () => {
        expect(screen.getByText('Challenges konnten nicht geladen werden.')).toBeTruthy()
      },
      { timeout: 5000 },
    )
    expect(container.textContent).not.toBe('')
  })
})
