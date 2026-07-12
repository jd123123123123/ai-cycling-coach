import { useMemo } from 'react'
import {
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  startOfWeek,
} from 'date-fns'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { usePlannedWorkouts } from '../../hooks/usePlannedWorkouts'
import type { ActivityRead, PlannedWorkout } from '../../api/dashboard'
import { useCountUp } from '../../hooks/useCountUp'
import { useLocale } from '../../contexts/LocaleContext'

// Planned-vs-actual dumbbell strip — the pattern no consumer app gets right.
// Each day is a short track with two markers: the planned duration and the
// actual duration, connected by a line so the drift is physically visible.
// We added this specifically because research surfaced TrainerRoad's "what-if
// swap" and Intervals.icu's PMC as the features serious cyclists name when
// they say "nothing else has this."

interface DayRow {
  date: Date
  isToday: boolean
  isFuture: boolean
  plannedMin: number
  actualMin: number
  plannedTitle: string | null
  status: 'none' | 'under' | 'match' | 'over'
}

function statusFor(planned: number, actual: number, isFuture: boolean): DayRow['status'] {
  if (planned === 0 && actual === 0) return 'none'
  if (isFuture) return 'none'
  if (planned === 0 && actual > 0) return 'over' // unplanned work — bonus
  if (actual === 0) return 'under'
  const ratio = actual / planned
  if (ratio < 0.75) return 'under'
  if (ratio > 1.25) return 'over'
  return 'match'
}

const statusColor: Record<DayRow['status'], string> = {
  none: 'var(--color-muted)',
  under: 'rgba(190, 124, 34, 0.95)',
  match: 'var(--color-forest-2)',
  over: 'var(--color-ink-blue)',
}

type GradeNoteKey =
  | 'grade_a_note'
  | 'grade_b_note'
  | 'grade_big_miss_note'
  | 'grade_over_note'
  | 'grade_mixed_note'

function grade(rows: DayRow[]): {
  pct: number
  letter: 'A' | 'B' | 'C' | 'D'
  noteKey: GradeNoteKey
  color: string
} | null {
  const eligible = rows.filter((r) => !r.isFuture && (r.plannedMin > 0 || r.actualMin > 0))
  if (eligible.length === 0) return null
  const plannedSum = eligible.reduce((s, r) => s + r.plannedMin, 0)
  const actualSum = eligible.reduce((s, r) => s + r.actualMin, 0)
  const pct = plannedSum > 0 ? Math.min(200, (actualSum / plannedSum) * 100) : 100
  let letter: 'A' | 'B' | 'C' | 'D' = 'D'
  if (pct >= 90 && pct <= 115) letter = 'A'
  else if (pct >= 75 && pct <= 130) letter = 'B'
  else if (pct >= 60) letter = 'C'
  const color =
    letter === 'A' || letter === 'B'
      ? 'var(--color-forest-2)'
      : letter === 'C'
        ? 'rgba(190, 124, 34, 0.95)'
        : 'var(--color-alert)'
  const noteKey: GradeNoteKey =
    letter === 'A'
      ? 'grade_a_note'
      : letter === 'B'
        ? 'grade_b_note'
        : pct < 60
          ? 'grade_big_miss_note'
          : pct > 115
            ? 'grade_over_note'
            : 'grade_mixed_note'
  return { pct: Math.round(pct), letter, noteKey, color }
}

