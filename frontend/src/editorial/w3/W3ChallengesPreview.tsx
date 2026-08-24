import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import W3ChallengesView from './W3ChallengesView'
import W3ChallengeBoard from './W3ChallengeBoard'
import type { RewardChallenge } from '../../api/rewardChallenges'
import './w3.css'

/**
 * TEMP preview — /e/w3-challenges-preview, unguarded and backend-free.
 *
 * Renders the REAL screen (`W3ChallengesView`) against fixtures, which is the
 * whole reason the view was split out of the page: a preview that rebuilt the
 * layout beside it would be a second design to keep in sync, and it is always
 * the one that rots.
 *
 * The fixture is chosen to exercise the states that are hard to wait for: a
 * month with an interesting SHAPE rather than a flat one, a challenge already
 * finished and paid, a custom challenge (no board — nobody else is in it), and
 * a catalogue entry nobody has joined yet next to one 63 riders are in.
 */

const c = (o: Partial<RewardChallenge> & { key: string; title: string }): RewardChallenge => ({
  detail: '', metric: 'distance_km', target: 100, tier: 'silver', reward_rc: 500,
  value: 0, pct: 0, enrolled: true, completed: false, awarded_rc: null, ...o,
})

// A quiet start, a big weekend, a steady middle, two days off. A flat fixture
// would prove nothing about the strip.
const AUGUST = [
  0, 42, 0, 0, 88, 130, 0, 55, 61, 0, 0, 74, 0, 96,
  120, 44, 0, 58, 63, 0, 71, 210, 180, 0, 0, 66, 72, 80, 0, 48, 0,
]

const ACTIVE: RewardChallenge[] = [
  c({ key: 'distance_600', title: '600 km im Monat', metric: 'distance_km',
      target: 600, value: 412, pct: 69, participants: 63,
      detail: '600 Kilometer, bevor der Monat um ist.' }),
  c({ key: 'show_up_20', title: '20× auftauchen', metric: 'active_days',
      target: 20, value: 14, pct: 70, tier: 'silver', participants: 128 }),
  c({ key: 'custom:7', title: 'Jeden Dienstag Berge', metric: 'rides',
      target: 4, value: 4, pct: 100, tier: 'bronze', reward_rc: 300,
      completed: true, awarded_rc: 300, custom: true }),
]

const AVAILABLE: RewardChallenge[] = [
  c({ key: 'burn_25k', title: '25.000 kJ verbrennen', metric: 'kj', target: 25000,
      tier: 'gold', reward_rc: 800, enrolled: false, participants: 21,
      detail: '25.000 Kilojoule Arbeit. Das belohnt harte Fahrten, nicht nur lange.' }),
  c({ key: 'first_month', title: 'Erster Monat', metric: 'rides', target: 8,
      tier: 'bronze', reward_rc: 300, enrolled: false, participants: 0,
      detail: 'Acht Fahrten. Der Einstieg, nicht die Prüfung — und er zählt trotzdem.' }),
]

// A board with a rider who FELL OFF IT — the state that matters, because a
// leaderboard that only ever shows the top is a wall.
const BOARD = {
  key: 'distance_600', period: '2026-08', participants: 63, truncated: true,
  you: { user_id: 9, handle: '@jannis', avatar_url: null, value: 412, pct: 69, completed: false, rank: 27 },
  rows: [
    { user_id: 1, handle: '@marta.k', avatar_url: null, value: 921, pct: 100, completed: true, rank: 1 },
    { user_id: 2, handle: '@tobi', avatar_url: null, value: 874, pct: 100, completed: true, rank: 2 },
    { user_id: 3, handle: '@lena.rides', avatar_url: null, value: 690, pct: 100, completed: true, rank: 3 },
    { user_id: 4, handle: '@sven', avatar_url: null, value: 588, pct: 98, completed: false, rank: 4 },
    { user_id: 5, handle: '@nora', avatar_url: null, value: 540, pct: 90, completed: false, rank: 5 },
  ],
}

export default function W3ChallengesPreview() {
  const [joining, setJoining] = useState<string | null>(null)
  const [board, setBoard] = useState<{ key: string; title: string; unit: string } | null>(null)
  const qc = useQueryClient()

  return (
    <>
    <W3ChallengesView
      period="2026-08"
      active={ACTIVE}
      available={AVAILABLE}
      loading={false}
      leadDays={AUGUST}
      earned={300}
      joining={joining}
      sharing={false}
      onBack={() => {}}
      onJoin={(k) => { setJoining(k); setTimeout(() => setJoining(null), 900) }}
      onBoard={(b) => {
        // Seed the cache so the REAL board component renders without a server.
        qc.setQueryData(['challenges', 'board', b.key], BOARD)
        setBoard(b)
      }}
      onCreate={() => {}}
      onShare={() => {}} />

    {board && (
      <W3ChallengeBoard challengeKey={board.key} title={board.title}
        unit={board.unit} onClose={() => setBoard(null)} />
    )}
    </>
  )
}
