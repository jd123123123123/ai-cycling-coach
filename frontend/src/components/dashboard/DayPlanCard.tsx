import { useState } from 'react'
import { format, parseISO, isToday, isFuture } from 'date-fns'
import { enUS, de } from 'date-fns/locale'
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
  /**
   * 'pill' — the compact square used in a 7-across grid (legacy).
   * 'row'  — a full-width agenda row (weekday + date, session name, duration,
   *          TSS) used as the primary Plan content. Both open the same detail sheet.
   */
  variant?: 'pill' | 'row'
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
// Localized agenda-row labels (de-DE / en-US), 24h-safe (no time component shown).
function weekdayShort(dateStr: string, isDe: boolean): string {
  const d = parsedDate(dateStr); if (!d) return ''
  return format(d, 'EEEE', { locale: isDe ? de : enUS })
}
function dayMonth(dateStr: string, isDe: boolean): string {
  const d = parsedDate(dateStr); if (!d) return ''
  return isDe ? format(d, 'd. MMM', { locale: de }) : format(d, 'MMM d', { locale: enUS })
}

/**
 * DayPlanCard — Phase 7.05 minimal day pill.
 * Above fold: weekday letter + intensity dot + duration only.
 * Tap opens SideSheet with IntervalRibbon + rationale + activity link.
 */
export default function DayPlanCard({ day, language, activity = null, hideDuration = false, variant = 'pill' }: DayPlanCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const t = useT()
  const { locale } = useLocale()
  const isDe = locale === 'de'

  const dateObj = parsedDate(day.date)
  const isFutureDay = dateObj ? isFuture(dateObj) && !isToday(dateObj) : false
  const isTodayDay = day.is_today
  const dotColor = CATEGORY_DOT_COLOR[day.category] ?? 'var(--color-zone-2)'
  const isRest = day.category === 'rest'
  const duration = day.duration_seconds_target ? formatHours(day.duration_seconds_target) : isRest ? (locale === 'de' ? 'Ruhe' : 'Rest') : '—'
  // Suppress a repeated placeholder duration on workout days; rest keeps "Ruhe".
  const showDuration = isRest || !hideDuration
  const adaptedBlocks = adaptIntervals(day.intervals)

  // ─── Agenda row variant — the primary Plan surface ──────────────────────────
  if (variant === 'row') {
    const sessionName = isRest
      ? (isDe ? 'Ruhetag' : 'Rest day')
      : (day.title || (isDe ? 'Geplant' : 'Planned'))
    // Real per-day stats only; a uniform placeholder duration reads "geplant".
    const showStats = !isRest && !hideDuration && day.duration_seconds_target != null
    const stubLabel = isDe ? 'geplant' : 'planned'

    return (
      <>
        <button
          type="button"
          onClick={() => !isFutureDay && setSheetOpen(true)}
          disabled={isFutureDay}
          className="flex items-center gap-3 w-full rounded-xl border text-left transition"
          style={{
            backgroundColor: isTodayDay ? 'var(--color-paper)' : 'var(--color-paper-2)',
            borderColor: isTodayDay ? 'var(--color-ink-2)' : 'var(--color-rule)',
            padding: '12px 14px',
            minHeight: 56,
            cursor: isFutureDay ? 'default' : 'pointer',
            opacity: isFutureDay ? 0.62 : 1,
          }}
          aria-label={`${weekdayShort(day.date, isDe)} ${dayMonth(day.date, isDe)} — ${sessionName}${showStats ? `, ${duration}, ${day.target_tss ?? ''} TSS` : ''}`}
        >
          {/* Date column */}
          <div className="flex flex-col shrink-0" style={{ width: 96 }}>
            <span className="eyebrow" style={{ color: isTodayDay ? 'var(--color-ink)' : 'var(--color-muted)', fontSize: 10, letterSpacing: '0.16em', fontWeight: isTodayDay ? 700 : 600 }}>
              {weekdayShort(day.date, isDe)}
            </span>
            <span className="num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 13 }}>
              {dayMonth(day.date, isDe)}
            </span>
          </div>

          {/* Intensity dot */}
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0 }} aria-hidden />

          {/* Session name — wrap to 2 lines (German titles are long); no ellipsis
             so distinct sessions stay distinguishable. */}
          <span
            className="flex-1 min-w-0 line-clamp-2"
            style={{ color: isRest ? 'var(--color-muted)' : 'var(--color-ink)', fontSize: 14.5, fontWeight: 500, lineHeight: 1.25, fontStyle: isRest ? 'italic' : 'normal' }}
          >
            {sessionName}
          </span>

          {/* Right-aligned stats */}
          <div className="flex items-center gap-3 shrink-0" style={{ color: 'var(--color-ink-2)' }}>
            {showStats ? (
              <>
                <span className="num-mono" style={{ fontSize: 13 }}>{duration}</span>
                {day.target_tss != null && (
                  <span className="num-mono" style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                    {day.target_tss}<span style={{ fontSize: 10, letterSpacing: '0.08em' }}> TSS</span>
                  </span>
                )}
              </>
            ) : (
              !isRest && <span style={{ fontSize: 12, color: 'var(--color-muted)', fontStyle: 'italic' }}>{stubLabel}</span>
            )}
          </div>
        </button>

        <SideSheet open={sheetOpen} onClose={() => setSheetOpen(false)} eyebrow={weekdayShort(day.date, isDe)} title={fullDateLabel(day.date)} width={560}>
          <div className="flex flex-col gap-5">
            {day.rationale && (
              <p className="text-[14px] leading-relaxed italic" style={{ color: 'var(--color-ink-2)' }}>{day.rationale}</p>
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
