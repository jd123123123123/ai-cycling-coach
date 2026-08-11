import type { ActivityRead } from '../../api/dashboard'

/**
 * Months, built from the ride list the app already fetches.
 *
 * No backend work: the archive's "812 km · #2 of 17 months" needs a per-month
 * aggregate and a historical rank, and neither endpoint exists. Both are a
 * fold over `GET /activities` over a wide window, which is cheap, exact, and
 * ships today — where a new endpoint is a migration, a deploy and a week.
 *
 * Pure and total on purpose: every number the History deck asserts is computed
 * here, so it can be tested without a component, a network or a clock.
 */
export interface MonthBucket {
  /** Sort- and lookup-safe: `2025-08`. */
  key: string
  /** `August 2025`, in the caller's locale. */
  label: string
  year: number
  /** 0-11, matching `Date.getMonth()`. */
  month: number
  rides: number
  km: number
  climbM: number
  movingSeconds: number
  load: number
  /** Days in the month with no ride on them. Bounded by days ELAPSED, so a
   *  month in progress does not report its unlived days as rest. */
  restDays: number
  activities: ActivityRead[]
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(year: number, month: number, locale = 'en-GB'): string {
  return new Date(year, month, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
}

/** Days of this month that have already happened, as of `now`. */
function daysElapsed(year: number, month: number, now: Date): number {
  const inMonth = new Date(year, month + 1, 0).getDate()
  if (now.getFullYear() === year && now.getMonth() === month) return now.getDate()
  // A future month has no elapsed days; any past month is complete.
  if (new Date(year, month, 1) > now) return 0
  return inMonth
}

/**
 * Group cycling activities into months, newest first.
 *
 * Cycling only — this app is bike-only, and a month's "812 km" silently
 * including a run would be a wrong number, not a generous one.
 */
export function bucketByMonth(activities: ActivityRead[], now = new Date(), locale = 'en-GB'): MonthBucket[] {
  const byKey = new Map<string, MonthBucket>()

  for (const a of activities) {
    if (a.sport !== 'cycling') continue
    const started = new Date(a.started_at)
    if (Number.isNaN(started.getTime())) continue

    const key = monthKey(started)
    let b = byKey.get(key)
    if (!b) {
      b = {
        key,
        label: monthLabel(started.getFullYear(), started.getMonth(), locale),
        year: started.getFullYear(),
        month: started.getMonth(),
        rides: 0, km: 0, climbM: 0, movingSeconds: 0, load: 0, restDays: 0,
        activities: [],
      }
      byKey.set(key, b)
    }

    b.rides += 1
    b.km += (a.distance_meters ?? 0) / 1000
    b.climbM += a.elevation_gain_m ?? 0
    b.movingSeconds += a.duration_seconds ?? 0
    b.load += a.tss ?? 0
    b.activities.push(a)
  }

  const buckets = [...byKey.values()]
  for (const b of buckets) {
    // Distinct calendar days ridden, not ride count: two rides in one day is
    // one day of training, and counting it twice would invent a rest day.
    const ridden = new Set(b.activities.map((a) => new Date(a.started_at).getDate()))
    b.restDays = Math.max(0, daysElapsed(b.year, b.month, now) - ridden.size)
    b.km = Math.round(b.km)
    b.climbM = Math.round(b.climbM)
    b.load = Math.round(b.load)
  }

  return buckets.sort((x, y) => (x.key < y.key ? 1 : -1))
}

/**
 * Where a month places against every other month on record, by distance.
 *
 * Rank is the archive's whole emotional mechanic — "#2 of 17 months" is what
 * makes a number mean something — but it is only honest against the months we
 * actually hold. Callers must fetch a wide enough window; a rank computed over
 * three months should not be presented as a career.
 */
export function rankByKm(buckets: MonthBucket[], key: string): { rank: number; of: number } | null {
  if (buckets.length === 0) return null
  const sorted = [...buckets].sort((a, b) => b.km - a.km)
  const i = sorted.findIndex((b) => b.key === key)
  if (i < 0) return null
  return { rank: i + 1, of: sorted.length }
}

/** The best month on record, excluding the one being looked at — the target an
 *  in-progress month is chasing. */
export function bestOtherMonth(buckets: MonthBucket[], key: string): MonthBucket | null {
  const others = buckets.filter((b) => b.key !== key)
  if (others.length === 0) return null
  return others.reduce((best, b) => (b.km > best.km ? b : best))
}

/** The neighbouring month that has rides, in the given direction. Powers the
 *  deck's month stepper: skipping empty months means the control never lands
 *  on a page with nothing on it. */
export function stepMonth(buckets: MonthBucket[], key: string, dir: -1 | 1): string | null {
  const i = buckets.findIndex((b) => b.key === key)
  if (i < 0) return null
  // `buckets` is newest-first, so "older" (-1) means a HIGHER index.
  const next = dir === -1 ? i + 1 : i - 1
  return buckets[next]?.key ?? null
}
