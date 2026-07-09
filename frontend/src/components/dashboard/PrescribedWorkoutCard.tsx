import { useMemo, useState } from 'react'
import { Clock, Zap, ChevronRight, Moon, Target, Flame } from 'lucide-react'
import type { AlternateWorkout, PrescribedWorkout } from '../../api/coach'
import IntervalRibbon from './IntervalRibbon'
import { useLanguage } from '../../contexts/LanguageContext'
import { simpleTitleFor, translateCoach } from '../../utils/coachLanguage'
import { useT, useLocale } from '../../contexts/LocaleContext'
import type { StringKey } from '../../i18n/strings'

// Category → intensity label mapping. Paired pairs of %FTP ranges come from
// Coggan's power zone table (the de facto standard cited across TrainingPeaks,
// Friel, and USAC). These feel-matched labels are what riders want at a glance.
// Category → translation-key + FTP range. Range strings stay non-localised
// (FTP / numeric bands are international vocabulary).
const CATEGORY_INTENSITY: Record<
  string,
  { key: StringKey; range: string }
> = {
  recovery:   { key: 'cat_recovery',   range: '<55% FTP' },
  endurance:  { key: 'cat_endurance',  range: '56–75% FTP' },
  tempo:      { key: 'cat_tempo',      range: '76–87% FTP' },
  sweet_spot: { key: 'cat_sweet_spot', range: '88–94% FTP' },
  threshold:  { key: 'cat_threshold',  range: '95–105% FTP' },
  vo2:        { key: 'cat_vo2',        range: '106–120% FTP' },
  anaerobic:  { key: 'cat_anaerobic',  range: '>120% FTP' },
  rest:       { key: 'cat_rest',       range: '—' },
}

function MetricTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Target
  label: string
  value: string
  sub?: string
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 min-w-0"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <div
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
        style={{ backgroundColor: 'rgba(48, 108, 64, 0.10)' }}
        aria-hidden
      >
        <Icon size={13} strokeWidth={2} style={{ color: 'var(--color-forest-2)' }} />
      </div>
      <div className="flex flex-col min-w-0">
        <span
          className="eyebrow"
          style={{
            color: 'var(--color-muted)',
            fontSize: 10.5,
            letterSpacing: '0.22em',
          }}
        >
          {label}
        </span>
        <span
          className="num-mono leading-tight truncate"
          style={{ color: 'var(--color-ink)', fontSize: 14, fontWeight: 500 }}
          title={sub ? `${value} · ${sub}` : value}
        >
          {value}
          {sub && (
            <span
              className="ml-1 opacity-70"
              style={{ fontSize: 11, fontWeight: 400 }}
            >
              {sub}
            </span>
          )}
        </span>
      </div>
    </div>
  )
}

interface PrescribedWorkoutCardProps {
  workout: PrescribedWorkout
  alternates: AlternateWorkout[]
  /** Optional — if alternates carry a full PrescribedWorkout we can swap the ribbon in place.
   *  For now we only have (label, one_liner, template_id) so alternate tap shows a compact preview. */
  alternatesPreview?: Record<string, PrescribedWorkout | undefined>
}

function efText(pw: PrescribedWorkout): string | null {
  const range = pw.predicted_ef_range
  if (!range || range[0] === 0 || range[1] === 0) return null
  return `est. ${range[0].toFixed(2)}–${range[1].toFixed(2)} EF`
}

