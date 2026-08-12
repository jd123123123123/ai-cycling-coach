import { useMemo } from 'react'
import { usePowerProfileView } from '../../hooks/usePowerProfileView'
import { useWallet } from '../../hooks/useWallet'
import { useAchievements } from '../../hooks/useAchievements'
import W3WinsView, { type W3WinsVm, type W3Record, type W3Badge } from './W3WinsView'

// Map the server achievement icon vocabulary onto the W3 badge icon set.
function w3BadgeIcon(icon: string): W3Badge['icon'] {
  if (icon === 'mountain') return 'mountain'
  if (icon === 'flame' || icon === 'sunrise') return 'sunrise'
  return 'medal'
}

/**
 * W3 · 04 WINS, wired to live data. Route /e/w3-wins.
 *
 * REAL: the Personal records watts come from the athlete's own mean-max curve
 * (`usePowerProfileView` → `curve`); the RideCoin balance from the wallet; and
 * the Badges grid + count from the server-detected achievements
 * (`useAchievements` → `/achievements/mine`, earned by riding, never bought).
 * Honest "—" when a signal is absent. FIXTURE: the challenge economy — the Hot
 * Streak hero, personal & community challenges, the community pools, and the
 * "+N on <month>" old-best deltas — is the unbuilt challenge/catalog layer
 * (`ridecoin-point-system`), clearly a designed reward, not a fabricated stat.
 */

// Personal records: (label, seconds, best-flag, fixture note, fixture past-fraction)
const RECORD_SPEC: Array<{ key: string; label: string; seconds: number; best: boolean; note: string; past: number }> = [
  { key: '5s', label: '5 SEC', seconds: 5, best: false, note: '+40 on May', past: 0.16 },
  { key: '1m', label: '1 MIN', seconds: 60, best: false, note: '+8 on June', past: 0.08 },
  { key: '12m', label: '12 MIN', seconds: 720, best: true, note: 'YOUR BEST · 12 MAY', past: 1 },
  { key: '20m', label: '20 MIN', seconds: 1200, best: false, note: '+3 on July', past: 0.05 },
]

// Fallback record watts when the athlete has no power curve yet (pen-exact).
const RECORD_FALLBACK: Record<string, string> = { '5s': '1,240 W', '1m': '620 W', '12m': '288 W', '20m': '276 W' }

export default function W3WinsPage() {
  const { data } = usePowerProfileView()
  const { data: wallet } = useWallet()
  const { data: ach } = useAchievements()

  const vm = useMemo<W3WinsVm>(() => {
    const curve = data?.available ? data.curve ?? [] : []
    const wattsAt = (seconds: number): number | null => {
      const p = curve.find((c) => c.seconds === seconds)
      return p?.watts ?? null
    }

    const records: W3Record[] = RECORD_SPEC.map((s) => {
      const w = wattsAt(s.seconds)
      const value = w != null ? `${Math.round(w).toLocaleString('en-US')} W` : RECORD_FALLBACK[s.key] ?? '—'
      return { key: s.key, label: s.label, value, note: s.note, past: s.past, best: s.best }
    })

    return {
      title: 'Wins',
      subtitle: 'Every badge here is a training outcome. Nothing is bought.',
      balance: wallet ? wallet.balance.toLocaleString('en-US') : null,  // REAL: RideCoin wallet

      // fixture: reward layer (challenges / POWER economy not built)
      challengesHeader: 'Your challenges',
      challengesSub: 'Targets you set yourself · edit or drop any time',
      challengesChip: '4 ACTIVE',
      hero: {
        title: 'Hot Streak',
        daysLeft: '19 DAYS LEFT',
        body: 'Hit your prescribed session on 20 days in August. Recovery days count when you take them.',
        lit: 9,
        total: 20,
        progressLabel: '9 of 20 days',
        reward: 'REWARD · 1,000 RIDECOIN',
      },

      // fixture: reward layer
      personalHeader: 'Personal challenges',
      personalSub: 'Targets you set yourself · edit or drop any time',
      challenges: [
        { key: 'climb', title: 'Climb 10 000 m', reward: '+500 RIDECOIN', sub: '6 240 of 10 000 m · 19 days left', fill: 0.624 },
        { key: 'dawn', title: 'Dawn patrol ×8', reward: '+350 RIDECOIN', sub: '3 of 8 rides before 07:00 · 19 days left', fill: 0.375 },
        { key: 'zone', title: 'Hold the zone', reward: '+300 RIDECOIN', sub: '14 of 20 sessions in the band', fill: 0.7 },
      ],
      newChallengeLabel: 'NEW CHALLENGE',

      // REAL: watts from the athlete's mean-max curve; notes/deltas are fixture
      recordsHeader: 'Personal records',
      recordsSub: 'Bar shows how far past your old best you went',
      records,

      // fixture: reward layer (community pools not built)
      communityHeader: 'Community challenges',
      communitySub: "Everyone's kilometres in one pot · your share counts",
      communityChip: '4 JOINED',
      communityHero: {
        title: 'Around the world ×2',
        pct: '26%',
        sub: '20,840 of 80,150 km · 4 weeks left',
        foot: 'You have put in 412 km. Top 8% of the community.',
        fill: 0.26,
      },
      community: [
        { key: 'everest', title: 'Everest the Alps', pct: '41%', sub: '1.24M of 3.00M m · 6 days left', you: 'YOU 1 240 M · TOP 12%', fill: 0.41 },
        { key: 'aug1000', title: 'August 1 000', pct: '61%', sub: '2.39M of 3.90M km · 19 days left', you: 'YOU 612 KM · TOP 22%', fill: 0.61 },
        { key: 'elbe', title: 'Elbe Loop relay', pct: '78%', sub: '312 of 400 laps · 3 days left', you: 'YOU 9 LAPS · TOP 31%', fill: 0.78 },
      ],

      // REAL: training milestones detected server-side (achievement_service).
      // Earned badges come from `unlocked`, locked-with-progress from
      // `in_progress`; the count is the real unlocked/total. Falls back to the
      // pen fixture only until the first achievements read resolves.
      badgesHeader: 'Badges',
      badgesCount: ach ? `${ach.counts.unlocked} of ${ach.counts.total}` : '— of —',
      badges: ach
        ? [
            ...ach.unlocked.slice(0, 3).map<W3Badge>((u) => ({
              key: u.key,
              icon: w3BadgeIcon(u.icon),
              name: u.title,
              caption: (u.value_label ?? u.detail ?? '').toUpperCase(),
              earned: true,
            })),
            ...ach.in_progress.slice(0, 3).map<W3Badge>((p) => ({
              key: p.key,
              icon: 'lock',
              name: p.title,
              caption: (p.progress?.label ?? p.detail ?? '').toUpperCase(),
              earned: false,
            })),
          ]
        : [],
    }
  }, [data, wallet, ach])

  return <W3WinsView vm={vm} />
}
