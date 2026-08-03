import { useMemo } from 'react'
import { useStreak } from './useStreak'
import type { StreakDayState } from '../api/athletes'
import type { Moment } from '../utils/moments'

/**
 * useMoments — what today earned, derived from the server's own day states.
 *
 * ── Why this does NOT recompute the streak ───────────────────────────────
 * The backend already answers this question, and answers it better:
 * `/athletes/me/streak` is plan-aware and forgiving — trained days AND planned
 * rest days extend the chain, sick/injured/break days PAUSE it rather than
 * ending it, and only a skipped planned session breaks it. It also owns the
 * honest repair path for the most common false break (a real ride Garmin had
 * not synced yet).
 *
 * Recomputing any of that on the client would give the athlete two streaks that
 * disagree on exactly the days that matter most — the sick week, the late sync.
 * So the server is the single source of truth for the chain, and this hook only
 * decides how to CELEBRATE the state it reports.
 *
 * `utils/moments.ts` keeps the pure adherence helpers for tests and for callers
 * that hold a plan-vs-actual record directly; they are deliberately not used to
 * second-guess the server here.
 *
 * A paused streak produces no moments at all. Celebrating during an illness
 * pause would be the app cheering while the athlete is unwell.
 */
export function useMoments(): { moments: Moment[]; streak: number; paused: boolean } {
  const { data } = useStreak()

  return useMemo(() => {
    const streak = data?.streak ?? 0
    const paused = data?.paused ?? false
    if (!data || paused) return { moments: [], streak, paused }

    // The server marks the current day 'today' until it has evidence either
    // way, so the day that can EARN something is the last one with a settled
    // state. Celebrating an unsettled 'today' would fire before the ride.
    const settled = [...(data.week ?? [])]
      .filter((d) => d.state !== 'today' && d.state !== 'upcoming')
      .pop()
    if (!settled) return { moments: [], streak, paused }

    const moments: Moment[] = []
    const kind: Partial<Record<StreakDayState, Moment['kind']>> = {
      trained: 'session_as_prescribed',
      rest: 'rest_honoured',
    }
    const earned = kind[settled.state]
    if (earned) {
      moments.push({
        kind: earned,
        id: `${earned}:${settled.date}`,
        date: settled.date,
        // Rest is celebrated at full strength on purpose: it is the hardest
        // instruction to follow and the easiest to under-reward.
        intensity: 0.7,
      })
    }

    // Milestones only — a badge every single day devalues the signal within a
    // week. 7, 14, 21… mirrors how the chain actually reads to the athlete.
    if (earned && streak >= 3 && streak % 7 === 0) {
      moments.push({
        kind: 'streak_extended',
        id: `streak:${settled.date}:${streak}`,
        date: settled.date,
        intensity: Math.min(1, streak / 28),
      })
    }

    return { moments, streak, paused }
  }, [data])
}