function DayBar({ row, maxMin }: { row: DayRow; maxMin: number }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const plannedPct = maxMin > 0 ? (row.plannedMin / maxMin) * 100 : 0
  const actualPct = maxMin > 0 ? Math.min(100, (row.actualMin / maxMin) * 100) : 0
  const accent = statusColor[row.status]
  const hasContent = row.plannedMin > 0 || row.actualMin > 0
  return (
    <div
      className="grid items-center gap-3"
      style={{ gridTemplateColumns: '32px 1fr auto' }}
      title={
        row.plannedMin === 0 && row.actualMin === 0
          ? (de
              ? `${format(row.date, 'EEE MMM d')} · nichts geplant oder erfasst`
              : `${format(row.date, 'EEE MMM d')} · nothing planned or logged`)
          : (de
              ? `${format(row.date, 'EEE MMM d')} · geplant ${Math.round(row.plannedMin)} min · tatsächlich ${Math.round(row.actualMin)} min${row.plannedTitle ? ' · ' + row.plannedTitle : ''}`
              : `${format(row.date, 'EEE MMM d')} · planned ${Math.round(row.plannedMin)} min · actual ${Math.round(row.actualMin)} min${row.plannedTitle ? ' · ' + row.plannedTitle : ''}`)
      }
    >
      <span
        className="eyebrow"
        style={{
          color: row.isToday ? 'var(--color-ink)' : 'var(--color-muted)',
          letterSpacing: '0.18em',
          fontSize: 10,
          fontWeight: row.isToday ? 600 : 400,
        }}
      >
        {format(row.date, 'EEE').toUpperCase()}
      </span>
      <div
        className="relative h-5 rounded-full"
        style={{
          backgroundColor: 'var(--color-paper)',
          border: '1px solid var(--color-rule)',
        }}
      >
        {hasContent ? (
          <>
            {/* Connecting line between planned (hollow) and actual (filled). */}
            {row.plannedMin > 0 && row.actualMin > 0 && (
              <div
                className="absolute top-1/2 -translate-y-1/2 h-[2px]"
                style={{
                  left: `min(${plannedPct}%, ${actualPct}%)`,
                  width: `${Math.abs(actualPct - plannedPct)}%`,
                  backgroundColor: accent,
                  opacity: 0.5,
                }}
              />
            )}
            {/* Planned marker — hollow */}
            {row.plannedMin > 0 && (
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full"
                style={{
                  left: `calc(${plannedPct}% - 6px)`,
                  backgroundColor: 'transparent',
                  border: `1.5px solid ${accent}`,
                }}
              />
            )}
            {/* Actual marker — filled */}
            {row.actualMin > 0 && (
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full"
                style={{
                  left: `calc(${actualPct}% - 6px)`,
                  backgroundColor: accent,
                  boxShadow: row.isToday ? '0 0 0 2px var(--color-ink)' : 'none',
                }}
              />
            )}
          </>
        ) : (
          <span
            className="absolute inset-0 flex items-center justify-center eyebrow opacity-40"
            style={{ color: 'var(--color-muted)', fontSize: 10.5 }}
          >
            {row.isFuture ? (de ? 'geplant' : 'planned') : '—'}
          </span>
        )}
      </div>
      <span
        className="num-mono text-[11px] tabular-nums whitespace-nowrap"
        title={de ? 'tatsächlich / geplant (Minuten)' : 'actual / planned (minutes)'}
        style={{ color: 'var(--color-ink-2)', cursor: 'help' }}
      >
        {row.actualMin > 0 || row.plannedMin > 0
          ? `${Math.round(row.actualMin)} / ${Math.round(row.plannedMin)} min`
          : '—'}
      </span>
    </div>
  )
}

