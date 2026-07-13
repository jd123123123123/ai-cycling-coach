import { useState } from 'react'
import { format, parseISO, isToday, isFuture } from 'date-fns'
import { SideSheet } from '../ui/SideSheet'
import IntervalRibbon from './IntervalRibbon'
import type { DayPlan, IntervalBlockOut } from '../../api/weeks'
import type { ResolvedBlock } from '../../api/coach'
import type { CoachLanguage } from '../../contexts/LanguageContext'
import type { ActivityRead } from '../../api/dashboard'
import { formatHours } from '../../utils/format'
import { useT, useLocale } from '../../contexts/LocaleContext'

interface DayPlanCardProps {
  day: DayPlan
  language: CoachLanguage
  /** Pass-through activity so card doesn't refetch — WeekTab passes the matching activity from useActivitiesRange */
  activity?: ActivityRead | null
  /**
   * When true the per-day planned duration is a uniform placeholder (every
   * workout day shows the same value), so we hide the number rather than print
   * a repeated "1.5h" stub across the strip. Rest days still read "Ruhe".
   */
  hideDuration?: boolean
}

// Category → zone token (no new color literals)
const CATEGORY_DOT_COLOR: Record<string, string> = {
  rest: 'var(--color-zone-2)', recovery: 'var(--color-zone-2)',
  endurance: 'var(--color-zone-2)', tempo: 'var(--color-zone-3)',
  sweet_spot: 'var(--color-zone-3)', threshold: 'var(--color-zone-4)',
  vo2: 'var(--color-zone-5)',
}

function adaptIntervals(intervals: IntervalBlockOut[]): ResolvedBlock[] {
  return intervals.map((b, i) => {
    const pct = b.power_target_pct_ftp ?? 0.65
    return {
      name: `Segment ${i + 1}`,
      duration_s: b.duration_seconds,
      target_pct_ftp: pct,
      target_watts_low: Math.round(pct * 200 * 0.95),
      target_watts_high: Math.round(pct * 200 * 1.05),
      zone: b.zone,
      rpe: Math.round(b.zone * 1.2),
      cadence_low: null,
      cadence_high: null,
    }
  })
}

function parsedDate(dateStr: string) { try { return parseISO(dateStr) } catch { return null } }
function weekdayLetter(dateStr: string): string { return parsedDate(dateStr) ? format(parsedDate(dateStr)!, 'EEEEE') : '?' }
function dateNumber(dateStr: string): string { return parsedDate(dateStr) ? format(parsedDate(dateStr)!, 'd') : '' }
function fullDateLabel(dateStr: string): string { return parsedDate(dateStr) ? format(parsedDate(dateStr)!, 'EEEE, MMMM d') : dateStr }

/**
 * DayPlanCard — Phase 7.05 minimal day pill.
 * Above fold: weekday letter + intensity dot + duration only.
 * Tap opens SideSheet with IntervalRibbon + rationale + activity link.
 */
export default function DayPlanCard({ day, language, activity = null, hideDuration = false }: DayPlanCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const t = useT()
  const { locale } = useLocale()

  const dateObj = parsedDate(day.date)
  const isFutureDay = dateObj ? isFuture(dateObj) && !isToday(dateObj) : false
  const isTodayDay = day.is_today
  const dotColor = CATEGORY_DOT_COLOR[day.category] ?? 'var(--color-zone-2)'
  const isRest = day.category === 'rest'
  const duration = day.duration_seconds_target ? formatHours(day.duration_seconds_target) : isRest ? (locale === 'de' ? 'Ruhe' : 'Rest') : '—'
  // Suppress a repeated placeholder duration on workout days; rest keeps "Ruhe".
  const showDuration = isRest || !hideDuration
  const adaptedBlocks = adaptIntervals(day.intervals)

  return (
    <>
      <button
        type="button"
        onClick={() => !isFutureDay && setSheetOpen(true)}
        disabled={isFutureDay}
        className="flex flex-col items-center justify-center gap-1 rounded-lg border transition"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          borderColor: 'var(--color-rule)',
          padding: '10px 4px',
          minHeight: 72,
          cursor: isFutureDay ? 'default' : 'pointer',
          opacity: isFutureDay ? 0.55 : 1,
          pointerEvents: isFutureDay ? 'none' : undefined,
          textAlign: 'center',
          width: '100%',
          ...(isTodayDay ? { outline: '1.5px solid var(--color-ink)', outlineOffset: '2px' } : {}),
        }}
        aria-label={`${fullDateLabel(day.date)} — ${day.category}, ${duration}`}
      >
        <span className="eyebrow" style={{ color: isTodayDay ? 'var(--color-ink)' : 'var(--color-muted)', fontSize: 10, letterSpacing: '0.18em', fontWeight: isTodayDay ? 700 : undefined }}>
          {weekdayLetter(day.date)}
        </span>
        <span className="num-mono" style={{ color: 'var(--color-muted)', fontSize: 10 }}>
          {dateNumber(day.date)}
        </span>
        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0 }} aria-hidden />
        {showDuration && (
          <span className="num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10 }}>
            {duration}
          </span>
        )}
      </button>

      <SideSheet open={sheetOpen} onClose={() => setSheetOpen(false)} eyebrow={weekdayLetter(day.date)} title={fullDateLabel(day.date)} width={560}>
        <div className="flex flex-col gap-5">
          {day.rationale && (
            <p className="text-[14px] leading-relaxed italic" style={{ color: 'var(--color-ink-2)' }}>
              {day.rationale}
            </p>
          )}

          {day.category !== 'rest' && (
            <div>
              <p className="eyebrow mb-2" style={{ color: 'var(--color-muted)' }}>{t('workout_structure_eyebrow')}</p>
              <IntervalRibbon blocks={adaptedBlocks} className="h-16" language={language} />
            </div>
          )}

          {day.target_tss != null && (
            <div className="flex items-center gap-2">
              <span className="eyebrow" style={{ color: 'var(--color-muted)' }}>{t('target_tss_eyebrow')}</span>
              <span className="num-mono text-[14px]" style={{ color: 'var(--color-ink)' }}>{day.target_tss}</span>
            </div>
          )}

          {activity ? (
            <p className="text-[13px]" style={{ color: 'var(--color-ink-2)' }}>
              <span className="eyebrow" style={{ color: 'var(--color-muted)', marginRight: 6 }}>{t('activity_eyebrow')}</span>
              {activity.title ?? t('untitled_activity')}
              {activity.duration_seconds && <span style={{ marginLeft: 6, color: 'var(--color-muted)' }}>· {formatHours(activity.duration_seconds)}</span>}
            </p>
          ) : (
            <p className="text-[13px] italic" style={{ color: 'var(--color-muted)' }}>{t('no_activity_logged')}</p>
          )}
        </div>
      </SideSheet>
    </>
  )
}
