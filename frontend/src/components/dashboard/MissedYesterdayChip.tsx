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
    (yRec?.template_id as string | undefined) ??
    null
  const plannedTss = Number(yRec?.predicted_tss ?? 0)
  const plannedDuration = Number(yRec?.duration_minutes ?? 0)
  const yesterdayTss = Number(wp?.yesterday_tss ?? 0)

  // Show only when (a) there was a real prescription yesterday and (b) the
  // athlete logged < 25% of the planned load. 0 alone misses cases where they
  // did a tiny coffee spin; 25% is "barely got started" by any standard.
  const missed = plannedTss > 20 && yesterdayTss < plannedTss * 0.25
  if (!missed || !plannedTitle) return null

  return (
    <div
      className="rounded-[12px] px-4 py-3 flex items-center gap-3 flex-wrap"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-caution) 8%, var(--color-paper-2))',
        border: '1px solid color-mix(in srgb, var(--color-caution) 30%, var(--color-rule))',
      }}
    >
      <span
        className="eyebrow num-mono"
        style={{ color: 'var(--color-caution)', fontSize: 10, letterSpacing: '0.22em' }}
      >
        YESTERDAY · MISSED
      </span>
      <span style={{ color: 'var(--color-ink)', fontSize: 14 }}>
        {plannedTitle}
        <span className="num-mono ml-2 opacity-70" style={{ fontSize: 12 }}>
          {plannedDuration ? `${plannedDuration} min · ` : ''}{Math.round(plannedTss)} TSS planned
        </span>
      </span>
      <span
        className="ml-auto num-mono"
        style={{ color: 'var(--color-muted)', fontSize: 11 }}
        title="Each day's prescription is recomputed from current fitness + recovery. Less load yesterday = more headroom today."
      >
        Today re-tuned to match.
      </span>
    </div>
  )
}