export default function ComplianceStrip() {
  const { locale, t } = useLocale()
  const de = locale === 'de'
  const today = new Date()
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 })

  const { data: actsData, isLoading: actsLoading } = useActivitiesRange(
    weekStart,
    weekEnd,
  )
  const { data: plannedData, isLoading: plannedLoading } = usePlannedWorkouts(
    weekStart,
    weekEnd,
  )

  const isLoading = actsLoading || plannedLoading

  const rows: DayRow[] = useMemo(() => {
    const activities: ActivityRead[] = actsData?.activities ?? []
    const planned: PlannedWorkout[] = plannedData?.planned_workouts ?? []
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd })

    return days.map((date) => {
      const isoDate = format(date, 'yyyy-MM-dd')
      const plannedDay = planned.filter((p) => p.date === isoDate)
      const plannedSec = plannedDay.reduce(
        (s, p) => s + (p.duration_seconds_target ?? 0),
        0,
      )
      const actualDay = activities.filter((a) =>
        isSameDay(new Date(a.started_at), date),
      )
      const actualSec = actualDay.reduce(
        (s, a) => s + (a.duration_seconds ?? 0),
        0,
      )
      const isToday = isSameDay(date, today)
      const isFuture = date > today && !isToday
      return {
        date,
        isToday,
        isFuture,
        plannedMin: plannedSec / 60,
        actualMin: actualSec / 60,
        plannedTitle:
          plannedDay[0]?.title ?? null,
        status: statusFor(plannedSec / 60, actualSec / 60, isFuture),
      }
    })
  }, [actsData, plannedData, weekStart, weekEnd, today])

  const gradeInfo = useMemo(() => grade(rows), [rows])
  const hasPlan = rows.some((r) => r.plannedMin > 0)

  const animatedPct = useCountUp(gradeInfo?.pct ?? 0, { durationMs: 900, skipZero: false })

  // Scale bars against the largest (planned or actual) minute value so the
  // dumbbells use the whole track. 30 min min so single-session days are visible.
  const maxMin = Math.max(
    30,
    ...rows.map((r) => Math.max(r.plannedMin, r.actualMin)),
  )

  // If the user hasn't planned the week, hide the card rather than show an
  // empty ghost. We only prescribe when we have something to prescribe.
  if (!isLoading && !hasPlan && !rows.some((r) => r.actualMin > 0)) return null

  return (
    <div
      className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      {/* Header row: grade letter BIG on left, compliance % + legend on right */}
      <div className="flex items-start gap-4">
        {/* Grade letter — the hero number. Should be unmissable. */}
        {gradeInfo ? (
          <div
            className="shrink-0 flex flex-col items-center leading-none"
            title={de
              ? 'Note aus Umsetzung: A 90–115 % · B 75–130 % · C ≥ 60 % · D < 60 %'
              : 'Grade from compliance: A 90–115% · B 75–130% · C ≥60% · D <60%'}
            style={{ animation: 'score-enter 600ms cubic-bezier(.22,1,.36,1) 100ms both', cursor: 'help' }}
          >
            <span
              className="num-display"
              style={{
                fontSize: 'clamp(52px, 7vw, 72px)',
                color: gradeInfo.color,
                lineHeight: 1,
                filter: `drop-shadow(0 0 16px color-mix(in srgb, ${gradeInfo.color} 35%, transparent))`,
              }}
            >
              {gradeInfo.letter}
            </span>
            <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10.5, letterSpacing: '0.2em', marginTop: 2 }}>
              {de ? 'NOTE' : 'GRADE'}
            </span>
          </div>
        ) : (
          <div className="shrink-0 w-14" />
        )}

        <div className="flex flex-col gap-1 min-w-0 flex-1 pt-1">
          <span className="eyebrow" style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}>
            {de ? 'Plan vs. tatsächlich · diese Woche' : 'Plan vs actual · this week'}
          </span>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className="num-display leading-none"
              style={{
                fontSize: 'clamp(20px, 2.8vw, 26px)',
                color: gradeInfo ? gradeInfo.color : 'var(--color-ink-2)',
              }}
            >
              {gradeInfo
                ? `${animatedPct}%`
                : hasPlan
                  ? (de ? 'Warten auf Einheit' : 'Awaiting work')
                  : (de ? 'Kein Plan' : 'No plan set')}
            </span>
            {gradeInfo && (
              <span className="text-[13px]" style={{ color: 'var(--color-ink-2)' }}>
                {de ? 'Umsetzung' : 'compliance'}
              </span>
            )}
          </div>
          {/* Legend pills */}
          <div className="flex items-center gap-3 mt-1 text-[10px]" style={{ color: 'var(--color-muted)' }}>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full border" style={{ borderColor: 'var(--color-ink-2)' }} aria-hidden />
              {de ? 'geplant' : 'planned'}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-ink)' }} aria-hidden />
              {de ? 'tatsächlich' : 'actual'}
            </span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div
          className="mt-4 h-24 rounded shimmer-bg"
          aria-hidden
        />
      ) : (
        <div className="flex flex-col gap-2 mt-4">
          {rows.map((r, i) => (
            <DayBar key={i} row={r} maxMin={maxMin} />
          ))}
        </div>
      )}

      {gradeInfo && (
        <p
          className="mt-3 text-[13px] leading-relaxed"
          style={{ color: 'var(--color-ink-2)' }}
        >
          {t(gradeInfo.noteKey)}
        </p>
      )}
    </div>
  )
}
