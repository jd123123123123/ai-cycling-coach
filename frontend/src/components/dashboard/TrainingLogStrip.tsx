import { useMemo, useState } from 'react'
import { subDays, format, parseISO } from 'date-fns'
import { usePMC } from '../../hooks/usePMC'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { focusFor } from '../../utils/focusBadge'
import type { ActivityRead } from '../../api/dashboard'

/**
 * TrainingLogStrip — 90-day at-a-glance training history.
 *
 * Each day = a vertical bar: height ∝ daily TSS (from the PMC series, which is
 * the authoritative load number), color = the day's dominant intensity (Xert
 * "Focus" classifier applied to the logged activity; rest days are dim). Hover
 * shows the day detail. Replaces the plain "Recent training" list as the Today
 * default — the full list lives in the Deep-dive accordion as the drilldown.
 */

const DAYS = 90
const MAX_BAR_PX = 44
const MIN_BAR_PX = 2

interface DayCell {
  date: string // yyyy-mm-dd
  tss: number
  color: string
  label: string // focus label or "Rest"
  activityTitle: string | null
}

export default function TrainingLogStrip() {
  const today = useMemo(() => new Date(), [])
  const start = useMemo(() => subDays(today, DAYS - 1), [today])
  const { data: pmc, isLoading: pmcLoading } = usePMC(DAYS)
  const { data: acts } = useActivitiesRange(start, today)
  const { data: profile } = useAthleteProfile()
  const [hover, setHover] = useState<DayCell | null>(null)

  const cells = useMemo<DayCell[]>(() => {
    const tssByDate = new Map<string, number>()
    for (const e of pmc?.entries ?? []) tssByDate.set(e.date, e.daily_tss)

    const actByDate = new Map<string, ActivityRead>()
    for (const a of acts?.activities ?? []) {
      const key = (a.date ?? a.started_at ?? '').slice(0, 10)
      if (!key) continue
      // keep the highest-TSS activity for the day as the representative one
      const prev = actByDate.get(key)
      if (!prev || (a.tss ?? 0) > (prev.tss ?? 0)) actByDate.set(key, a)
    }

    const out: DayCell[] = []
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = subDays(today, i)
      const key = format(d, 'yyyy-MM-dd')
      const tss = tssByDate.get(key) ?? 0
      const act = actByDate.get(key)
      const focus = act ? focusFor(act, profile ?? null) : null
      out.push({
        date: key,
        tss,
        color: focus?.color ?? (tss > 0 ? 'var(--color-forest-2)' : 'var(--color-rule)'),
        label: focus?.label ?? (tss > 0 ? 'Training' : 'Rest'),
        activityTitle: act?.title ?? null,
      })
    }
    return out
  }, [pmc, acts, profile, today])

  const maxTss = Math.max(1, ...cells.map((c) => c.tss))

  if (pmcLoading) {
    return <div className="h-20 rounded-[12px] animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
  }

  return (
    <div
      className="rounded-[12px] p-4 sm:p-5"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="eyebrow" style={{ color: 'var(--color-muted)' }}>Training log · last 90 days</span>
        <span className="num-mono" style={{ color: 'var(--color-muted)', fontSize: 11, minHeight: 14 }}>
          {hover
            ? `${format(parseISO(hover.date), 'EEE MMM d')} · ${Math.round(hover.tss)} TSS · ${hover.label}${hover.activityTitle ? ` · ${hover.activityTitle}` : ''}`
            : ' '}
        </span>
      </div>

      <div className="flex items-end gap-[2px]" style={{ height: MAX_BAR_PX }}>
        {cells.map((c) => {
          const h = c.tss > 0 ? Math.max(MIN_BAR_PX, (c.tss / maxTss) * MAX_BAR_PX) : MIN_BAR_PX
          const isToday = c.date === format(today, 'yyyy-MM-dd')
          return (
            <div
              key={c.date}
              onMouseEnter={() => setHover(c)}
              onMouseLeave={() => setHover((cur) => (cur?.date === c.date ? null : cur))}
              className="flex-1 rounded-[1px] transition-opacity"
              style={{
                height: h,
                minWidth: 2,
                backgroundColor: c.color,
                opacity: c.tss > 0 ? 1 : 0.45,
                outline: isToday ? '1px solid var(--color-ink)' : undefined,
                outlineOffset: 1,
                cursor: 'default',
              }}
              aria-label={`${c.date}: ${Math.round(c.tss)} TSS, ${c.label}`}
            />
          )
        })}
      </div>
    </div>
  )
}
