import type { ActivityRead, PMCEntry } from '../api/dashboard'
import type { AthleteProfile } from '../types/athlete'
import { localDayKey } from './loadMetrics'

// Efficiency Factor = NP / avg_HR. Higher = better aerobic economy.
// Requires both normalized_power and average_hr — returns null if either missing.
export interface EfficiencyFactorPoint {
  date: string       // ISO started_at
  ef: number         // NP / avg_HR
  sport: ActivityRead['sport']
}

export function efficiencyFactorSeries(activities: ActivityRead[]): EfficiencyFactorPoint[] {
  // We only compute EF for cycling (NP is cycling-specific).
  return activities
    .filter((a) => a.sport === 'cycling')
    .filter(
      (a): a is ActivityRead & { normalized_power: number; average_hr: number } =>
        typeof a.normalized_power === 'number' &&
        typeof a.average_hr === 'number' &&
        a.average_hr > 0,
    )
    .map((a) => ({
      date: a.started_at,
      ef: a.normalized_power / a.average_hr,
      sport: a.sport,
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

// 4-week (28-day) moving average of EF — used as the trend line.
export function movingAverage<T extends { date: string; ef: number }>(
  points: T[],
  windowDays: number,
): Array<{ date: string; value: number | null }> {
  return points.map((p, idx) => {
    const cutoff = new Date(p.date).getTime() - windowDays * 86_400_000
    const within = points.slice(0, idx + 1).filter((q) => new Date(q.date).getTime() >= cutoff)
    if (within.length < 3) return { date: p.date, value: null }
    const sum = within.reduce((s, q) => s + q.ef, 0)
    return { date: p.date, value: sum / within.length }
  })
}

// Polarized 3-zone classification per activity using average_hr vs LTHR.
// Seiler's zones:
//   Zone 1 (easy): below ventilatory threshold 1 ≈ < 82% LTHR
//   Zone 2 (moderate): between VT1 and LT ≈ 82% – 97% LTHR (aka "grey zone")
//   Zone 3 (hard): above LT ≈ > 97% LTHR
export type PolarizedZone = 'easy' | 'moderate' | 'hard'

export function classifyPolarizedZone(
  avgHr: number | null,
  lthr: number | null,
): PolarizedZone | null {
  if (avgHr == null || lthr == null || lthr <= 0) return null
  const pct = avgHr / lthr
  if (pct < 0.82) return 'easy'
  if (pct <= 0.97) return 'moderate'
  return 'hard'
}

// Activity-level wrapper: resolves LTHR from the athlete profile using the
// same cascade as focusBadge.ts (commit 1439005), never from session max_hr.
//
// Cascade order:
//   1. profile.lthr_cycling / profile.lthr_running (sport-specific, direct measurement)
//   2. profile.max_heart_rate * 0.88 (Friel estimate, anchored on athlete HRmax)
//   3. null — no power path here; caller must handle the null case honestly
//
// Returns null when LTHR cannot be determined (no usable profile data).
export function classifyActivityPolarizedZone(
  a: ActivityRead,
  profile: AthleteProfile | null | undefined,
): PolarizedZone | null {
  if (!a.average_hr) return null

  // Cascade 1: sport-specific LTHR directly measured by athlete or lab test.
  const lthr =
    (a.sport === 'running' ? profile?.lthr_running : profile?.lthr_cycling) ??
    // Cascade 2: estimate from athlete HRmax in profile (NOT session peak HR).
    (profile?.max_heart_rate != null ? profile.max_heart_rate * 0.88 : null)

  // If no usable LTHR anchor is available, return null — honest absence beats
  // a wrong classification. The component should skip null activities.
  return classifyPolarizedZone(a.average_hr, lthr)
}

export interface TIDWeek {
  weekStart: string                        // ISO yyyy-mm-dd (Monday)
  totals: Record<PolarizedZone, number>    // hours per zone
  totalHours: number
}

// Aggregate activities into per-week polarized zone hours.
export function weeklyTID(
  activities: ActivityRead[],
  lthr: number | null,
  weeksBack = 8,
): TIDWeek[] {
  const now = new Date()
  // Start of current ISO week (Monday 00:00 local)
  const startOfWeek = new Date(now)
  const day = (startOfWeek.getDay() + 6) % 7  // 0 = Monday
  startOfWeek.setHours(0, 0, 0, 0)
  startOfWeek.setDate(startOfWeek.getDate() - day)

  const weeks: TIDWeek[] = []
  for (let i = weeksBack - 1; i >= 0; i--) {
    const ws = new Date(startOfWeek)
    ws.setDate(startOfWeek.getDate() - i * 7)
    const we = new Date(ws)
    we.setDate(ws.getDate() + 7)
    const bucket: TIDWeek = {
      // P0-2: `ws` is a LOCAL Monday midnight — toISOString() would shift it to
      // the previous day for any UTC+ timezone (Berlin). Label with the shared
      // local-day selector instead.
      weekStart: localDayKey(ws),
      totals: { easy: 0, moderate: 0, hard: 0 },
      totalHours: 0,
    }
    for (const a of activities) {
      const t = new Date(a.started_at).getTime()
      if (t < ws.getTime() || t >= we.getTime()) continue
      const zone = classifyPolarizedZone(a.average_hr, lthr)
      if (zone == null) continue
      const hours = (a.duration_seconds ?? 0) / 3600
      bucket.totals[zone] += hours
      bucket.totalHours += hours
    }
    weeks.push(bucket)
  }
  return weeks
}

// Aggregate current week totals for a single donut display.
export function currentWeekTID(
  activities: ActivityRead[],
  lthr: number | null,
): TIDWeek {
  const weeks = weeklyTID(activities, lthr, 1)
  return weeks[weeks.length - 1]!
}

// Calendar heatmap data: last N days, each with {date, tss}.
// PMCEntry has daily_tss per date.
export interface HeatmapCell {
  date: string      // yyyy-mm-dd
  tss: number       // daily TSS (0 if rest day)
}

export function calendarCells(pmcEntries: PMCEntry[], daysBack = 84): HeatmapCell[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const map = new Map<string, number>()
  for (const e of pmcEntries) {
    map.set(e.date, e.tss ?? e.daily_tss ?? 0)
  }
  const cells: HeatmapCell[] = []
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    // P0-2: `d` is LOCAL midnight — toISOString() labeled every Berlin heatmap
    // cell with the PREVIOUS day. Use the shared local-day selector.
    const key = localDayKey(d)
    cells.push({ date: key, tss: map.get(key) ?? 0 })
  }
  return cells
}

// HRV baseline band: rolling mean ± 1 std-dev.
// Returns per-day {value, lower, upper} from a rolling window lookback.
export interface HrvBandPoint {
  value: number | null
  lower: number | null
  upper: number | null
}

export function hrvBaselineBand(
  series: Array<number | null>,
  window = 7,
): HrvBandPoint[] {
  return series.map((_, i) => {
    const slice = series
      .slice(Math.max(0, i - window + 1), i + 1)
      .filter((v): v is number => typeof v === 'number')
    if (slice.length < 3) {
      return { value: series[i] ?? null, lower: null, upper: null }
    }
    const mean = slice.reduce((s, v) => s + v, 0) / slice.length
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length
    const std = Math.sqrt(variance)
    return {
      value: series[i],
      lower: mean - std,
      upper: mean + std,
    }
  })
}
