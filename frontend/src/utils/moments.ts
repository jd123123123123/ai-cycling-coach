/**
 * moments — what the app celebrates, and the one rule that keeps it honest.
 *
 * ── The rule ─────────────────────────────────────────────────────────────
 * The streak counts ADHERENCE, not activity. A rest day the coach prescribed
 * and the athlete honoured EXTENDS the streak.
 *
 * This is the load-bearing decision of the whole reward layer. A conventional
 * activity streak — Strava's, and the reason Gentler Streak exists — pays the
 * athlete to ride on exactly the mornings this app's own readiness gate is
 * telling them not to. That is not a cosmetic disagreement: it is the reward
 * layer actively bribing the user to ignore the coaching the rest of the
 * product exists to deliver. Rewarding adherence instead means the dopamine and
 * the physiology point the same way, and obeying the coach is the winning move.
 *
 * Everything here is a pure function over data the client already has, so a
 * moment can never be fabricated encouragement — if the evidence is not
 * present, no moment is produced.
 */

export type MomentKind =
  | 'session_as_prescribed'
  | 'rest_honoured'
  | 'zone_held'
  | 'streak_extended'
  | 'personal_record'
  | 'ftp_gain'
  | 'plan_week_complete'

export interface Moment {
  kind: MomentKind
  /** Stable identity, so a moment is celebrated once and not on every render. */
  id: string
  /** ISO date the moment belongs to. */
  date: string
  /** Magnitude 0..1 — drives how loud the celebration is. */
  intensity: number
}

/** One day of the plan-vs-actual record. */
export interface DayRecord {
  date: string
  /** What the coach prescribed. 'rest' is a real prescription, not an absence. */
  prescribed: 'rest' | 'session' | null
  /** Whether the athlete trained that day. */
  trained: boolean
  /** Compliance grade, when the day had a scored session. */
  grade?: 'perfect' | 'strong' | 'okay' | 'undercooked' | 'overcooked' | null
}

/**
 * Was this day adherent?
 *
 * A prescribed rest day is adherent when the athlete did NOT train. A
 * prescribed session is adherent when they did. A day with no prescription
 * cannot break a streak — the app never prescribed anything, so it has no
 * standing to judge that day, and treating silence as a failure would punish
 * athletes for the coach's gaps.
 */
export function isAdherent(day: DayRecord): boolean | null {
  if (day.prescribed === null) return null
  if (day.prescribed === 'rest') return !day.trained
  return day.trained
}

/**
 * Current adherence streak, counted backwards from the most recent day.
 *
 * Days with no prescription are SKIPPED rather than counted or breaking — see
 * isAdherent. The first genuinely non-adherent day ends the streak.
 *
 * `days` must be in ascending date order.
 */
export function adherenceStreak(days: readonly DayRecord[]): number {
  let streak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    const adherent = isAdherent(days[i])
    if (adherent === null) continue
    if (!adherent) break
    streak++
  }
  return streak
}

/**
 * Derive the moments earned by the most recent day.
 *
 * Returns [] when there is nothing real to celebrate. That empty case is the
 * common one and it is correct — a quiet day should be quiet.
 */
export function momentsForDay(
  days: readonly DayRecord[],
  opts: { ftpGainW?: number | null; prCount?: number } = {},
): Moment[] {
  if (days.length === 0) return []
  const today = days[days.length - 1]
  const out: Moment[] = []
  const adherent = isAdherent(today)

  if (adherent === true) {
    if (today.prescribed === 'rest') {
      out.push({
        kind: 'rest_honoured',
        id: `rest:${today.date}`,
        date: today.date,
        // Deliberately a full-strength moment. Resting on cue is the hardest
        // instruction to follow and the easiest to under-reward.
        intensity: 0.7,
      })
    } else {
      out.push({
        kind: 'session_as_prescribed',
        id: `session:${today.date}`,
        date: today.date,
        intensity: today.grade === 'perfect' ? 1 : 0.7,
      })
      if (today.grade === 'perfect') {
        out.push({
          kind: 'zone_held',
          id: `zone:${today.date}`,
          date: today.date,
          intensity: 1,
        })
      }
    }

    const streak = adherenceStreak(days)
    // Milestones only. Celebrating every single day devalues the signal fast.
    if (streak >= 3 && streak % 7 === 0) {
      out.push({
        kind: 'streak_extended',
        id: `streak:${today.date}:${streak}`,
        date: today.date,
        intensity: Math.min(1, streak / 28),
      })
    }
  }

  if (opts.ftpGainW != null && opts.ftpGainW > 0) {
    out.push({
      kind: 'ftp_gain',
      id: `ftp:${today.date}:${opts.ftpGainW}`,
      date: today.date,
      intensity: Math.min(1, opts.ftpGainW / 20),
    })
  }

  if (opts.prCount && opts.prCount > 0) {
    out.push({
      kind: 'personal_record',
      id: `pr:${today.date}:${opts.prCount}`,
      date: today.date,
      intensity: Math.min(1, opts.prCount / 3),
    })
  }

  return out
}
