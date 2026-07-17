import { useMemo, useState } from 'react'
import { Clock, Zap, ChevronRight, Moon, Target, Flame } from 'lucide-react'
import type { AlternateWorkout, PrescribedWorkout, ResolvedBlock } from '../../api/coach'
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
      className="flex flex-col gap-1 rounded-[14px] px-3 py-2.5 min-w-0"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon size={12} strokeWidth={2} style={{ color: 'var(--color-forest-2)' }} aria-hidden />
        <span
          className="eyebrow truncate"
          style={{
            color: 'var(--color-muted)',
            fontSize: 9.5,
            letterSpacing: '0.12em',
          }}
        >
          {label}
        </span>
      </div>
      <span
        className="leading-tight truncate"
        style={{ color: 'var(--color-ink)', fontSize: 15, fontWeight: 600 }}
        title={sub ? `${value} · ${sub}` : value}
      >
        {value}
        {sub && (
          <span
            className="ml-1"
            style={{ color: 'var(--color-ink-2)', fontSize: 13, fontWeight: 500 }}
          >
            {sub}
          </span>
        )}
      </span>
    </div>
  )
}

const ZONE_DOT: Record<number, string> = {
  1: 'var(--color-zone-1)', 2: 'var(--color-zone-2)', 3: 'var(--color-zone-3)',
  4: 'var(--color-zone-4)', 5: 'var(--color-zone-5)', 6: 'var(--color-zone-6)',
  7: 'var(--color-zone-7)',
}

/**
 * BlockTargets — the executable prescription, made visible.
 *
 * The IntervalRibbon draws the shape and carries the numbers only in hover
 * tooltips (invisible on mobile). A rider needs the actual targets — watts or
 * heart-rate, plus cadence — without hovering. We group identical blocks so
 * "4× 5 min @ 250–265 W" reads the way a workout is written, not as 8 rows.
 * Rest valves are folded in; pure warm-up/cool-down are dropped to keep the
 * readout to the efforts that need a target.
 */
function BlockTargets({ blocks, simpleMode, de }: { blocks: ResolvedBlock[]; simpleMode: boolean; de: boolean }) {
  type Group = {
    name: string; zone: number; count: number; durS: number
    wattsLow: number; wattsHigh: number
    hrLow: number | null; hrHigh: number | null
    cadLow: number | null; cadHigh: number | null
  }
  const groups: Group[] = []
  for (const b of blocks) {
    const nm = b.name.trim().toLowerCase()
    // Drop pure warm-up / cool-down — they carry no target the rider paces to.
    if (nm.startsWith('warm') || nm.startsWith('cool')) continue
    const g = groups.find(
      (x) => x.name === b.name && x.zone === b.zone &&
        x.wattsLow === b.target_watts_low && x.wattsHigh === b.target_watts_high &&
        x.hrLow === b.target_hr_low,
    )
    if (g) { g.count += 1; g.durS += b.duration_s }
    else groups.push({
      name: b.name, zone: b.zone, count: 1, durS: b.duration_s,
      wattsLow: b.target_watts_low, wattsHigh: b.target_watts_high,
      hrLow: b.target_hr_low, hrHigh: b.target_hr_high,
      cadLow: b.cadence_low, cadHigh: b.cadence_high,
    })
  }
  if (groups.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5" aria-label={de ? 'Zielwerte' : 'Targets'}>
      <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 9.5, letterSpacing: '0.16em' }}>
        {de ? 'Zielwerte' : 'Targets'}
      </span>
      <div className="flex flex-col gap-1">
        {groups.map((g, i) => {
          const perMin = Math.round(g.durS / g.count / 60)
          const hasWatts = g.wattsHigh > 0
          const hasHr = g.hrLow != null && g.hrHigh != null
          const target = hasWatts
            ? `${g.wattsLow}–${g.wattsHigh} W`
            : hasHr
              ? `${g.hrLow}–${g.hrHigh} bpm`
              : `Z${g.zone}`
          const cadence = g.cadLow && g.cadHigh ? ` · ${g.cadLow}–${g.cadHigh} rpm` : ''
          const zoneTag = !simpleMode && hasWatts ? ` · Z${g.zone}` : ''
          const reps = g.count > 1 ? `${g.count}× ` : ''
          return (
            <div key={i} className="flex items-center gap-2 min-w-0 text-[12.5px]">
              <span className="shrink-0 w-2 h-2 rounded-full" style={{ backgroundColor: ZONE_DOT[g.zone] ?? 'var(--color-muted)' }} aria-hidden />
              <span className="num-mono truncate" style={{ color: 'var(--color-ink-2)' }}>
                <span style={{ color: 'var(--color-ink)', fontWeight: 600 }}>{reps}{perMin} min</span>
                {' · '}<span style={{ color: 'var(--color-ink)' }}>{target}</span>{zoneTag}{cadence}
              </span>
            </div>
          )
        })}
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
              fontSize: 'clamp(22px, 6vw, 30px)',
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
      <div className="grid grid-cols-3 gap-2">
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

      {/* Interval ribbon — only when there's a REAL multi-block profile to draw.
         A single steady block (recovery/endurance) renders as a flat grey bar
         that reads as broken, so for ≤1 block we show the one-line summary. */}
      {displayed.blocks.length > 1 ? (
        <IntervalRibbon
          blocks={displayed.blocks}
          summary={summaryLine(displayed, simpleMode, locale === 'de')}
          language={language}
        />
      ) : (
        <p
          className="num-mono text-[13px] dashboard-break-words"
          style={{ color: 'var(--color-ink-2)' }}
        >
          {summaryLine(displayed, simpleMode, locale === 'de')}
        </p>
      )}

      {/* Executable targets — the actual watts/HR/cadence per effort, visible
         without hovering the ribbon (which is the only place they lived). */}
      <BlockTargets blocks={displayed.blocks} simpleMode={simpleMode} de={locale === 'de'} />

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
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold min-h-[44px]"
          style={{
            color: '#FFFFFF',
            background: 'linear-gradient(135deg, var(--color-accent), #FF7E52)',
            border: 'none',
            boxShadow: '0 6px 18px -6px color-mix(in srgb, var(--color-accent) 70%, transparent)',
          }}
          title={t('push_to_garmin_soon')}
        >
          <Zap size={14} strokeWidth={2.4} />
          <span>{translateCoach('workoutCard.startCta', language, locale)}</span>
          <ChevronRight size={14} strokeWidth={2.4} />
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
