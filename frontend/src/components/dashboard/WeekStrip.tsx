/**
 * WeekStrip — weekly activity strip.
 *
 * Supports two variants:
 *   'full' (default): full card with totals header + 7-cell grid (existing behavior)
 *   'mini': compact 7-bar strip, ≤ 80px tall. Used in TodayTab above-the-fold.
 *           Bar click: navigates to ?tab=plan.
 *
 * Whoop/Strava playbook: a single "what have I done this week" strip
 * collapses 7 days of training into a glanceable answer.
 */
import { useMemo } from 'react'
import {
  eachDayOfInterval,
  endOfWeek,
  format,
  isAfter,
  isSameDay,
  startOfWeek,
  subDays,
} from 'date-fns'
import { useSearchParams } from 'react-router-dom'
import { useLocale } from '../../contexts/LocaleContext'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import type { ActivityRead } from '../../api/dashboard'
import { formatDate, formatHours, formatDelta } from '../../utils/format'
import { toneFromPct, tokenForTone } from '../../utils/delta'

interface DayCell {
  date: Date
  tss: number
  durationSeconds: number
  count: number
  isFuture: boolean
  isToday: boolean
}

/**
 * intensityColor — returns zone CSS var() tokens for a TSS value.
 * Both mini and full variants consume this; returns CSS var() zone tokens only.
 */
function intensityColor(tss: number): { bg: string; border: string } {
  if (tss <= 0) {
    return {
      bg: 'var(--color-paper)',
      border: 'var(--color-rule)',
    }
  }
  if (tss < 50) {
    // Easy / recovery — Z2 low endurance
    return { bg: 'var(--color-zone-2)', border: 'var(--color-zone-2)' }
  }
  if (tss < 100) {
    // Endurance — mid Z2/Z3 boundary
    return { bg: 'var(--color-zone-3)', border: 'var(--color-zone-3)' }
  }
  if (tss < 150) {
    // Hard / threshold — Z4
    return { bg: 'var(--color-zone-4)', border: 'var(--color-zone-4)' }
  }
  // Peak / overreach — Z5
  return { bg: 'var(--color-zone-5)', border: 'var(--color-zone-5)' }
}

interface WeekStripProps {
  /**
   * 'full' (default): full card with totals header + 7-cell grid.
   * 'mini': compact 7-bar row ≤ 80px tall, used above-the-fold on TodayTab.
   */
  variant?: 'mini' | 'full'
}

