/**
 * The five Today states and how the day picks one.
 *
 * The 21:00 evening threshold comes from the pen's own clocks: the Trained
 * frame reads 19:24 and the Evening frame reads 21:40, so a completed ride
 * still shows Trained through the evening and only hands over late. Evening
 * subsumes Trained — its "01 Today" section carries the ride.
 */
export type DayState = 'rest' | 'training' | 'trained' | 'resting' | 'evening'

export const DAY_STATES: readonly DayState[] = ['rest', 'training', 'trained', 'resting', 'evening']

export interface DayFacts {
  now: Date
  hasCyclingActivityToday: boolean
  hasPlannedSessionToday: boolean
  plannedSessionCompleted: boolean
}

export const EVENING_HOUR = 21
export const RESTING_HOUR = 11

export function deriveDayState(f: DayFacts): DayState {
  if (f.now.getHours() >= EVENING_HOUR) return 'evening'
  if (f.hasCyclingActivityToday) return 'trained'
  if (f.hasPlannedSessionToday && !f.plannedSessionCompleted) return 'training'
  if (f.now.getHours() >= RESTING_HOUR) return 'resting'
  return 'rest'
}

const KEY = 'editorial.dayState'

/** Local ISO date (not UTC) — the override must expire at the athlete's midnight. */
export function isoDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isDayState(v: unknown): v is DayState {
  return typeof v === 'string' && (DAY_STATES as readonly string[]).includes(v)
}

export function readOverride(now: Date): DayState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { date, state } = parsed as { date?: unknown; state?: unknown }
    if (date !== isoDateKey(now)) return null
    return isDayState(state) ? state : null
  } catch {
    return null
  }
}

export function writeOverride(state: DayState, now: Date): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ date: isoDateKey(now), state }))
  } catch {
    /* private mode — the override is a convenience, never a requirement */
  }
}

export function clearOverride(_now: Date): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* see writeOverride */
  }
}
