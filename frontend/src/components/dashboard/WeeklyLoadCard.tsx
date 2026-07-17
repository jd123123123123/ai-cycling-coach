import { useMemo } from 'react'
import { subDays } from 'date-fns'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useLocale } from '../../contexts/LocaleContext'

// Weekly Load — rebuilt from pencil-new.pen "Weekly Load". Eight weekly TSS
// bars (Mon-anchored), the current week in coral, with a ramp pill reading the
// week-over-week change. Summed from real activity TSS (the PMC daily_tss
// series zeroes out recent weeks, so we read the load off the activities).

function isoWeekKey(d: Date): string {
  const day = (d.getDay() + 6) % 7
  const monday = new Date(d)
  monday.setDate(d.getDate() - day)
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
}

export default function WeeklyLoadCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const today = useMemo(() => new Date(), [])
  const start = useMemo(() => subDays(today, 8 * 7), [today])
  const { data } = useActivitiesRange(start, today)

  const weeks = useMemo(() => {
    const buckets = new Map<string, number>()
    // Pre-seed the last 8 Monday-anchored weeks so empty weeks show as 0 bars.
    for (let i = 7; i >= 0; i--) buckets.set(isoWeekKey(subDays(today, i * 7)), 0)
    for (const a of data?.activities ?? []) {
      const iso = a.started_at ?? a.date
      if (!iso) continue
      const key = isoWeekKey(new Date(iso))
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + (a.tss ?? 0))
    }
    const sorted = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    return sorted.slice(-8).map(([key, tss]) => ({ key, tss: Math.round(tss) }))
  }, [data, today])

  if (weeks.length === 0) return null

  const max = Math.max(...weeks.map((w) => w.tss), 1)
  // Ramp compares the last two COMPLETE weeks — the current week ("Now") is
  // still filling up, so including it would read a misleading -100%.
  const lastComplete = weeks.length >= 2 ? weeks[weeks.length - 2] : null
  const priorComplete = weeks.length >= 3 ? weeks[weeks.length - 3] : null
  const rampPct = lastComplete && priorComplete && priorComplete.tss > 0
    ? Math.round(((lastComplete.tss - priorComplete.tss) / priorComplete.tss) * 100)
    : null
  const safe = rampPct == null || Math.abs(rampPct) <= 15
  const rampColor = safe ? 'var(--color-recovery)' : 'var(--color-amber)'

  return (
    <div className="rounded-[24px] p-5 flex flex-col gap-4" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Wöchentliche Last' : 'Weekly Load'}</span>
          <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{de ? 'Trainingsbelastung pro Woche' : 'Training stress per week'}</span>
        </div>
        {rampPct != null && (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1" style={{ background: `color-mix(in srgb, ${rampColor} 15%, transparent)` }}>
            {rampPct >= 0 ? <TrendingUp size={12} strokeWidth={2.4} style={{ color: rampColor }} /> : <TrendingDown size={12} strokeWidth={2.4} style={{ color: rampColor }} />}
            <span style={{ fontSize: 11, fontWeight: 600, color: rampColor }}>{rampPct >= 0 ? '+' : ''}{rampPct}% · {safe ? (de ? 'sicher' : 'safe') : (de ? 'steil' : 'steep')}</span>
          </span>
        )}
      </div>

      {/* Bars */}
      <div className="flex items-end gap-2" style={{ height: 130 }}>
        {weeks.map((w, i) => {
          const isNow = i === weeks.length - 1
          const h = Math.max(6, (w.tss / max) * 118)
          return (
            <div key={w.key} className="flex-1 flex flex-col items-center justify-end gap-1" style={{ height: '100%' }}>
              <span className="num-mono" style={{ fontSize: 9, color: isNow ? 'var(--color-accent)' : 'var(--color-muted)' }}>{w.tss}</span>
              <div style={{ width: '100%', height: h, borderRadius: 6, background: isNow ? 'var(--color-accent)' : 'var(--color-strain)', opacity: isNow ? 1 : 0.55 }} />
            </div>
          )
        })}
      </div>

      {/* Labels */}
      <div className="flex gap-2">
        {weeks.map((w, i) => {
          const isNow = i === weeks.length - 1
          return (
            <span key={w.key} className="flex-1 text-center num-mono" style={{ fontSize: 9.5, color: isNow ? 'var(--color-accent)' : 'var(--color-muted)', fontWeight: isNow ? 700 : 500 }}>
              {isNow ? (de ? 'Jetzt' : 'Now') : `W${i + 1}`}
            </span>
          )
        })}
      </div>
    </div>
  )
}
