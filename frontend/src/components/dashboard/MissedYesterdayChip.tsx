import { useCoachBrief } from '../../hooks/useCoachBrief'

/**
 * MissedYesterdayChip — surfaces a single line on Today when yesterday had a
 * prescribed workout and the athlete logged little or nothing for it. The
 * previous behavior was a silent compliance penalty + a streak reset — the
 * miss never *showed up* on the main view. One small line is enough: who, what,
 * and a hint that the rest of the week was recomputed (which it was — the
 * picker reads from current PMC/readiness each day, so a missed day means
 * lower ATL → higher TSB → more headroom today automatically).
 */
export default function MissedYesterdayChip() {
  const { data } = useCoachBrief()
  if (!data) return null

  const evidence = data.evidence as Record<string, unknown>
  const wp = evidence.weekly_progress as Record<string, unknown> | undefined
  const yRec = evidence.yesterday_recommendation as Record<string, unknown> | undefined

  const plannedTitle =
    (yRec?.workout_title as string | undefined) ??
    (yRec?.title as string | undefined) ??
    (yRec?.template_id as string | undefined) ??
    null
  const plannedTss = Number(yRec?.predicted_tss ?? 0)
  const plannedDuration = Number(yRec?.duration_minutes ?? 0)
  const yesterdayTss = Number(wp?.yesterday_tss ?? 0)

  // Show only when (a) there was a real prescription yesterday and (b) the
  // athlete logged < 25% of the planned load.
  const missed = plannedTss > 20 && yesterdayTss < plannedTss * 0.25
  if (!missed || !plannedTitle) return null

  // AI-driven impact line. Pull the first sentence of brief.rationale —
  // it's the coach LLM's own read on today, written with full knowledge of
  // yesterday's miss + every recovery marker. Falls back to the rule line
  // only when the rationale isn't present (cold brief / older shape).
  const rationale = (data.rationale || '').trim()
  const firstSentence = rationale
    ? (rationale.match(/^.*?[.!?](\s|$)/)?.[0] || rationale).trim()
    : null
  const aiLine = firstSentence || 'Today re-tuned around the missed session.'

  return (
    <div
      className="rounded-[12px] px-4 py-3 flex flex-col gap-1"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-caution) 8%, var(--color-paper-2))',
        border: '1px solid color-mix(in srgb, var(--color-caution) 30%, var(--color-rule))',
      }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="eyebrow num-mono"
          style={{ color: 'var(--color-caution)', fontSize: 10, letterSpacing: '0.22em' }}
        >
          YESTERDAY · MISSED
        </span>
        <span style={{ color: 'var(--color-ink)', fontSize: 14 }}>
          {plannedTitle}
        </span>
        <span className="num-mono opacity-70" style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>
          {plannedDuration ? `${plannedDuration} min · ` : ''}{Math.round(plannedTss)} TSS planned
        </span>
      </div>
      <p
        className="text-[13px] leading-relaxed mt-0.5"
        style={{ color: 'var(--color-ink-2)', maxWidth: '60ch' }}
      >
        {aiLine}
      </p>
    </div>
  )
}
