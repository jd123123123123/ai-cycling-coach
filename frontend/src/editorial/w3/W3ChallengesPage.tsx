import { useMemo } from 'react'
import { useRewardChallenges, useJoinChallenge } from '../../hooks/useRewardChallenges'
import type { RewardChallenge, ChallengeMetric } from '../../api/rewardChallenges'
import W3ChallengesView, {
  type W3ChallengesVm, type W3OpenChallenge, type W3MonthlyChallenge,
} from './W3ChallengesView'
import { CHALLENGES_FIXTURE } from './W3ChallengesPreview'

/**
 * W3 · 08 CHALLENGES, route /e/w3-challenges.
 *
 * REAL: the monthly hero + "Open to join" catalogue are the app's monthly
 * personal challenges (`useRewardChallenges` → /challenges/mine) — real
 * progress from the rider's own activities, and a real RideCoin payout when a
 * target is met. Tapping an open challenge joins it. FIXTURE (honestly kept):
 * the "Community challenges" cards — crew-scoped global pools with cover art and
 * "% of the whole community" — have no backend concept to map onto yet, so they
 * stay the pen fixture rather than misrepresent the crew-challenge data.
 */

const METRIC_ICON: Record<ChallengeMetric, W3OpenChallenge['icon']> = {
  active_days: 'repeat', distance_km: 'zap', tss: 'mountain',
  rides: 'sunrise', hours: 'repeat', kj: 'zap',
}
const METRIC_UNIT: Record<ChallengeMetric, string> = {
  active_days: 'days', distance_km: 'km', tss: 'TSS',
  rides: 'rides', hours: 'h', kj: 'kJ',
}
const nf = new Intl.NumberFormat('en-US')

// Segment count for the monthly hero gauge — sane for any metric (a 600 km
// target must not render 600 bars).
function segCount(target: number): number {
  const t = Math.round(target)
  return t > 0 && t <= 31 ? t : 20
}

function monthlyFrom(c: RewardChallenge, period: string): W3MonthlyChallenge {
  const total = segCount(c.target)
  const done = Math.round((c.pct / 100) * total)
  const unit = METRIC_UNIT[c.metric]
  const rewardWord = c.completed ? 'EARNED' : 'REWARD'
  return {
    name: c.title,
    daysLeftLabel: c.completed ? 'Completed' : `${period} · in progress`,
    blurb: c.detail,
    done, total,
    progressLabel: `${nf.format(Math.round(c.value))} of ${nf.format(c.target)} ${unit}`,
    reward: `${rewardWord} · ${nf.format(c.reward_rc)} RIDECOIN`,
  }
}

export default function W3ChallengesPage() {
  const { data } = useRewardChallenges()
  const join = useJoinChallenge()

  const vm = useMemo<W3ChallengesVm>(() => {
    if (!data) return CHALLENGES_FIXTURE // honest placeholder until first read

    // Monthly hero: the active challenge nearest completion (most motivating);
    // if none joined yet, showcase the first joinable one at 0%.
    const active = [...data.active].sort((a, b) => b.pct - a.pct)
    const heroSource = active[0] ?? data.available[0] ?? null
    const monthly = heroSource
      ? monthlyFrom(heroSource, data.period)
      : CHALLENGES_FIXTURE.monthly

    const open: W3OpenChallenge[] = data.available.map((c, i) => ({
      key: c.key,
      title: c.title,
      blurb: c.detail,
      reward: nf.format(c.reward_rc),
      icon: METRIC_ICON[c.metric] ?? 'repeat',
      accent: i === 0,
    }))

    return {
      title: 'Challenges',
      subtitle: 'Training targets with a payout. Every one is completed by riding, never by paying.',
      monthlyKicker: 'Monthly challenge',
      monthlyStatus: active.length ? 'Joined' : 'Open',
      monthly,
      // FIXTURE: community pools have no backend concept yet (see docstring).
      communityKicker: CHALLENGES_FIXTURE.communityKicker,
      community: CHALLENGES_FIXTURE.community,
      openKicker: 'Open to join',
      open: open.length ? open : CHALLENGES_FIXTURE.open,
      footnote: 'A challenge pays its RideCoin the moment you hit the target. Nothing here can be bought.',
    }
  }, [data])

  return <W3ChallengesView vm={vm} onJoin={(key) => join.mutate(key)} />
}
