import { useMemo } from 'react'
import {
  startOfWeek,
  endOfWeek,
  subWeeks,
  isSameWeek,
} from 'date-fns'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import type { ActivityRead } from '../../api/dashboard'
import { useCountUp } from '../../hooks/useCountUp'
import { useLocale } from '../../contexts/LocaleContext'

// This-week vs last-week comparison. Reddit's #1 complaint about fitness apps:
// "I can't tell at a glance if I'm training more or less than usual."
// Three numbers tell the whole story: TSS, hours, sessions.

interface WeekStats {
  totalTSS: number
  totalHours: number
  sessions: number
  sports: Set<ActivityRead['sport']>
}

function computeWeekStats(activities: ActivityRead[], weekStart: Date): WeekStats {
  const acts = activities.filter((a) =>
    isSameWeek(new Date(a.started_at), weekStart, { weekStartsOn: 1 }),
  )
  return {
    totalTSS: acts.reduce((s, a) => s + (a.tss ?? 0), 0),
    totalHours: acts.reduce((s, a) => s + (a.duration_seconds ?? 0), 0) / 3600,
    sessions: acts.length,
    sports: new Set(acts.map((a) => a.sport)),
  }
}

function pctChange(now: number, prev: number): number | null {
  if (prev === 0) return now > 0 ? 100 : null
  return ((now - prev) / prev) * 100
}

interface StatCellProps {
  label: string
  current: number
  prev: number
  format: (v: number) => string
  rawValue: number
  digits?: number
  higherIsBetter?: boolean
}

function StatCell({ label, current, prev, format, rawValue, digits = 0, higherIsBetter = true }: StatCellProps) {
  const { locale } = useLocale()
  const pct = pctChange(current, prev)
  const animated = useCountUp(rawValue, { durationMs: 700, digits, skipZero: false })

  const toneColor =
    pct === null ? 'var(--color-muted)'
    : Math.abs(pct) < 5 ? 'var(--color-muted)'
    : (pct > 0) === higherIsBetter ? 'var(--color-forest-2)'
    : 'var(--color-amber)'

  const DeltaIcon =
    pct === null || Math.abs(pct) < 5 ? Minus
    : pct > 0 ? TrendingUp
    : TrendingDown

  return (
    <div className="flex flex-col gap-1 min-w-0 flex-1">
      <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10.5, letterSpacing: '0.22em' }}>
        {label.toUpperCase()}
      </span>
      <span
        className="num-display leading-none"
        style={{ fontSize: 'clamp(20px, 2.4vw, 26px)', color: 'var(--color-ink)' }}
      >
        {format(animated)}
      </span>
      {pct !== null && (
        <div
          className="inline-flex items-center gap-0.5 num-mono text-[11px]"
          style={{ color: toneColor }}
        >
          <DeltaIcon size={10} strokeWidth={2} />
          <span>{pct >= 0 ? '+' : ''}{Math.round(pct)}% {locale === 'de' ? 'vs. letzte Woche' : 'vs last week'}</span>
        </div>
      )}
      {pct === null && prev === 0 && current === 0 && (
        <span className="num-mono text-[11px]" style={{ color: 'var(--color-muted)' }}>
          {locale === 'de' ? 'keine Daten' : 'no data'}
        </span>
      )}
    </div>
  )
}

