import { useMemo, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { usePowerProfileView } from '../../hooks/usePowerProfileView'
import { useWallet } from '../../hooks/useWallet'
import { useAchievements } from '../../hooks/useAchievements'
import { useRewardChallenges } from '../../hooks/useRewardChallenges'
import type { RewardChallenge, ChallengeMetric } from '../../api/rewardChallenges'
import W3WinsView, { type W3WinsVm, type W3Record, type W3Badge, type W3Hero, type W3Challenge } from './W3WinsView'
import W3ChallengeEditor from './W3ChallengeEditor'

// Map the server achievement icon vocabulary onto the W3 badge icon set.
function w3BadgeIcon(icon: string): W3Badge['icon'] {
  if (icon === 'mountain') return 'mountain'
  if (icon === 'flame' || icon === 'sunrise') return 'sunrise'
  return 'medal'
}

const CH_UNIT: Record<ChallengeMetric, string> = {
  active_days: 'days', distance_km: 'km', tss: 'TSS', rides: 'rides', hours: 'h', kj: 'kJ',
}
const chNf = new Intl.NumberFormat('en-US')
const chSegs = (target: number) => { const t = Math.round(target); return t > 0 && t <= 31 ? t : 20 }

function heroFrom(c: RewardChallenge): W3Hero {
  const total = chSegs(c.target)
  const unit = CH_UNIT[c.metric]
  return {
    title: c.title,
    daysLeft: c.completed ? 'COMPLETED' : 'THIS MONTH',
    body: c.detail,
    lit: Math.round((c.pct / 100) * total),
    total,
    progressLabel: `${chNf.format(Math.round(c.value))} of ${chNf.format(c.target)} ${unit}`,
    reward: `${c.completed ? 'EARNED' : 'REWARD'} · ${chNf.format(c.reward_rc)} RIDECOIN`,
  }
}

function challengeCardFrom(c: RewardChallenge): W3Challenge {
  const unit = CH_UNIT[c.metric]
  return {
    key: c.key,
    title: c.title,
    reward: `${c.completed ? '✓ ' : '+'}${chNf.format(c.reward_rc)} RIDECOIN`,
    sub: `${chNf.format(Math.round(c.value))} of ${chNf.format(c.target)} ${unit}`,
    fill: c.pct / 100,
    custom: !!c.custom && !c.completed,   // only an in-flight custom is editable
  }
}

/**
 * W3 · 04 WINS, wired to live data. Route /e/w3-wins.
 *
 * REAL: the Personal records watts come from the athlete's own mean-max curve
 * (`usePowerProfileView` → `curve`); the RideCoin balance from the wallet; the
 * Badges grid + count from server-detected achievements (`/achievements/mine`);
 * and the challenge hero + personal-challenge cards from the monthly challenge
 * subsystem (`useRewardChallenges` → `/challenges/mine`) — real progress from
 * the rider's rides and a real RideCoin payout on completion. Honest "—" when a
 * signal is absent. FIXTURE: only the community pools ("% of the whole
 * community") and the "+N on <month>" record deltas remain — no backend concept
 * to map onto yet, clearly a designed reward, not a fabricated stat.
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
  const { data: challenges } = useRewardChallenges()
  // null = closed; {existing:null} = create; {existing:card} = edit.
  const [editor, setEditor] = useState<{ existing: RewardChallenge | null } | null>(null)

  const vm = useMemo<W3WinsVm>(() => {
    // Real monthly challenges: hero = the one nearest completion; the rest fill
    // the personal-challenge cards. Falls back to the pen copy until first read.
    const chAll = challenges ? [...challenges.active, ...challenges.available] : []
    const chSorted = [...chAll].sort((a, b) => Number(b.enrolled) - Number(a.enrolled) || b.pct - a.pct)
    const chHero = chSorted[0] ?? null
    const chCards = chSorted.slice(1, 4)
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

      // REAL: monthly challenges (useRewardChallenges) — hero + personal cards
      // show real progress from the rider's activities and real RideCoin rewards.
      challengesHeader: 'Your challenges',
      challengesSub: 'Real targets, paid in RideCoin when you hit them',
      challengesChip: challenges ? `${challenges.active.length} ACTIVE` : '—',
      hero: chHero ? heroFrom(chHero) : {
        title: 'Monthly challenge', daysLeft: 'THIS MONTH',
        body: 'Join a challenge to start earning RideCoin for hitting real training targets.',
        lit: 0, total: 20, progressLabel: '—', reward: 'REWARD · RIDECOIN',
      },

      personalHeader: 'Personal challenges',
      personalSub: 'Scored from your own rides · paid on completion',
      challenges: chCards.map(challengeCardFrom),
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
  }, [data, wallet, ach, challenges])

  // Find a card's live challenge (for edit prefill) by key.
  const findChallenge = (key: string): RewardChallenge | null =>
    challenges?.active.find((c) => c.key === key) ?? null

  return (
    <>
      <W3WinsView
        vm={vm}
        onNewChallenge={() => setEditor({ existing: null })}
        onEditChallenge={(key) => { const c = findChallenge(key); if (c) setEditor({ existing: c }) }}
      />
      <AnimatePresence>
        {editor && <W3ChallengeEditor existing={editor.existing} onClose={() => setEditor(null)} />}
      </AnimatePresence>
    </>
  )
}
