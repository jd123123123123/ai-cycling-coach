import { useMemo } from 'react'
import {
  startOfYear,
  startOfMonth,
  subYears,
  getDayOfYear,
  getMonth,
  parseISO,
  isAfter,
} from 'date-fns'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import Sparkline from './Sparkline'
import { useT, useLocale } from '../../contexts/LocaleContext'
import type { ActivityRead } from '../../api/dashboard'

/**
 * SeasonStats — year-to-date training totals with depth.
 *
 * Beyond the four big numbers, each metric now carries the context that makes
 * a season feel like a story rather than a scoreboard:
 *   · a cumulative sparkline of the year so far (the climbing line)
 *   · a year-over-year delta vs the same calendar day last year (am I ahead?)
 *   · a footer projection — where this pace lands by Dec 31
 *
 * Renders nothing when no activities have logged this year (a brand-new
 * account doesn't need to see four zeros).
 */

interface Totals {
  hours: number
  km: number
  tss: number
  sessions: number
}

function emptyTotals(): Totals {
  return { hours: 0, km: 0, tss: 0, sessions: 0 }
}

function isReal(a: ActivityRead): boolean {
  return (a.duration_seconds ?? 0) >= 600 // skip <10-min activities (junk pairings)
}

function addActivity(t: Totals, a: ActivityRead) {
  t.sessions += 1
  t.hours += (a.duration_seconds ?? 0) / 3600
  t.km += (a.distance_meters ?? 0) / 1000
  t.tss += a.tss ?? 0
}

function sumTotals(acts: ActivityRead[]): Totals {
  const t = emptyTotals()
  for (const a of acts) if (isReal(a)) addActivity(t, a)
  return t
}

/** Cumulative month-end totals Jan..currentMonth — one point per elapsed month. */
function monthlyCumulative(acts: ActivityRead[], currentMonth: number, pick: (t: Totals) => number): number[] {
  const perMonth: Totals[] = Array.from({ length: currentMonth + 1 }, emptyTotals)
  for (const a of acts) {
    if (!isReal(a)) continue
    let m: number
    try {
      m = getMonth(parseISO(a.started_at))
    } catch {
      continue
    }
    if (m < 0 || m > currentMonth) continue
    addActivity(perMonth[m], a)
  }
  const out: number[] = []
  let running = 0
  for (let m = 0; m <= currentMonth; m++) {
    running += pick(perMonth[m])
    out.push(running)
  }
  return out
}

function fmtHours(h: number): string {
  if (h >= 100) return `${Math.round(h)}h`
  return `${h.toFixed(1)}h`
}

function fmtKm(km: number): string {
  if (km >= 1000) return `${Math.round(km).toLocaleString()} km`
  return `${Math.round(km)} km`
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString()
}

interface StatProps {
  label: string
  value: string
  spark: number[]
  /** % change vs same day last year; null when there's no prior-year baseline. */
  yoy: number | null
  color: string
}

function Stat({ label, value, spark, yoy, color }: StatProps) {
  const t = useT()
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="eyebrow"
        style={{ color: 'var(--color-muted)', fontSize: 10.5, letterSpacing: '0.22em' }}
      >
        {label}
      </span>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          className="num-mono leading-none"
          style={{ color: 'var(--color-ink)', fontSize: 22, fontWeight: 500 }}
        >
          {value}
        </span>
        {yoy != null && Number.isFinite(yoy) && (
          <span
            className="num-mono inline-flex items-center gap-0.5"
            style={{
              color: yoy >= 0 ? 'var(--color-good)' : 'var(--color-muted)',
              fontSize: 10,
              letterSpacing: '0.02em',
            }}
            title={t('yoy_tooltip')}
          >
            {yoy >= 0 ? <TrendingUp size={10} strokeWidth={2.4} /> : <TrendingDown size={10} strokeWidth={2.4} />}
            {yoy >= 0 ? '+' : ''}{Math.round(yoy)}%
          </span>
        )}
      </div>
      <div style={{ color }}>
        <Sparkline values={spark} width={96} height={22} stroke={color} fill={color} showDot={false} />
      </div>
    </div>
  )
}

