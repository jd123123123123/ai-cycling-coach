import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { useCurrentWeek } from '../../hooks/useCurrentWeek'
import { useCoachBrief } from '../../hooks/useCoachBrief'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'

/**
 * TrainHero — the first card on the Train tab.
 *
 * Mirrors TodayHero's job: one decisive card that frames the week. Eyebrow
 * carries periodization context (phase, block position, days-to-event). The
 * body shows weekly TSS plan-vs-actual as a horizontal bar + completed-vs-
 * scheduled session count. The AI narrative is `week.preface` — already
 * produced by the coach LLM, never previously surfaced above the day pills
 * with this prominence.
 */

const PHASE_LABEL: Record<string, string> = {
  build1: 'Build 1',
  build2: 'Build 2',
  base1: 'Base 1',
  base2: 'Base 2',
  peak: 'Peak',
  taper: 'Taper',
  race: 'Race week',
}

const POSITION_LABEL: Record<string, string> = {
  accumulation: 'Accumulation',
  transmutation: 'Transmutation',
  realization: 'Realization',
  recovery: 'Recovery week',
}

export default function TrainHero() {
  const { data: week } = useCurrentWeek()
  const { data: brief } = useCoachBrief()

  // All hooks above the conditional return — Rules of Hooks.
  const weekStart = week?.week_start ? parseISO(week.week_start) : null
  const weekEnd = week?.week_end ? parseISO(week.week_end) : null
  const { data: activitiesData } = useActivitiesRange(
    weekStart ?? new Date(),
    weekEnd ?? new Date(),
  )
  const actualTss = useMemo(() => {
    const acts = activitiesData?.activities ?? []
    return Math.round(acts.reduce((s, a) => s + (a.tss ?? 0), 0))
  }, [activitiesData])

  // Completed-vs-scheduled session count. Always runs; gates the `week`
  // dependency inside the memo body so the hook order stays stable.
  const completedDays = useMemo(() => {
    if (!week) return 0
    const acts = activitiesData?.activities ?? []
    const set = new Set<string>()
    for (const a of acts) {
      const k = (a.date ?? a.started_at?.slice(0, 10)) || ''
      if (k) set.add(k)
    }
    return week.days.filter((d) => {
      if (!d.category || d.category === 'rest') return false
      return set.has(d.date)
    }).length
  }, [activitiesData, week])

  if (!week) {
    return (
      <div
        className="rounded-[18px] p-5 h-24 animate-pulse"
        style={{ backgroundColor: 'var(--color-rule)' }}
      />
    )
  }

  const meso = week.meso_block
  const phase = meso?.phase ?? null
  const phaseLabel = phase ? PHASE_LABEL[phase] ?? phase.replace(/([a-z])(\d)/i, '$1 $2') : null
  const positionLabel = meso?.block_position ? POSITION_LABEL[meso.block_position] : null
  const targetTss = meso?.weekly_tss_target ?? 0
  const pct = targetTss > 0 ? Math.min(150, Math.round((actualTss / targetTss) * 100)) : 0
  const daysToEvent = meso?.days_to_event ?? null
  const scheduledDays = week.days.filter((d) => d.category && d.category !== 'rest').length

  // The bar's color follows the same tone system as the rest of the app.
  const barColor =
    pct < 60
      ? 'var(--color-caution)'
      : pct <= 110
        ? 'var(--color-good)'
        : 'var(--color-bad)'

  // Optional supporting line from the brief's tomorrow plan / phase context
  // — the coach LLM's own framing of where this week sits in the bigger arc.
  const evidence = (brief?.evidence as Record<string, unknown> | undefined) ?? {}
  const quota = evidence.weekly_intensity_quota as Record<string, unknown> | undefined
  const vo2Sessions = (quota?.vo2_sessions as number | undefined) ?? null
  const thresholdSessions = (quota?.threshold_sessions as number | undefined) ?? null
  const restDays = (quota?.rest_days as number | undefined) ?? null
  const totalHours = (quota?.total_hours as number | undefined) ?? null
  const quotaLine =
    vo2Sessions != null && thresholdSessions != null && totalHours != null
      ? `${totalHours}h plan · ${vo2Sessions} VO2 · ${thresholdSessions} threshold · ${restDays ?? '?'} rest`
      : null

  const dateRange =
    weekStart && weekEnd ? `${format(weekStart, 'd MMM')} – ${format(weekEnd, 'd MMM')}` : null

  return (
    <div
      className="rounded-[18px] p-5 sm:p-6"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      {/* Eyebrow */}
      <div className="flex items-center gap-3 flex-wrap mb-3">
        {phaseLabel && (
          <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.22em' }}>
            {phaseLabel.toUpperCase()}
          </span>
        )}
        {positionLabel && (
          <>
            <span style={{ color: 'var(--color-muted)', fontSize: 10 }}>·</span>
            <span className="eyebrow num-mono" style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.22em' }}>
              {positionLabel.toUpperCase()}
            </span>
          </>
        )}
        {dateRange && (
          <>
            <span style={{ color: 'var(--color-muted)', fontSize: 10 }}>·</span>
            <span className="eyebrow num-mono" style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.22em' }}>
              {dateRange.toUpperCase()}
            </span>
          </>
        )}
        {typeof daysToEvent === 'number' && daysToEvent > 0 && (
          <>
            <span style={{ color: 'var(--color-muted)', fontSize: 10 }}>·</span>
            <span className="eyebrow num-mono" style={{ color: 'var(--color-amber-2)', fontSize: 10, letterSpacing: '0.22em' }}>
              {daysToEvent}D TO EVENT
            </span>
          </>
        )}
      </div>

      {/* AI narrative — week.preface is the coach LLM's framing of this week.
         It already pulls phase + recent load + recovery context into one or
         two sentences. Promoting it here gives the Train tab a true "why this
         week" anchor instead of a bare 7-day strip. */}
      {week.preface && (
        <p
          className="text-[14px] sm:text-[15px] leading-relaxed mb-4"
          style={{ color: 'var(--color-ink)', maxWidth: '64ch' }}
        >
          {week.preface}
        </p>
      )}

      {/* Plan-vs-actual stat row */}
      <div className="flex items-end gap-6 flex-wrap mb-3">
        <div className="flex flex-col">
          <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 9, letterSpacing: '0.22em' }}>
            TSS · WEEK
          </span>
          <span className="num-mono leading-none" style={{ color: 'var(--color-ink)', fontSize: 28, fontWeight: 500 }}>
            {actualTss}
            <span className="num-mono opacity-60 ml-1" style={{ fontSize: 14 }}>
              / {targetTss}
            </span>
          </span>
        </div>
        <div className="flex flex-col">
          <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 9, letterSpacing: '0.22em' }}>
            SESSIONS
          </span>
          <span className="num-mono leading-none" style={{ color: 'var(--color-ink)', fontSize: 28, fontWeight: 500 }}>
            {completedDays}
            <span className="num-mono opacity-60 ml-1" style={{ fontSize: 14 }}>
              / {scheduledDays}
            </span>
          </span>
        </div>
        <div className="flex-1 min-w-[180px]">
          <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 9, letterSpacing: '0.22em' }}>
            PLAN COMPLETION
          </span>
          <div className="flex items-center gap-2 mt-1">
            <div
              className="flex-1 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--color-rule)', height: 8 }}
            >
              <div
                style={{
                  width: `${Math.min(100, pct)}%`,
                  height: '100%',
                  backgroundColor: barColor,
                  transition: 'width 800ms cubic-bezier(.22,1,.36,1)',
                }}
              />
            </div>
            <span className="num-mono" style={{ color: barColor, fontSize: 12, fontWeight: 600 }}>
              {pct}%
            </span>
          </div>
        </div>
      </div>

      {/* Quota line — supplemental, only if backend supplied the structured
         intensity quota for this week. */}
      {quotaLine && (
        <div
          className="num-mono"
          style={{
            color: 'var(--color-muted)',
            fontSize: 11,
            letterSpacing: '0.04em',
            borderTop: '1px solid var(--color-rule)',
            paddingTop: 10,
          }}
        >
          {quotaLine}
        </div>
      )}
    </div>
  )
}