export default function WeekVsLast() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const today = new Date()
  const thisWeekStart = startOfWeek(today, { weekStartsOn: 1 })
  const lastWeekStart = subWeeks(thisWeekStart, 1)
  const lastWeekEnd = endOfWeek(lastWeekStart, { weekStartsOn: 1 })

  const { data: twoWeeksData, isLoading } = useActivitiesRange(lastWeekStart, today)

  const { thisWeek, lastWeek } = useMemo(() => {
    const acts = twoWeeksData?.activities ?? []
    return {
      thisWeek: computeWeekStats(acts, thisWeekStart),
      lastWeek: computeWeekStats(acts, lastWeekStart),
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [twoWeeksData])

  const totalTSSPct = pctChange(thisWeek.totalTSS, lastWeek.totalTSS)

  // Background tint based on overall direction
  const bgAccent =
    totalTSSPct === null ? 'transparent'
    : totalTSSPct > 10 ? 'radial-gradient(100% 100% at 100% 0%, rgba(48,209,88,0.06), transparent 60%)'
    : totalTSSPct < -10 ? 'radial-gradient(100% 100% at 100% 0%, rgba(255,69,58,0.05), transparent 60%)'
    : 'transparent'

  if (isLoading) {
    return (
      <div
        className="rounded-[20px] px-5 py-4 sm:px-6 sm:py-5"
        style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
      >
        <div className="h-3 w-32 rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
          ))}
        </div>
      </div>
    )
  }

  if (thisWeek.sessions === 0 && lastWeek.sessions === 0) return null

  return (
    <div
      className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
        backgroundImage: bgAccent,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="eyebrow" style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}>
          {de ? 'Diese Woche vs. letzte' : 'This week vs last'}
        </span>
        {thisWeek.sessions > 0 && (
          <span className="num-mono text-[11px]" style={{ color: 'var(--color-muted)' }}>
            {thisWeek.sessions} {de ? (thisWeek.sessions !== 1 ? 'Einheiten' : 'Einheit') : `session${thisWeek.sessions !== 1 ? 's' : ''}`}
          </span>
        )}
      </div>

      {/* 3-column stat grid */}
      <div
        className="grid grid-cols-2 sm:grid-cols-3 gap-0 rounded-[12px] overflow-hidden"
        style={{
          border: '1px solid var(--color-rule)',
          backgroundColor: 'var(--color-paper)',
        }}
      >
        <div className="px-4 py-3" style={{ borderRight: '1px solid var(--color-rule)' }}>
          <StatCell
            label={de ? 'Belastung' : 'Load'}
            current={thisWeek.totalTSS}
            prev={lastWeek.totalTSS}
            rawValue={thisWeek.totalTSS}
            format={(v) => thisWeek.totalTSS > 0 ? `${Math.round(v)} TSS` : '—'}
            digits={0}
          />
        </div>
        <div className="px-4 py-3" style={{ borderRight: '1px solid var(--color-rule)' }}>
          <StatCell
            label={de ? 'Zeit' : 'Time'}
            current={thisWeek.totalHours}
            prev={lastWeek.totalHours}
            rawValue={thisWeek.totalHours}
            format={(v) => thisWeek.totalHours > 0 ? `${v.toFixed(1)} h` : '—'}
            digits={1}
          />
        </div>
        <div className="px-4 py-3">
          <StatCell
            label={de ? 'Einheiten' : 'Sessions'}
            current={thisWeek.sessions}
            prev={lastWeek.sessions}
            rawValue={thisWeek.sessions}
            format={(v) => thisWeek.sessions > 0 ? `${Math.round(v)}` : '—'}
            digits={0}
          />
        </div>
      </div>

      {/* Last week comparison bar */}
      {lastWeek.sessions > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="num-mono text-[10px]" style={{ color: 'var(--color-muted)' }}>
              {de ? 'Letzte Woche' : 'Last week'}: {lastWeek.totalTSS > 0 ? `${Math.round(lastWeek.totalTSS)} TSS` : `${lastWeek.totalHours.toFixed(1)} h`} · {lastWeek.sessions} {de ? (lastWeek.sessions !== 1 ? 'Einheiten' : 'Einheit') : `session${lastWeek.sessions !== 1 ? 's' : ''}`}
            </span>
          </div>
          {/* Comparison bars: this week (filled) vs last week (outline only) */}
          <div className="relative h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-rule)' }}>
            {/* Last week baseline */}
            <div
              className="absolute left-0 top-0 h-full rounded-full"
              style={{
                width: `${Math.min(100, lastWeek.totalTSS > 0 ? 100 : lastWeek.totalHours > 0 ? 100 : 0)}%`,
                backgroundColor: 'var(--color-rule)',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            />
            {/* This week fill */}
            {(() => {
              const maxV = Math.max(thisWeek.totalTSS, lastWeek.totalTSS, 0.01)
              const thisV = thisWeek.totalTSS > 0 ? thisWeek.totalTSS : thisWeek.totalHours * 50
              const lastV = lastWeek.totalTSS > 0 ? lastWeek.totalTSS : lastWeek.totalHours * 50
              const maxAll = Math.max(thisV, lastV, 0.01)
              const thisPct = Math.min(100, (thisV / maxAll) * 100)
              const lastPct = Math.min(100, (lastV / maxAll) * 100)
              const color =
                totalTSSPct === null || Math.abs(totalTSSPct) < 5
                  ? 'var(--color-ink-2)'
                  : totalTSSPct > 0 ? 'var(--color-forest-2)'
                  : 'var(--color-amber)'
              return (
                <>
                  <div
                    className="absolute left-0 top-0 h-full rounded-full opacity-25 transition-all duration-700"
                    style={{ width: `${lastPct}%`, backgroundColor: 'var(--color-ink-2)' }}
                  />
                  <div
                    className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
                    style={{ width: `${thisPct}%`, backgroundColor: color }}
                  />
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
