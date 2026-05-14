import { useMemo } from 'react'
import {
  startOfYear,
  startOfMonth,
  subDays,
  parseISO,
  isAfter,
} from 'date-fns'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import type { ActivityRead } from '../../api/dashboard'

/**
 * SeasonStats — year-to-date training totals with a this-month delta.
 *
 * Strava's "Your Year in Sport" mechanic works because seeing a four-digit
 * number you put up yourself is genuinely motivating. We do the lite version
 * always-on: a one-row strip showing hours · km · sessions · TSS for the
 * calendar year, with a small "+N this month" delta in the same units.
 *
 * Renders nothing when no activities have logged this year (a brand-new
 * account doesn't need to see four zeros).
 */

function sumSessionsTss(acts: ActivityRead[]) {
  let hours = 0
  let km = 0
  let tss = 0
  let sessions = 0
  for (const a of acts) {
    const dur = a.duration_seconds ?? 0
    if (dur < 600) continue  // skip <10-min activities (junk pairings)
    sessions += 1
    hours += dur / 3600
    km += (a.distance_meters ?? 0) / 1000
    tss += a.tss ?? 0
  }
  return { hours, km, tss, sessions }
}

function fmtHours(h: number): string {
  if (h >= 100) return `${Math.round(h)}h`
  return `${h.toFixed(1)}h`
}

function fmtKm(km: number): string {
  if (km >= 1000) return `${Math.round(km).toLocaleString()} km`
  return `${Math.round(km)} km`
}

interface StatProps {
  label: string
  value: string
  delta?: string
}

function Stat({ label, value, delta }: StatProps) {
  return (
    <div className="flex flex-col">
      <span
        className="eyebrow"
        style={{ color: 'var(--color-muted)', fontSize: 9, letterSpacing: '0.22em' }}
      >
        {label}
      </span>
      <span
        className="num-mono leading-none mt-1"
        style={{ color: 'var(--color-ink)', fontSize: 20, fontWeight: 500 }}
      >
        {value}
      </span>
      {delta && (
        <span
          className="num-mono mt-1"
          style={{ color: 'var(--color-good)', fontSize: 10, letterSpacing: '0.02em' }}
        >
          {delta}
        </span>
      )}
    </div>
  )
}

export default function SeasonStats() {
  const today = useMemo(() => new Date(), [])
  const yearStart = useMemo(() => startOfYear(today), [today])
  const monthStart = useMemo(() => startOfMonth(today), [today])

  const { data: ytdData, isLoading } = useActivitiesRange(yearStart, today)

  const result = useMemo(() => {
    const acts = ytdData?.activities ?? []
    const ytd = sumSessionsTss(acts)
    const thisMonthActs = acts.filter((a) => {
      try {
        return isAfter(parseISO(a.started_at), subDays(monthStart, 0))
      } catch {
        return false
      }
    })
    const mtd = sumSessionsTss(thisMonthActs)
    return { ytd, mtd }
  }, [ytdData, monthStart])

  if (isLoading) {
    return <div className="h-20 rounded-[12px] animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
  }

  if (result.ytd.sessions === 0) return null

  const monthLabel = today.toLocaleString('default', { month: 'long' })

  return (
    <div
      className="rounded-[12px] px-5 py-4"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className="eyebrow"
          style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.22em' }}
        >
          {today.getFullYear()} · YEAR TO DATE
        </span>
        <span
          className="eyebrow num-mono"
          style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.12em' }}
        >
          {monthLabel.toUpperCase()} · +{result.mtd.sessions} SESSIONS
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
        <Stat
          label="HOURS"
          value={fmtHours(result.ytd.hours)}
          delta={result.mtd.hours > 0 ? `+${fmtHours(result.mtd.hours)} this month` : undefined}
        />
        <Stat
          label="DISTANCE"
          value={fmtKm(result.ytd.km)}
          delta={result.mtd.km > 0 ? `+${fmtKm(result.mtd.km)} this month` : undefined}
        />
        <Stat
          label="SESSIONS"
          value={String(result.ytd.sessions)}
          delta={result.mtd.sessions > 0 ? `+${result.mtd.sessions} this month` : undefined}
        />
        <Stat
          label="TSS"
          value={String(Math.round(result.ytd.tss))}
          delta={result.mtd.tss > 0 ? `+${Math.round(result.mtd.tss)} this month` : undefined}
        />
      </div>
    </div>
  )
}