function summaryLine(pw: PrescribedWorkout, simpleMode: boolean, de = false): string {
  if (simpleMode) {
    // Plain-language summary: "About 60 min · easy pace" style.
    // "Effort phrase" maps category → feel instead of wattage.
    const category = pw.category || ''
    const feelByCategory: Record<string, string> = de ? {
      recovery:   'lockeres Tempo',
      endurance:  'ruhiges Tempo',
      tempo:      'gleichmäßiger Druck',
      sweet_spot: 'fokussierter Einsatz',
      threshold:  'hartes Tempo',
      vo2:        'harte Intervalle',
      anaerobic:  'volle Sprints',
      rest:       'erholen',
    } : {
      recovery:   'chill pace',
      endurance:  'easy pace',
      tempo:      'steady push',
      sweet_spot: 'focused effort',
      threshold:  'hard pace',
      vo2:        'hard intervals',
      anaerobic:  'all-out sprints',
      rest:       'rest up',
    }
    const feel = feelByCategory[category] ?? (de ? 'gleichmäßiges Tempo' : 'steady pace')
    return `${de ? 'Etwa' : 'About'} ${pw.duration_minutes} min · ${feel}`
  }
  const parts: string[] = [`${pw.duration_minutes} min`]
  parts.push(`${Math.round(pw.predicted_tss)} TSS`)
  const ef = efText(pw)
  if (ef) parts.push(ef)
  return parts.join(' · ')
}

