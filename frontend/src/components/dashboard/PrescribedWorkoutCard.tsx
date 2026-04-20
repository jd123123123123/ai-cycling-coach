import { useMemo, useState } from 'react'
import { Clock, Zap, ChevronRight, Moon } from 'lucide-react'
import type { AlternateWorkout, PrescribedWorkout } from '../../api/coach'
import IntervalRibbon from './IntervalRibbon'

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

function summaryLine(pw: PrescribedWorkout): string {
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

  const displayed = useMemo<PrescribedWorkout>(() => {
    if (activeAlt && alternatesPreview?.[activeAlt]) {
      return alternatesPreview[activeAlt] as PrescribedWorkout
    }
    return workout
  }, [activeAlt, alternatesPreview, workout])

  const isAlternate = activeAlt !== null
  const frameworkChip = displayed.framework_cited

  return (
    <div
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
            {isAlternate ? 'Alternate' : 'Today · prescribed'}
          </span>
          <h3
            className="num-display leading-tight dashboard-break-words"
            style={{
              fontSize: 'clamp(22px, 3vw, 30px)',
              color: 'var(--color-ink)',
              fontVariationSettings: '"opsz" 96, "SOFT" 30',
            }}
          >
            {displayed.title}
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

      {/* Interval ribbon */}
      <IntervalRibbon
        blocks={displayed.blocks}
        summary={summaryLine(displayed)}
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
              Why this workout
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
            If today's not that day
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
              Back to prescribed
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
          title="Coming soon — push workout to Garmin"
        >
          <Zap size={13} strokeWidth={2} />
          <span>Start workout</span>
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
          title="Coming soon — re-plan from tomorrow"
        >
          <span>Snooze 1 day</span>
        </button>
      </div>
    </div>
  )
}
