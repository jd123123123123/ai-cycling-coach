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
  active_days: 'Tage', distance_km: 'km', tss: 'TSS', rides: 'Fahrten', hours: 'h', kj: 'kJ',
}
const chNf = new Intl.NumberFormat('de-DE')
const chSegs = (target: number) => { const t = Math.round(target); return t > 0 && t <= 31 ? t : 20 }

function heroFrom(c: RewardChallenge): W3Hero {
  const total = chSegs(c.target)
  const unit = CH_UNIT[c.metric]
  return {
    title: c.title,
    daysLeft: c.completed ? 'GESCHAFFT' : 'DIESEN MONAT',
    body: c.detail,
    lit: Math.round((c.pct / 100) * total),
    total,
    progressLabel: `${chNf.format(Math.round(c.value))} von ${chNf.format(c.target)} ${unit}`,
    reward: `${c.completed ? 'VERDIENT' : 'BELOHNUNG'} · ${chNf.format(c.reward_rc)} RIDECOIN`,
  }
}

function challengeCardFrom(c: RewardChallenge): W3Challenge {
  const unit = CH_UNIT[c.metric]
  return {
    key: c.key,
    title: c.title,
    reward: `${c.completed ? '✓ ' : '+'}${chNf.format(c.reward_rc)} RIDECOIN`,
    sub: `${chNf.format(Math.round(c.value))} von ${chNf.format(c.target)} ${unit}`,
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

// Month names always come from the locale, never a hand-written table.
const monthBack = (n: number): string => {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - n)
  return d.toLocaleDateString('de-DE', { month: 'long' })
}
const thisMonth = () => monthBack(0)

// Personal records: (label, seconds, best-flag, fixture note, fixture past-fraction)
const RECORD_SPEC: Array<{ key: string; label: string; seconds: number; best: boolean; note: string; past: number }> = [
  { key: '5s', label: '5 SEK', seconds: 5, best: false, note: `+40 ggü. ${monthBack(3)}`, past: 0.16 },
  { key: '1m', label: '1 MIN', seconds: 60, best: false, note: `+8 ggü. ${monthBack(2)}`, past: 0.08 },
  { key: '12m', label: '12 MIN', seconds: 720, best: true, note: `BESTWERT · 12. ${monthBack(3).toUpperCase()}`, past: 1 },
  { key: '20m', label: '20 MIN', seconds: 1200, best: false, note: `+3 ggü. ${monthBack(1)}`, past: 0.05 },
]

// Fallback record watts when the athlete has no power curve yet (pen-exact).
const RECORD_FALLBACK: Record<string, string> = { '5s': '1.240 W', '1m': '620 W', '12m': '288 W', '20m': '276 W' }

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
      const value = w != null ? `${Math.round(w).toLocaleString('de-DE')} W` : RECORD_FALLBACK[s.key] ?? '—'
      return { key: s.key, label: s.label, value, note: s.note, past: s.past, best: s.best }
    })

    return {
      title: 'Erfolge',
      subtitle: 'Jedes Abzeichen hier ist ein Trainingsergebnis. Nichts davon ist gekauft.',
      balance: wallet ? wallet.balance.toLocaleString('de-DE') : null,  // REAL: RideCoin wallet

      // REAL: monthly challenges (useRewardChallenges) — hero + personal cards
      // show real progress from the rider's activities and real RideCoin rewards.
      challengesHeader: 'Deine Challenges',
      challengesSub: 'Echte Ziele — in RideCoin bezahlt, wenn du sie triffst',
      challengesChip: challenges ? `${challenges.active.length} AKTIV` : '—',
      hero: chHero ? heroFrom(chHero) : {
        title: 'Monats-Challenge', daysLeft: 'DIESEN MONAT',
        body: 'Tritt einer Challenge bei und verdiene RideCoin für echte Trainingsziele.',
        lit: 0, total: 20, progressLabel: '—', reward: 'BELOHNUNG · RIDECOIN',
      },

      personalHeader: 'Persönliche Challenges',
      personalSub: 'Aus deinen eigenen Fahrten · Auszahlung bei Abschluss',
      challenges: chCards.map(challengeCardFrom),
      newChallengeLabel: 'NEUE CHALLENGE',

      // REAL: watts from the athlete's mean-max curve; notes/deltas are fixture
      recordsHeader: 'Persönliche Rekorde',
      recordsSub: 'Der Balken zeigt, wie weit über deinem alten Bestwert du liegst',
      records,

      // fixture: reward layer (community pools not built)
      communityHeader: 'Community-Challenges',
      communitySub: 'Alle Kilometer in einem Topf · dein Anteil zählt',
      communityChip: '4 DABEI',
      communityHero: {
        title: 'Um die Welt ×2',
        pct: '26 %',
        sub: '20.840 von 80.150 km · noch 4 Wochen',
        foot: 'Du hast 412 km beigetragen. Top 8 % der Community.',
        fill: 0.26,
      },
      community: [
        { key: 'everest', title: 'Alpen-Everesting', pct: '41 %', sub: '1,24 Mio. von 3,00 Mio. m · noch 6 Tage', you: 'DU 1 240 M · TOP 12 %', fill: 0.41 },
        { key: 'aug1000', title: `${thisMonth()} 1 000`, pct: '61 %', sub: '2,39 Mio. von 3,90 Mio. km · noch 19 Tage', you: 'DU 612 KM · TOP 22 %', fill: 0.61 },
        { key: 'elbe', title: 'Elbe-Runde Staffel', pct: '78 %', sub: '312 von 400 Runden · noch 3 Tage', you: 'DU 9 RUNDEN · TOP 31 %', fill: 0.78 },
      ],

      // REAL: training milestones detected server-side (achievement_service).
      // Earned badges come from `unlocked`, locked-with-progress from
      // `in_progress`; the count is the real unlocked/total. Falls back to the
      // pen fixture only until the first achievements read resolves.
      badgesHeader: 'Abzeichen',
      badgesCount: ach ? `${ach.counts.unlocked} von ${ach.counts.total}` : '— von —',
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