export default function WeekStrip({ variant = 'full' }: WeekStripProps = {}) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const now = new Date()
  const restWord = de ? 'Ruhe' : 'rest'
  const upcomingWord = de ? 'geplant' : 'upcoming'
  // Monday-start: cycling training weeks canonically run Mon→Sun (Coggan PMC,
  // TrainingPeaks, etc.).
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })

  // This-week query (7 days)
  const { data, isLoading } = useActivitiesRange(weekStart, weekEnd)
  const [, setSearchParams] = useSearchParams()

  // 28-day query for week-vs-4w-avg line (full variant only).
  // Uses the same useActivitiesRange hook with an extended window — no new
  // endpoint, no backend change. Single-line extension of existing data path.
  const fourWeekStart = subDays(weekStart, 21) // 3 prior weeks + current = 28 days
  const { data: data28 } = useActivitiesRange(fourWeekStart, weekEnd)

  const cells: DayCell[] = useMemo(() => {
    const activities: ActivityRead[] = data?.activities ?? []
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd })

    return days.map((date) => {
      const dayActs = activities.filter((a) =>
        isSameDay(new Date(a.started_at), date),
      )
      const tss = dayActs.reduce((acc, a) => acc + (a.tss ?? 0), 0)
      const durationSeconds = dayActs.reduce(
        (acc, a) => acc + (a.duration_seconds ?? 0),
        0,
      )
      return {
        date,
        tss,
        durationSeconds,
        count: dayActs.length,
        isFuture: isAfter(date, now) && !isSameDay(date, now),
        isToday: isSameDay(date, now),
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, weekStart, weekEnd])

  const totals = useMemo(() => {
    const ridesDone = cells.reduce((acc, c) => acc + c.count, 0)
    const tssTotal = cells.reduce((acc, c) => acc + c.tss, 0)
    const hoursTotal = cells.reduce((acc, c) => acc + c.durationSeconds, 0)
    return { ridesDone, tssTotal, hoursTotal }
  }, [cells])

  // Compute 4-week average TSS and hours from 28-day data.
  // Prior 3 complete weeks are used for the "avg" denominator (not current partial week).
  const weekVsAvg = useMemo(() => {
    const allActs: ActivityRead[] = data28?.activities ?? []
    if (allActs.length === 0) return null

    // Current week TSS/hours already in totals — use from cells
    const thisWeekTSS = totals.tssTotal
    const thisWeekSeconds = totals.hoursTotal

    // Build weekly TSS buckets for the prior 3 weeks
    const priorWeekTSS: number[] = [0, 0, 0] // index 0 = most recent prior week
    const priorWeekSeconds: number[] = [0, 0, 0]

    for (const a of allActs) {
      const actDate = new Date(a.started_at)
      // Skip activities in current week
      if (!isAfter(actDate, weekStart) || isSameDay(actDate, weekStart)) {
        // In prior 3 weeks: determine which week bucket (0=last, 1=2wk ago, 2=3wk ago)
        for (let w = 0; w < 3; w++) {
          const wkStart = subDays(weekStart, (w + 1) * 7)
          const wkEnd = subDays(weekStart, w * 7 + 1)
          if (actDate >= wkStart && actDate <= wkEnd) {
            priorWeekTSS[w] += a.tss ?? 0
            priorWeekSeconds[w] += a.duration_seconds ?? 0
            break
          }
        }
      }
    }

    const avgTSS = (priorWeekTSS[0] + priorWeekTSS[1] + priorWeekTSS[2]) / 3
    const avgSeconds = (priorWeekSeconds[0] + priorWeekSeconds[1] + priorWeekSeconds[2]) / 3

    if (avgTSS === 0 && avgSeconds === 0) return null

    return {
      thisWeekTSS,
      thisWeekSeconds,
      avgTSS,
      avgSeconds,
      deltaPct: avgTSS > 0 ? ((thisWeekTSS - avgTSS) / avgTSS) * 100 : null,
    }
  }, [data28, totals, weekStart])

  // ── Mini variant ────────────────────────────────────────────────────────────
  if (variant === 'mini') {
    const maxTss = Math.max(1, ...cells.map((c) => c.tss))
    const BAR_MAX_H = 28 // px
    const BAR_MIN_H = 4  // px for days with a session but tiny TSS

    return (
      <div
        className="paper-grain rounded-[16px] px-4 py-3"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          border: '1px solid var(--color-rule)',
        }}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10.5, letterSpacing: '0.22em' }}>
            {format(weekStart, 'MMM d')}–{format(weekEnd, 'd')}
          </span>
          {!isLoading && totals.tssTotal > 0 && (
            <span className="num-mono text-[10.5px]" style={{ color: 'var(--color-muted)' }}>
              {Math.round(totals.tssTotal)} TSS · {formatHours(totals.hoursTotal)}
            </span>
          )}
        </div>

        {/* 7-bar row — bar height scales with TSS so you see the load at a glance */}
        <div className="grid grid-cols-7 gap-1" style={{ height: BAR_MAX_H + 14 }}>
          {cells.map((cell, i) => {
            const hasSession = cell.count > 0 && !cell.isFuture
            const barH = hasSession
              ? Math.max(BAR_MIN_H, (cell.tss / maxTss) * BAR_MAX_H)
              : 0
            const { bg } = intensityColor(hasSession ? cell.tss : 0)
            const dayLetter = formatDate(cell.date, 'EEEEE', locale)
            return (
              <button
                key={i}
                type="button"
                title={
                  cell.isFuture
                    ? `${format(cell.date, 'EEE, MMM d')} · ${upcomingWord}`
                    : cell.count === 0
                      ? `${format(cell.date, 'EEE, MMM d')} · ${restWord}`
                      : `${format(cell.date, 'EEE, MMM d')} · ${formatHours(cell.durationSeconds)} · ${Math.round(cell.tss)} TSS`
                }
                onClick={() => setSearchParams({ tab: 'plan' }, { replace: true })}
                aria-label={`${format(cell.date, 'EEEE, MMM d')} — ${de ? 'tippen für Plan' : 'tap to view plan'}`}
                className="flex flex-col items-end justify-end gap-1 focus:outline-none"
                style={{ paddingBottom: 2 }}
              >
                {/* Bar */}
                <div
                  style={{
                    width: '100%',
                    height: hasSession ? barH : 3,
                    borderRadius: 3,
                    backgroundColor: hasSession ? bg : 'var(--color-rule)',
                    opacity: cell.isFuture ? 0.3 : hasSession ? 0.85 : 0.5,
                    boxShadow: cell.isToday && hasSession
                      ? `0 0 6px color-mix(in srgb, ${bg} 60%, transparent)`
                      : cell.isToday
                      ? '0 0 0 1.5px var(--color-ink), 0 0 6px color-mix(in srgb, var(--color-ink) 28%, transparent)'
                      : 'none',
                    outline: 'none',
                    transition: 'height 600ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                />
                {/* Day letter */}
                <span
                  className="eyebrow"
                  style={{
                    fontSize: 10.5,
                    color: cell.isToday ? 'var(--color-ink)' : 'var(--color-muted)',
                    letterSpacing: '0.05em',
                    fontWeight: cell.isToday ? 600 : 400,
                  }}
                >
                  {dayLetter}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Full variant ─────────────────────────────────────────────────────────────
  return (
    <div
      className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <span
            className="eyebrow"
            style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}
          >
            {de ? 'Diese Woche' : 'This week'} · {format(weekStart, 'MMM d')}–{format(weekEnd, 'd')}
          </span>
          {isLoading ? (
            <span
              className="num-mono text-[14px] animate-pulse"
              style={{ color: 'var(--color-ink-2)' }}
            >
              {de ? 'lädt…' : 'loading…'}
            </span>
          ) : (
            <div className="flex items-baseline gap-3 flex-wrap">
              <span
                className="num-display text-[22px] sm:text-[26px] leading-none"
                style={{ color: 'var(--color-ink)' }}
              >
                {totals.ridesDone} {de ? (totals.ridesDone === 1 ? 'Einheit' : 'Einheiten') : (totals.ridesDone === 1 ? 'session' : 'sessions')}
              </span>
              <span
                className="num-mono text-[13px]"
                style={{ color: 'var(--color-ink-2)' }}
              >
                · {formatHours(totals.hoursTotal)}
              </span>
              {totals.tssTotal > 0 && (
                <span
                  className="num-mono text-[13px]"
                  style={{ color: 'var(--color-ink-2)' }}
                >
                  · {Math.round(totals.tssTotal)} TSS
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Week-vs-4w-avg line — wired against real 28-day series.
          Uses formatHours + formatDelta from utils/format and toneFromPct + tokenForTone from utils/delta. */}
      {!isLoading && weekVsAvg !== null && (
        <p className="num-mono text-[12px] mt-1 mb-3" style={{ color: 'var(--color-muted)' }}>
          {formatHours(weekVsAvg.thisWeekSeconds)}
          {weekVsAvg.deltaPct != null && (
            <>
              {' · '}
              <span
                style={{ color: tokenForTone(toneFromPct(weekVsAvg.deltaPct, 'good')) }}
              >
                {formatDelta(weekVsAvg.thisWeekTSS, weekVsAvg.avgTSS)}
              </span>
              {de ? ' vs. Ø' : ' vs avg'}
            </>
          )}
        </p>
      )}

      {/* 7-day cell strip. Each cell = one day; background from zone tokens via
          intensityColor. Today gets tip-glow box-shadow instead of outline. */}
      <div className="grid grid-cols-7 gap-1.5 mt-4">
        {cells.map((cell, i) => {
          const { bg, border } = intensityColor(cell.isFuture ? 0 : cell.tss)
          const dayLetter = formatDate(cell.date, 'EEEEE', locale) // Mo Di Mi… in DE
          const dayNum = format(cell.date, 'd')
          return (
            <div
              key={i}
              className="flex flex-col items-center gap-1"
              title={
                cell.isFuture
                  ? `${format(cell.date, 'EEE, MMM d')} · ${upcomingWord}`
                  : cell.count === 0
                    ? `${format(cell.date, 'EEE, MMM d')} · ${restWord}`
                    : `${format(cell.date, 'EEE, MMM d')} · ${cell.count} ${de ? (cell.count > 1 ? 'Einheiten' : 'Einheit') : `session${cell.count > 1 ? 's' : ''}`} · ${Math.round(cell.tss)} TSS · ${formatHours(cell.durationSeconds)}`
              }
            >
              <span
                className="eyebrow text-[10.5px]"
                style={{
                  color: cell.isToday
                    ? 'var(--color-ink)'
                    : 'var(--color-muted)',
                  letterSpacing: '0.12em',
                  fontWeight: cell.isToday ? 600 : 400,
                }}
              >
                {dayLetter}
              </span>
              <div
                className="relative w-full aspect-square rounded-md flex items-center justify-center transition-transform"
                style={{
                  backgroundColor: bg,
                  border: `1px solid ${border}`,
                  opacity: cell.isFuture ? 0.55 : 1,
                  // Today highlight: tip-glow box-shadow (ring-tip-glow pattern)
                  boxShadow: cell.isToday
                    ? '0 0 0 1.5px var(--color-ink), 0 0 8px color-mix(in srgb, var(--color-ink) 30%, transparent)'
                    : 'none',
                  outlineOffset: cell.isToday ? 2 : 0,
                }}
              >
                <span
                  className="num-mono text-[11px]"
                  style={{
                    color:
                      cell.tss > 0 && !cell.isFuture
                        ? 'var(--color-ink)'
                        : 'var(--color-muted)',
                    fontWeight: cell.tss > 0 ? 500 : 400,
                  }}
                >
                  {dayNum}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