export default function SeasonStats() {
  const t = useT()
  const { locale } = useLocale()
  const today = useMemo(() => new Date(), [])
  const yearStart = useMemo(() => startOfYear(today), [today])
  const monthStart = useMemo(() => startOfMonth(today), [today])
  // Same calendar window one year ago (Jan 1 → today-1y) for a fair YoY compare.
  const lastYearStart = useMemo(() => subYears(yearStart, 1), [yearStart])
  const lastYearToday = useMemo(() => subYears(today, 1), [today])

  const { data: ytdData, isLoading } = useActivitiesRange(yearStart, today)
  const { data: lastYearData } = useActivitiesRange(lastYearStart, lastYearToday)

  const model = useMemo(() => {
    const acts = ytdData?.activities ?? []
    const ytd = sumTotals(acts)

    const thisMonthActs = acts.filter((a) => {
      try {
        return isAfter(parseISO(a.started_at), monthStart)
      } catch {
        return false
      }
    })
    const mtd = sumTotals(thisMonthActs)

    const prior = sumTotals(lastYearData?.activities ?? [])
    const currentMonth = getMonth(today)
    const dayOfYear = getDayOfYear(today)
    const yearFraction = dayOfYear / 365

    const yoy = (cur: number, prev: number): number | null =>
      prev > 0 ? ((cur - prev) / prev) * 100 : null
    const project = (cur: number): number => (yearFraction > 0 ? cur / yearFraction : cur)

    return {
      ytd,
      mtd,
      sparks: {
        hours: monthlyCumulative(acts, currentMonth, (t) => t.hours),
        km: monthlyCumulative(acts, currentMonth, (t) => t.km),
        sessions: monthlyCumulative(acts, currentMonth, (t) => t.sessions),
        tss: monthlyCumulative(acts, currentMonth, (t) => t.tss),
      },
      yoy: {
        hours: yoy(ytd.hours, prior.hours),
        km: yoy(ytd.km, prior.km),
        sessions: yoy(ytd.sessions, prior.sessions),
        tss: yoy(ytd.tss, prior.tss),
      },
      projection: {
        km: project(ytd.km),
        hours: project(ytd.hours),
      },
      hasPrior: prior.sessions > 0,
    }
  }, [ytdData, lastYearData, monthStart, today])

  if (isLoading) {
    return <div className="h-36 rounded-[12px] animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
  }

  if (model.ytd.sessions === 0) return null

  const monthLabel = today.toLocaleString(locale === 'de' ? 'de-DE' : 'en-US', { month: 'long' })

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
          {today.getFullYear()} · {t('year_to_date')}
        </span>
        <span
          className="eyebrow num-mono"
          style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.12em' }}
        >
          {monthLabel.toUpperCase()} · +{model.mtd.sessions} {t('sessions_label')}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
        <Stat
          label={t('stat_hours')}
          value={fmtHours(model.ytd.hours)}
          spark={model.sparks.hours}
          yoy={model.yoy.hours}
          color="var(--color-forest-2)"
        />
        <Stat
          label={t('stat_distance')}
          value={fmtKm(model.ytd.km)}
          spark={model.sparks.km}
          yoy={model.yoy.km}
          color="var(--color-good)"
        />
        <Stat
          label={t('sessions_label')}
          value={fmtInt(model.ytd.sessions)}
          spark={model.sparks.sessions}
          yoy={model.yoy.sessions}
          color="var(--color-amber-2)"
        />
        <Stat
          label={t('stat_tss')}
          value={fmtInt(model.ytd.tss)}
          spark={model.sparks.tss}
          yoy={model.yoy.tss}
          color="var(--color-ink-2)"
        />
      </div>

      {/* Projection — where today's pace lands by Dec 31. The forward-looking
          close that turns a tally into a target. */}
      {model.ytd.km > 50 && (
        <div
          className="mt-4 pt-3 flex items-center gap-2 text-[12px]"
          style={{ borderTop: '1px solid var(--color-rule)', color: 'var(--color-ink-2)' }}
        >
          <TrendingUp size={12} strokeWidth={2} style={{ color: 'var(--color-good)', flexShrink: 0 }} />
          {locale === 'de' ? (
            <span>
              Bei diesem Tempo erreichst du {today.getFullYear()} rund{' '}
              <strong style={{ color: 'var(--color-ink)' }}>{fmtKm(model.projection.km)}</strong>
              {' '}und{' '}
              <strong style={{ color: 'var(--color-ink)' }}>{fmtHours(model.projection.hours)}</strong>
              {' '}im Sattel
              {model.hasPrior && model.yoy.km != null && (
                <> — {Math.abs(Math.round(model.yoy.km))}% {model.yoy.km >= 0 ? 'vor dem Vorjahr' : 'hinter dem Vorjahr'}</>
              )}
              .
            </span>
          ) : (
            <span>
              On this pace you’ll finish {today.getFullYear()} around{' '}
              <strong style={{ color: 'var(--color-ink)' }}>{fmtKm(model.projection.km)}</strong>
              {' '}and{' '}
              <strong style={{ color: 'var(--color-ink)' }}>{fmtHours(model.projection.hours)}</strong>
              {' '}in the saddle
              {model.hasPrior && model.yoy.km != null && (
                <> — {model.yoy.km >= 0 ? 'ahead of' : 'behind'} last year by {Math.abs(Math.round(model.yoy.km))}%</>
              )}
              .
            </span>
          )}
        </div>
      )}
    </div>
  )
}
