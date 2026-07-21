// Pure celebration logic + honest dedup gating.
//
// Every celebration must fire ONCE per real achievement instance. These helpers
// keep that guarantee testable and free of React: milestone detection, PB
// selection, dedup-key construction, and a localStorage "seen" gate that no-ops
// safely in non-DOM environments (SSR / vitest node runner).

// ── Streak milestones ───────────────────────────────────────────────────────
// We celebrate the *arrival* at a milestone — not every day. A daily streak of
// e.g. 8 days is not a milestone; 7 is. Ordered ascending.
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365] as const

/** The milestone reached exactly at `streak`, or null if `streak` is not one. */
export function streakMilestone(streak: number | null | undefined): number | null {
  if (typeof streak !== 'number' || !Number.isFinite(streak)) return null
  return (STREAK_MILESTONES as readonly number[]).includes(streak) ? streak : null
}

// ── PB selection from ride efforts ──────────────────────────────────────────
export interface PrEffortLike {
  duration_s: number
  ride_watts: number
  is_pr: boolean
}

/** The single most impressive PB in a ride: the highest-wattage `is_pr` effort. */
export function bestPrEffort<T extends PrEffortLike>(efforts: T[] | null | undefined): T | null {
  if (!efforts || efforts.length === 0) return null
  let best: T | null = null
  for (const e of efforts) {
    if (!e.is_pr) continue
    if (typeof e.ride_watts !== 'number' || !(e.ride_watts > 0)) continue
    if (best === null || e.ride_watts > best.ride_watts) best = e
  }
  return best
}

/** Count of season-best efforts in a ride (drives the "N Erfolge" badge). */
export function prCount<T extends PrEffortLike>(efforts: T[] | null | undefined): number {
  if (!efforts) return 0
  return efforts.filter((e) => e.is_pr).length
}

/** Human duration label for a PB effort ("20s" / "5min" / "1h"). */
export function durationLabel(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}min`
  return `${Math.round(s / 3600)}h`
}

// ── Dedup keys ──────────────────────────────────────────────────────────────
export function pbDedupKey(activityId: number): string {
  return `celebrate:pb:${activityId}`
}
export function streakDedupKey(milestone: number): string {
  return `celebrate:streak:${milestone}`
}
export function weeklyDedupKey(weekKey: string): string {
  return `celebrate:weekly:${weekKey}`
}

/**
 * ISO-week key (YYYY-Www) for the given date — the stable identity of a training
 * week, so the "week complete" celebration fires at most once per calendar week.
 */
export function isoWeekKey(d: Date): string {
  // Copy to a UTC-normalized date at midnight to avoid TZ/DST drift.
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  // ISO weeks start on Monday; shift so Thursday determines the year.
  const day = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - day + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const firstDay = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3)
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000))
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

// ── localStorage "seen" gate ────────────────────────────────────────────────
export function hasCelebrated(key: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

export function markCelebrated(key: string): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, '1')
  } catch {
    /* ignore — dedup is best-effort */
  }
}