export default function PrescribedWorkoutCard({
  workout,
  alternates,
  alternatesPreview,
}: PrescribedWorkoutCardProps) {
  // Which card is showing — the prescribed workout (default) or an alternate.
  // We only render the alternates' templates as compact previews for now.
  const [activeAlt, setActiveAlt] = useState<string | null>(null)
  const { language } = useLanguage()
  const { locale } = useLocale()
  const t = useT()
  const simpleMode = language === 'simple'

  const displayed = useMemo<PrescribedWorkout>(() => {
    if (activeAlt && alternatesPreview?.[activeAlt]) {
      return alternatesPreview[activeAlt] as PrescribedWorkout
    }
    return workout
  }, [activeAlt, alternatesPreview, workout])

  const isAlternate = activeAlt !== null
  // In simple mode we hide the framework chip (e.g. "Coggan Z5 · Friel Build 2")
  // entirely — it's the densest piece of jargon on the card.
  const frameworkChip = simpleMode ? null : displayed.framework_cited
  // Title: in simple mode, force-simplify a technical-sounding title to the
  // category map. The backend's rule-based fallback already does this, but
  // the LLM path may slip jargon through — this is the belt-and-braces.
  const titleToRender = simpleMode
    ? simpleTitleFor(displayed.category, displayed.title, locale)
    : displayed.title

  return (
    <div
      data-prescribed-workout-card
      className="paper-grain rounded-[18px] p-5 sm:p-6 flex flex-col gap-4 min-w-0"
      style={{
        backgroundColor: 'var(--color-paper)',
        border: '1px solid var(--color-rule)',
        boxShadow: '0 10px 30px -22px rgba(20, 24, 17, 0.35)',
      }}
    >
      {/* Header row — eyebrow + framework chip */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1 min-w-0">
          <span
            className="eyebrow"
            style={{ color: 'var(--color-forest)' }}
          >
            {isAlternate
              ? translateCoach('workoutCard.alternateEyebrow', language, locale)
              : translateCoach('workoutCard.todayEyebrow', language, locale)}
          </span>
          <h3
            className="num-display leading-tight dashboard-break-words"
            style={{
              fontSize: 'clamp(22px, 3vw, 30px)',
              color: 'var(--color-ink)',
              fontVariationSettings: '"opsz" 96, "SOFT" 30',
            }}
          >
            {titleToRender}
          </h3>
        </div>
        {frameworkChip && (
          <span
            className="num-mono text-[11px] px-2 py-1 rounded-sm whitespace-nowrap"
            style={{
              color: 'var(--color-ink-2)',
              backgroundColor: 'var(--color-paper-2)',
              border: '1px solid var(--color-rule)',
            }}
            title={frameworkChip}
          >
            {frameworkChip}
          </span>
        )}
      </div>

      {/* Headline metrics — the three numbers a rider actually needs at a
         glance: time commitment, target zone (framework-backed), load. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <MetricTile
          icon={Clock}
          label={t('metric_duration')}
          value={`${displayed.duration_minutes}`}
          sub="min"
        />
        <MetricTile
          icon={Target}
          label={t('metric_target')}
          value={(() => {
            const c = displayed.category ? CATEGORY_INTENSITY[displayed.category] : undefined
            return c ? t(c.key) : t('steady_default')
          })()}
          sub={
            simpleMode
              ? undefined
              : (displayed.category ? CATEGORY_INTENSITY[displayed.category] : undefined)?.range
          }
        />
        <MetricTile
          icon={Flame}
          label={simpleMode ? t('metric_effort') : t('metric_load')}
          value={`${Math.round(displayed.predicted_tss)}`}
          sub={simpleMode ? 'pts' : 'TSS'}
        />
      </div>

      {/* Interval ribbon */}
      <IntervalRibbon
        blocks={displayed.blocks}
        summary={summaryLine(displayed, simpleMode, locale === 'de')}
        language={language}
      />

      {/* Why this workout */}
      {displayed.why_this_workout && (
        <div
          className="flex gap-2.5 pt-3"
          style={{ borderTop: '1px solid var(--color-rule)' }}
        >
          <span
            className="inline-block w-[3px] rounded-sm flex-shrink-0"
            style={{ backgroundColor: 'var(--color-forest)' }}
            aria-hidden
          />
          <div className="flex flex-col gap-1 min-w-0">
            <span
              className="eyebrow"
              style={{ color: 'var(--color-forest)' }}
            >
              {translateCoach('brief.whyThisWorkoutHeading', language, locale)}
            </span>
            <p
              className="text-[14px] leading-relaxed dashboard-break-words"
              style={{ color: 'var(--color-ink-2)', maxWidth: '62ch' }}
            >
              {displayed.why_this_workout}
            </p>
          </div>
        </div>
      )}

      {/* Alternates */}
      {alternates.length > 0 && (
        <div
          className="pt-3 flex flex-col gap-2"
          style={{ borderTop: '1px solid var(--color-rule)' }}
        >
          <span className="eyebrow" style={{ color: 'var(--color-muted)' }}>
            {translateCoach('workoutCard.alternatesHeading', language, locale)}
          </span>
          <div className="flex flex-wrap gap-2">
            {alternates.map((alt) => {
              const selected = activeAlt === alt.label
              const isRecover = alt.label === 'recover'
              return (
                <button
                  key={alt.label}
                  type="button"
                  onClick={() => setActiveAlt(selected ? null : alt.label)}
                  className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[12px] transition-all min-h-[40px]"
                  style={{
                    color: selected ? 'var(--color-paper)' : 'var(--color-ink-2)',
                    backgroundColor: selected ? 'var(--color-ink)' : 'transparent',
                    border: selected
                      ? '1px solid var(--color-ink)'
                      : '1px solid var(--color-rule)',
                  }}
                >
                  {isRecover ? (
                    <Moon size={12} strokeWidth={1.8} />
                  ) : (
                    <Clock size={12} strokeWidth={1.8} />
                  )}
                  <span className="dashboard-break-words text-left">
                    {alt.one_liner}
                  </span>
                </button>
              )
            })}
          </div>
          {isAlternate && (
            <button
              type="button"
              onClick={() => setActiveAlt(null)}
              className="eyebrow underline underline-offset-2 self-start"
              style={{ color: 'var(--color-muted)' }}
            >
              {t('back_to_prescribed')}
            </button>
          )}
        </div>
      )}

      {/* Primary CTA + snooze */}
      <div
        className="flex items-center gap-2 flex-wrap pt-3"
        style={{ borderTop: '1px solid var(--color-rule)' }}
      >
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium min-h-[40px]"
          style={{
            color: 'var(--color-paper)',
            backgroundColor: 'var(--color-forest)',
            border: '1px solid var(--color-forest)',
          }}
          title={t('push_to_garmin_soon')}
        >
          <Zap size={13} strokeWidth={2} />
          <span>{translateCoach('workoutCard.startCta', language, locale)}</span>
          <ChevronRight size={13} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[12px] min-h-[40px]"
          style={{
            color: 'var(--color-ink-2)',
            backgroundColor: 'transparent',
            border: '1px solid var(--color-rule)',
          }}
          title={t('replan_tomorrow_soon')}
        >
          <span>{t('snooze_one_day')}</span>
        </button>
      </div>
    </div>
  )
}
