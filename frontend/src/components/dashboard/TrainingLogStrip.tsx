import { useMemo, useState } from 'react'
import { subDays, format, parseISO } from 'date-fns'
import { de as deLocale } from 'date-fns/locale'
import { usePMC } from '../../hooks/usePMC'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useStreak } from '../../hooks/useStreak'
import { focusFor, focusLabelDe } from '../../utils/focusBadge'
import { useT, useLocale } from '../../contexts/LocaleContext'
import type { ActivityRead } from '../../api/dashboard'

/**
 * TrainingLogStrip — 90-day at-a-glance training history.
 *
 * Each day = a vertical bar: height ∝ daily TSS (from the PMC series, which is
 * the authoritative load number), color = the day's dominant intensity (Xert
 * "Focus" classifier applied to the logged activity; rest days are dim). Hover
 * raises a floating tooltip card with the day detail; a footer summarizes the
 * window (active days, biggest day, current streak) so the strip closes with a
 * takeaway instead of trailing off.
 */

const DAYS = 90
const MAX_BAR_PX = 48
const MIN_BAR_PX = 2

interface DayCell {
  date: string // yyyy-mm-dd
  tss: number
  color: string
  label: string // focus label or "Rest"
  activityTitle: string | null
}

export default function TrainingLogStrip() {
  const t = useT()
  const { locale } = useLocale()
  const dfnsOpts = locale === 'de' ? { locale: deLocale } : undefined
  const today = useMemo(() => new Date(), [])
  const start = useMemo(() => subDays(today, DAYS - 1), [today])
  const { data: pmc, isLoading: pmcLoading } = usePMC(DAYS)
  const { data: acts } = useActivitiesRange(start, today)
  const { data: profile } = useAthleteProfile()
  // Server-computed forgiving streak — the ONLY streak producer (audit P0-5).
  const { data: streakData } = useStreak()
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const cells = useMemo<DayCell[]>(() => {
    const tssByDate = new Map<string, number>()
    // Wire carries the day's load in `tss`; `daily_tss` is legacy and serializes null.
    for (const e of pmc?.entries ?? []) tssByDate.set(e.date, e.tss ?? e.daily_tss ?? 0)

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
      const act = actByDate.get(key)
      // Prefer the PMC daily TSS, but fall back to the logged activity's TSS —
      // the PMC series can lag or zero-out recent days while the activity row
      // already carries the load.
      const tss = Math.max(tssByDate.get(key) ?? 0, act?.tss ?? 0)
      const focus = act ? focusFor(act, profile ?? null) : null
      out.push({
        date: key,
        tss,
        color: focus?.color ?? (tss > 0 ? 'var(--color-forest-2)' : 'var(--color-rule)'),
        label: focus
          ? (locale === 'de' ? focusLabelDe(focus.label) : focus.label)
          : tss > 0
            ? 'Training'
            : t('log_rest'),
        activityTitle: act?.title ?? null,
      })
    }
    return out
  }, [pmc, acts, profile, today, t, locale])

  const summary = useMemo(() => {
    let active = 0
    let big = cells[0]
    for (const c of cells) {
      if (c.tss > 0) {
        active += 1
        if (c.tss > (big?.tss ?? 0)) big = c
      }
    }

    return { active, rest: cells.length - active, big }
  }, [cells])

  // Current streak comes from the server's forgiving-streak endpoint — never
  // recomputed locally (the naive consecutive-TSS walk contradicted it).
  const streak = streakData?.streak ?? 0

  const maxTss = Math.max(1, ...cells.map((c) => c.tss))

  // Month boundary labels — first cell of each month gets a tick label below.
  const monthTicks = useMemo(() => {
    const ticks: Array<{ idx: number; label: string }> = []
    let lastMonth = ''
    cells.forEach((c, idx) => {
      const m = c.date.slice(0, 7)
      if (m !== lastMonth) {
        lastMonth = m
        ticks.push({ idx, label: format(parseISO(c.date), 'MMM') })
      }
    })
    return ticks
  }, [cells])

  if (pmcLoading) {
    return <div className="h-28 rounded-[12px] animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
  }

  const hover = hoverIdx != null ? cells[hoverIdx] : null

  return (
    <div
      className="rounded-[12px] p-4 sm:p-5"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="eyebrow" style={{ color: 'var(--color-muted)' }}>{t('training_log_90d')}</span>
        <span className="num-mono" style={{ color: 'var(--color-muted)', fontSize: 11 }}>
          {summary.active} {t('log_active')} · {summary.rest} {t('log_rest')}
        </span>
      </div>

      {/* Bars + floating tooltip share a relative container so the card can be
          anchored above the hovered day. */}
      <div className="relative" onMouseLeave={() => setHoverIdx(null)}>
        {hover && (
          <div
            className="absolute z-20 pointer-events-none rounded-[8px] px-2.5 py-1.5"
            style={{
              left: `${((hoverIdx! + 0.5) / cells.length) * 100}%`,
              bottom: MAX_BAR_PX + 10,
              transform: 'translateX(-50%)',
              backgroundColor: 'var(--color-ink)',
              color: 'var(--color-paper)',
              border: '1px solid var(--color-rule)',
              boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
              whiteSpace: 'nowrap',
            }}
          >
            <div className="flex items-center gap-1.5">
              <span style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: hover.color, display: 'inline-block' }} />
              <span className="num-mono" style={{ fontSize: 11, fontWeight: 600 }}>
                {format(parseISO(hover.date), 'EEE d MMM', dfnsOpts)}
              </span>
            </div>
            <div className="num-mono" style={{ fontSize: 10, opacity: 0.85, marginTop: 1 }}>
              {Math.round(hover.tss)} TSS · {hover.label}
            </div>
            {hover.activityTitle && (
              <div style={{ fontSize: 10, opacity: 0.7, marginTop: 1, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {hover.activityTitle}
              </div>
            )}
          </div>
        )}

        <div className="flex items-end gap-[2px]" style={{ height: MAX_BAR_PX }}>
          {cells.map((c, idx) => {
            const h = c.tss > 0 ? Math.max(MIN_BAR_PX, (c.tss / maxTss) * MAX_BAR_PX) : MIN_BAR_PX
            const isToday = idx === cells.length - 1
            const dim = hoverIdx != null && hoverIdx !== idx
            return (
              <div
                key={c.date}
                onMouseEnter={() => setHoverIdx(idx)}
                className="flex-1 rounded-[1px]"
                style={{
                  height: h,
                  minWidth: 2,
                  backgroundColor: c.color,
                  opacity: c.tss > 0 ? (dim ? 0.5 : 1) : dim ? 0.25 : 0.45,
                  outline: isToday ? '1px solid var(--color-ink)' : undefined,
                  outlineOffset: 1,
                  cursor: 'pointer',
                  transition: 'opacity 140ms ease',
                }}
                aria-label={`${c.date}: ${Math.round(c.tss)} TSS, ${c.label}`}
              />
            )
          })}
        </div>

        {/* Month ticks */}
        <div className="relative mt-1" style={{ height: 12 }}>
          {monthTicks.map((t) => (
            <span
              key={t.idx}
              className="num-mono absolute"
              style={{
                left: `${(t.idx / cells.length) * 100}%`,
                fontSize: 10.5,
                letterSpacing: '0.1em',
                color: 'var(--color-muted)',
                textTransform: 'uppercase',
              }}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>

      {/* Footer takeaway */}
      <div
        className="flex items-center justify-between gap-3 mt-3 pt-3 num-mono"
        style={{ borderTop: '1px solid var(--color-rule)', fontSize: 11, color: 'var(--color-ink-2)' }}
      >
        <span>
          {t('log_biggest_day')}{' '}
          <strong style={{ color: 'var(--color-ink)' }}>{Math.round(summary.big?.tss ?? 0)} TSS</strong>
          {summary.big?.tss ? <> · {format(parseISO(summary.big.date), 'd MMM', dfnsOpts)}</> : null}
        </span>
        {streak > 1 && (
          <span style={{ color: 'var(--color-good)' }}>{streak}{t('log_streak_suffix')}</span>
        )}
      </div>
    </div>
  )
}
