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

/**
 * The Day Rail's own four browsable steps, in rail order, as the `DayState`
 * each one targets (topbar task: `components/DayRail.tsx`,
 * `pages/TodayView.tsx`). Step 0 (day type) is shared by 'rest'/'training' —
 * resolved from `derived` (the day's REAL, non-overridden state), never from
 * whatever is currently being previewed, so browsing back to step 0 always
 * lands on the day's actual type rather than a guess. Lives here (not in
 * `components/DayRail.tsx`) because it's a pure function of `DayState`, and
 * `TodayView.tsx`'s own swipe gesture needs the exact same list DayRail's
 * taps use — a component file can only export components (react-refresh
 * fast-refresh rule), so a shared helper belongs in the state module both
 * already depend on.
 */
export function dayRailStepTargets(derived: DayState): readonly [DayState, DayState, DayState, DayState] {
  return [derived === 'rest' ? 'rest' : 'training', 'trained', 'resting', 'evening']
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

export function clearOverride(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* see writeOverride */
  }
}
