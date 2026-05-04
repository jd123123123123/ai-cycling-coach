import { format, parseISO } from 'date-fns'
import { Bike, Dumbbell, PersonStanding } from 'lucide-react'
import IntervalRibbon from './IntervalRibbon'
import type { DayPlan, IntervalBlockOut } from '../../api/weeks'
import type { ResolvedBlock } from '../../api/coach'
import type { CoachLanguage } from '../../contexts/LanguageContext'

interface DayPlanCardProps {
  day: DayPlan
  language: CoachLanguage
}

// Sport → icon mapping (no new dependencies — lucide is already in tree)
function SportIcon({ sport }: { sport: string }) {
  const size = 14
  const strokeWidth = 1.8
  if (sport === 'running') {
    return <PersonStanding size={size} strokeWidth={strokeWidth} style={{ color: 'var(--color-muted)' }} />
  }
  if (sport === 'strength') {
    return <Dumbbell size={size} strokeWidth={strokeWidth} style={{ color: 'var(--color-muted)' }} />
  }
  // default: cycling
  return <Bike size={size} strokeWidth={strokeWidth} style={{ color: 'var(--color-muted)' }} />
}

// Category → display label (eyebrow) — technical
const CATEGORY_LABEL_TECHNICAL: Record<string, string> = {
  rest:       'REST',
  recovery:   'RECOVERY',
  endurance:  'ENDURANCE',
  tempo:      'TEMPO',
  sweet_spot: 'SWEET SPOT',
  threshold:  'THRESHOLD',
  vo2:        'VO₂',
}

// Category → display label (eyebrow) — simple mode
const CATEGORY_LABEL_SIMPLE: Record<string, string> = {
  rest:       'REST',
  recovery:   'EASY SPIN',
  endurance:  'CHILL RIDE',
  tempo:      'STEADY PUSH',
  sweet_spot: 'FOCUSED EFFORT',
  threshold:  'HARD RIDE',
  vo2:        'HARD INTERVALS',
}

function categoryLabel(category: string, language: CoachLanguage): string {
  if (language === 'simple') {
    return CATEGORY_LABEL_SIMPLE[category] ?? category.toUpperCase().replace('_', ' ')
  }
  return CATEGORY_LABEL_TECHNICAL[category] ?? category.toUpperCase().replace('_', ' ')
}

/**
 * Adapt IntervalBlockOut (weeks API shape) → ResolvedBlock (IntervalRibbon shape).
 *
 * IntervalBlockOut only has duration_seconds / power_target_pct_ftp / zone.
 * We synthesise the missing fields so IntervalRibbon works without modification.
 * The ribbon only uses: duration_s, target_pct_ftp, zone (for height + color).
 * watts + rpe are used by hover tooltips — we approximate them.
 */
function adaptIntervals(intervals: IntervalBlockOut[]): ResolvedBlock[] {
  return intervals.map((b, i) => {
    const pct = b.power_target_pct_ftp ?? 0.65
    return {
      name: `Segment ${i + 1}`,
      duration_s: b.duration_seconds,
      target_pct_ftp: pct,
      target_watts_low: Math.round(pct * 200 * 0.95),  // rough approximation; hover tooltip only
      target_watts_high: Math.round(pct * 200 * 1.05),
      zone: b.zone,
      rpe: Math.round(b.zone * 1.2),  // rough rpe from zone
    }
  })
}

function formatMinutesShort(seconds: number | null): string {
  if (!seconds) return '—'
  const m = Math.round(seconds / 60)
  return `~${m} min`
}

/**
 * DayPlanCard — per-day card with sport icon, category eyebrow,
 * IntervalRibbon, TSS chip, and inline per-day rationale.
 *
 * Hard rails:
 * - No new color literals — all via CSS custom properties.
 * - No new dependencies — IntervalRibbon + lucide (already in tree).
 * - Rest day: no ribbon, no TSS, "Recovery is part of the work." copy.
 */
export default function DayPlanCard({ day, language }: DayPlanCardProps) {
  const technical = language === 'technical'
  const isRest = day.category === 'rest'

  let dayLabel = ''
  try {
    const d = parseISO(day.date)
    dayLabel = format(d, 'EEE · d')
  } catch {
    dayLabel = day.date
  }

  const label = categoryLabel(day.category, language)
  const adaptedBlocks = adaptIntervals(day.intervals)

  return (
    <div
      className={[
        'rounded-lg p-4 border transition',
        day.is_today ? 'ring-2 ring-offset-1' : '',
      ].join(' ')}
      style={{
        backgroundColor: 'var(--color-paper-2)',
        borderColor: 'var(--color-rule)',
        ...(day.is_today
          ? {
              ringColor: 'var(--color-forest-2)',
              outline: '2px solid var(--color-forest-2)',
              outlineOffset: '2px',
            }
          : {}),
      }}
    >
      {/* Top row — day label + sport icon */}
      <div className="flex items-center justify-between mb-2">
        <span
          className="eyebrow"
          style={{ color: 'var(--color-muted)' }}
        >
          {dayLabel}
        </span>
        {!isRest && <SportIcon sport={day.sport} />}
      </div>

      {/* Category eyebrow */}
      <p
        className="eyebrow mb-1"
        style={{ color: 'var(--color-ink-2)', fontSize: 9, letterSpacing: '0.18em' }}
      >
        {label}
      </p>

      {isRest ? (
        /* Rest day shape — no ribbon, no TSS, positive copy */
        <div className="flex flex-col items-center justify-center py-4 gap-1">
          <span
            className="eyebrow"
            style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}
          >
            REST
          </span>
          <p
            className="text-[12px] text-center mt-1"
            style={{ color: 'var(--color-ink-2)' }}
          >
            Recovery is part of the work.
          </p>
        </div>
      ) : (
        <>
          {/* Title */}
          <p
            className="text-[15px] font-medium mb-3"
            style={{ color: 'var(--color-ink)' }}
          >
            {day.title}
          </p>

          {/* IntervalRibbon */}
          {adaptedBlocks.length > 0 && (
            <div className="mb-3">
              <IntervalRibbon
                blocks={adaptedBlocks}
                className="h-16"
                language={language}
              />
            </div>
          )}

          {/* Footer row — TSS chip (technical) or duration (simple) */}
          <div className="flex items-center justify-end mt-2">
            {technical ? (
              day.target_tss != null && (
                <span
                  className="eyebrow num-mono"
                  style={{ color: 'var(--color-ink-2)', fontSize: 11 }}
                >
                  {day.target_tss} TSS
                </span>
              )
            ) : (
              <span
                className="eyebrow num-mono"
                style={{ color: 'var(--color-ink-2)', fontSize: 11 }}
              >
                {formatMinutesShort(day.duration_seconds_target)}
              </span>
            )}
          </div>

          {/* Per-day rationale */}
          {day.rationale && (
            <p
              className="text-[13px] italic mt-2"
              style={{ color: 'var(--color-ink-2)' }}
            >
              {day.rationale}
            </p>
          )}
        </>
      )}
    </div>
  )
}
