import { addDays, format } from 'date-fns'
import { useCoachBrief } from '../../hooks/useCoachBrief'
import { useT, useLocale } from '../../contexts/LocaleContext'
import type { TomorrowPlan, IntensityChip } from '../../api/coach'

// Intensity → human label + state color. Same vocabulary as the
// prescribed-workout card; ties tomorrow's tint to the same tone system
// the rest of the new cards use.
function chipLabel(chip: IntensityChip, locale: 'en' | 'de'): string {
  const en: Record<IntensityChip, string> = {
    recovery: 'Recovery',
    endurance: 'Endurance',
    tempo: 'Tempo',
    threshold: 'Threshold',
    vo2: 'VO₂max',
    race: 'Race',
  }
  const de: Record<IntensityChip, string> = {
    recovery: 'Erholung',
    endurance: 'Ausdauer',
    tempo: 'Tempo',
    threshold: 'Schwelle',
    vo2: 'VO₂max',
    race: 'Rennen',
  }
  return (locale === 'de' ? de : en)[chip]
}

const CHIP_TONE: Record<IntensityChip, 'good' | 'caution' | 'bad' | 'neutral'> = {
  recovery: 'good',
  endurance: 'good',
  tempo: 'neutral',
  threshold: 'caution',
  vo2: 'bad',
  race: 'bad',
}

const TONE_COLOR: Record<'good' | 'caution' | 'bad' | 'neutral', string> = {
  good: 'var(--color-good)',
  caution: 'var(--color-caution)',
  bad: 'var(--color-bad)',
  neutral: 'var(--color-ink-2)',
}

interface TomorrowCardProps {
  data: TomorrowPlan | null | undefined
}

/**
 * TomorrowCard — forward-looking sister card to the workout / hero cards.
 *
 * Visual treatment matches the rest of the new dashboard vocabulary:
 *   - tone-tinted background gradient
 *   - eyebrow row with weekday + date + "projected" indicator when the
 *     plan is picker-projected (no DB row)
 *   - serif italic headline showing the actual projected workout title
 *   - duration + TSS stat row (mono numerics, eyebrow labels)
 *   - the AI description as the body paragraph
 *
 * Tomorrow's `predicted_tss` and `intensity_chip` come from the brief;
 * the *title* (e.g. "Recovery spin — 60min") comes from
 * `evidence.tomorrow_planned_workout` so this card needs the brief data
 * pipe rather than a single prop — switched to reading the brief inline.
 */
export default function TomorrowCard({ data }: TomorrowCardProps) {
  const { data: brief } = useCoachBrief()
  const t = useT()
  const { locale } = useLocale()
  if (!data) return null

  const evidence = (brief?.evidence as Record<string, unknown> | undefined) ?? {}
  const planned = evidence.tomorrow_planned_workout as
    | { title?: string; category?: string; duration_minutes?: number; projected?: boolean; predicted_tss?: number }
    | undefined

  const tss = Math.round(
    (planned?.predicted_tss as number | undefined) ?? data.predicted_tss ?? 0,
  )
  const chip = (data.intensity_chip as IntensityChip) ?? 'endurance'
  const tone = CHIP_TONE[chip] ?? 'neutral'
  const color = TONE_COLOR[tone]
  const title =
    planned?.title ||
    (locale === 'de'
      ? `${chipLabel(chip, 'de') ?? 'Ausdauer'}-Tag`
      : `${chipLabel(chip, 'en') ?? 'Endurance'} day`)
  const duration = planned?.duration_minutes ?? null
  const tomorrow = addDays(new Date(), 1)
  const isProjected = planned?.projected === true

  return (
    <div
      className="rounded-[18px] p-5 sm:p-6 flex flex-col gap-3"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 6%, var(--color-paper-2))`,
        border: `1px solid color-mix(in srgb, ${color} 28%, var(--color-rule))`,
        backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${color} 5%, transparent) 0%, transparent 70%)`,
      }}
    >
      {/* Eyebrow */}
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className="eyebrow num-mono"
          style={{
            color,
            fontSize: 10,
            letterSpacing: '0.22em',
            fontWeight: 600,
          }}
        >
          {t('tomorrow_label')} · {format(tomorrow, 'EEE d MMM').toUpperCase()}
        </span>
        <span
          className="num-mono text-[11px] px-1.5 py-0.5 rounded-sm whitespace-nowrap"
          style={{
            color,
            border: `1px solid color-mix(in srgb, ${color} 35%, var(--color-rule))`,
          }}
        >
          {chipLabel(chip, locale) ?? chip}
        </span>
        {isProjected && (
          <span
            className="num-mono"
            style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.12em' }}
            title={locale === 'de' ? 'Projiziert aus dem Periodisierungs-Picker — noch keine geplante Einheit für morgen.' : 'Projected from the periodization picker — no scheduled session yet for tomorrow.'}
          >
            · {t('projected')}
          </span>
        )}
      </div>

      {/* Headline — the actual workout */}
      <h3
        className="leading-tight"
        style={{
          fontFamily: 'var(--font-serif, serif)',
          fontStyle: 'italic',
          fontSize: 'clamp(20px, 2.6vw, 26px)',
          color: 'var(--color-ink)',
        }}
      >
        {title}
      </h3>

      {/* Stat row */}
      <div className="flex items-baseline gap-5 flex-wrap">
        {duration != null && (
          <div className="flex flex-col">
            <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10.5, letterSpacing: '0.22em' }}>
              {t('duration').toUpperCase()}
            </span>
            <span className="num-mono leading-none mt-1" style={{ color: 'var(--color-ink)', fontSize: 18, fontWeight: 500 }}>
              {duration} min
            </span>
          </div>
        )}
        {tss > 0 && (
          <div className="flex flex-col">
            <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10.5, letterSpacing: '0.22em' }}>
              {t('target_tss').toUpperCase()}
            </span>
            <span className="num-mono leading-none mt-1" style={{ color, fontSize: 18, fontWeight: 500 }}>
              {tss}
            </span>
          </div>
        )}
      </div>

      {/* AI description */}
      {data.description && (
        <p
          className="text-[13px] sm:text-[14px] leading-relaxed mt-1"
          style={{ color: 'var(--color-ink-2)', maxWidth: '64ch' }}
        >
          {data.description}
        </p>
      )}
    </div>
  )
}
