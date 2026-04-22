/**
 * WeekStrip — weekly activity strip.
 *
 * Supports two variants:
 *   'full' (default): full card with totals header + 7-cell grid (existing behavior)
 *   'mini': compact 7-dot strip, ≤ 80px tall. Used in TodayTab above-the-fold.
 *           Dot click: navigates to ?tab=plan.
 *           TODO(future): dot click opens SideSheet for completed activity.
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
} from 'date-fns'
import { useSearchParams } from 'react-router-dom'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import type { ActivityRead } from '../../api/dashboard'

interface DayCell {
  date: Date
  tss: number
  durationSeconds: number
  count: number
  isFuture: boolean
  isToday: boolean
}

function intensityColor(tss: number): { bg: string; border: string } {
  if (tss <= 0) {
    return {
      bg: 'var(--color-paper)',
      border: 'var(--color-rule)',
    }
  }
  if (tss < 50) {
    // Easy / recovery — soft forest tint
    return { bg: 'rgba(48, 108, 64, 0.18)', border: 'rgba(48, 108, 64, 0.40)' }
  }
  if (tss < 100) {
    // Endurance — mid forest
    return { bg: 'rgba(48, 108, 64, 0.38)', border: 'rgba(48, 108, 64, 0.70)' }
  }
  if (tss < 150) {
    // Hard / threshold — amber
    return { bg: 'rgba(190, 124, 34, 0.45)', border: 'rgba(190, 124, 34, 0.80)' }
  }
  // Peak / overreach — alert red
  return { bg: 'rgba(138, 29, 29, 0.48)', border: 'rgba(138, 29, 29, 0.85)' }
}

/** Mini variant: color-coded 10-12px dots */
function miniDotColor(
  cell: DayCell,
): { bg: string; outline: boolean } {
  if (cell.count > 0 && !cell.isFuture) {
    // Completed session — use intensity color from TSS
    const { bg } = intensityColor(cell.tss)
    return { bg, outline: cell.isToday }
  }
  if (cell.isToday) {
    return { bg: 'var(--color-paper-2)', outline: true }
  }
  // Rest day or future
  return { bg: 'var(--color-rule)', outline: false }
}

function formatHours(seconds: number): string {
  if (seconds <= 0) return '0 h'
  const hours = seconds / 3600
  if (hours < 1) return `${Math.round(seconds / 60)} min`
  return hours < 10 ? `${hours.toFixed(1)} h` : `${Math.round(hours)} h`
}

interface WeekStripProps {
  /**
   * 'full' (default): full card with totals header + 7-cell grid.
   * 'mini': compact 7-dot row ≤ 80px tall, used above-the-fold on TodayTab.
   */
  variant?: 'mini' | 'full'
}

export default function WeekStrip({ variant = 'full' }: WeekStripProps = {}) {
  const now = new Date()
  // Monday-start: cycling training weeks canonically run Mon→Sun (Coggan PMC,
  // TrainingPeaks, etc.).
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })

  const { data, isLoading } = useActivitiesRange(weekStart, weekEnd)
  const [, setSearchParams] = useSearchParams()

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

  // ── Mini variant ────────────────────────────────────────────────────────────
  if (variant === 'mini') {
    return (
      <div
        className="paper-grain rounded-[16px] px-4 py-3"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          border: '1px solid var(--color-rule)',
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span
            className="eyebrow"
            style={{ color: 'var(--color-muted)', fontSize: 9, letterSpacing: '0.22em' }}
          >
            {format(weekStart, 'MMM d')}–{format(weekEnd, 'd')}
          </span>
          {!isLoading && (
            <span
              className="num-mono text-[9px]"
              style={{ color: 'var(--color-muted)' }}
            >
              · {totals.ridesDone} {totals.ridesDone === 1 ? 'session' : 'sessions'}
            </span>
          )}
        </div>

        {/* 7-dot row */}
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((cell, i) => {
            const { bg, outline } = miniDotColor(cell)
            const dayLetter = format(cell.date, 'EEEEE') // M T W T F S S
            return (
              <button
                key={i}
                type="button"
                title={
                  cell.isFuture
                    ? `${format(cell.date, 'EEE, MMM d')} · upcoming`
                    : cell.count === 0
                      ? `${format(cell.date, 'EEE, MMM d')} · rest`
                      : `${format(cell.date, 'EEE, MMM d')} · ${cell.count} session${cell.count > 1 ? 's' : ''}`
                }
                onClick={() => setSearchParams({ tab: 'plan' }, { replace: true })}
                aria-label={`${format(cell.date, 'EEEE, MMM d')} — tap to view plan`}
                className="flex flex-col items-center gap-0.5 focus:outline-none"
              >
                <span
                  className="eyebrow"
                  style={{
                    fontSize: 9,
                    color: cell.isToday ? 'var(--color-ink)' : 'var(--color-muted)',
                    letterSpacing: '0.1em',
                    fontWeight: cell.isToday ? 600 : 400,
                  }}
                >
                  {dayLetter}
                </span>
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: bg,
                    border: `1px solid ${outline ? 'var(--color-ink)' : 'rgba(0,0,0,0.08)'}`,
                    outlineOffset: 2,
                    opacity: cell.isFuture ? 0.4 : 1,
                    boxShadow: outline ? `0 0 0 1.5px var(--color-ink)` : undefined,
                  }}
                />
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Full variant (original) ─────────────────────────────────────────────────
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
            This week · {format(weekStart, 'MMM d')}–{format(weekEnd, 'd')}
          </span>
          {isLoading ? (
            <span
              className="num-mono text-[14px] animate-pulse"
              style={{ color: 'var(--color-ink-2)' }}
            >
              loading…
            </span>
          ) : (
            <div className="flex items-baseline gap-3 flex-wrap">
              <span
                className="num-display text-[22px] sm:text-[26px] leading-none"
                style={{ color: 'var(--color-ink)' }}
              >
                {totals.ridesDone} {totals.ridesDone === 1 ? 'session' : 'sessions'}
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

      {/* 7-day cell strip. Each cell = one day; size scales with load via
          intensity color. Today gets a thicker outline. Upcoming days render
          hollow so the strip reads as a progress map. */}
      <div className="grid grid-cols-7 gap-1.5 mt-4">
        {cells.map((cell, i) => {
          const { bg, border } = intensityColor(cell.isFuture ? 0 : cell.tss)
          const dayLetter = format(cell.date, 'EEEEE') // M, T, W, T, F, S, S
          const dayNum = format(cell.date, 'd')
          return (
            <div
              key={i}
              className="flex flex-col items-center gap-1"
              title={
                cell.isFuture
                  ? `${format(cell.date, 'EEE, MMM d')} · upcoming`
                  : cell.count === 0
                    ? `${format(cell.date, 'EEE, MMM d')} · rest`
                    : `${format(cell.date, 'EEE, MMM d')} · ${cell.count} session${cell.count > 1 ? 's' : ''} · ${Math.round(cell.tss)} TSS · ${formatHours(cell.durationSeconds)}`
              }
            >
              <span
                className="eyebrow text-[9px]"
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
                  outline: cell.isToday ? `2px solid var(--color-ink)` : 'none',
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
