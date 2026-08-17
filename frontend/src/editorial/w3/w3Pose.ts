import type { DayState } from '../state/dayState'
import type { DayPose } from '../../api/garage'

/**
 * Which scene Today's hero asks for — the rider's pose, from the day the rider
 * is actually in.
 *
 * This is the one place the mapping lives, because it is TWO things at once:
 * what the hero depicts, and the server's cache key (`/garage/scene/today?pose`
 * → one composed image per pose per rider, forever). A pose invented at a call
 * site would either bill a fresh render or read back a picture of the wrong day.
 *
 * The intensity thresholds mirror the backend's `api/garage._pose_for`, so the
 * ride a rider is about to do and the ride they just did never disagree about
 * how hard it was.
 */

/** IF at or above this is a hard day; below `EASY_IF` it is recovery. */
export const HARD_IF = 0.92
export const EASY_IF = 0.6

/**
 * @param state the real day-state (`useDayState`)
 * @param intensityFactor the prescribed session's IF, or null when the plan
 *   carries no TSS/duration to derive one from — in which case nothing is
 *   claimed about the effort and the scene shows a steady ride.
 */
export function poseForDay(state: DayState, intensityFactor: number | null): DayPose {
  if (state === 'trained') return 'trained'
  if (state === 'evening') return 'evening'
  // A rest day that hasn't got going vs. one already under way: same rest, but
  // 'rest' is the avatar asleep on the bike and 'lazy' is feet-up-on-the-bars.
  if (state === 'resting') return 'lazy'
  if (state !== 'training') return 'rest'
  if (intensityFactor == null) return 'endurance'
  return intensityFactor >= HARD_IF ? 'hard' : intensityFactor < EASY_IF ? 'recovery' : 'endurance'
}

/** What the composed scene is depicting, in the rider's language. */
export const POSE_LABEL: Record<DayPose, string> = {
  rest: 'RUHETAG',
  lazy: 'RUHETAG',
  endurance: 'GRUNDLAGE',
  hard: 'HARTE EINHEIT',
  recovery: 'ERHOLUNGSFAHRT',
  trained: 'ERLEDIGT',
  evening: 'FEIERABEND',
}
