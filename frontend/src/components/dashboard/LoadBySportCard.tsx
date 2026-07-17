import { useMemo } from 'react'
import { subDays } from 'date-fns'
import { useLocale } from '../../contexts/LocaleContext'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'

// Load by Sport — a stacked bar of the recent (28d) training-stress share across
// Ride / Run / Strength, summed from real activity TSS (the per-sport PMC series
// zeroes recent weeks). Renders nothing until at least one sport has load.

export default function LoadBySportCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const today = useMemo(() => new Date(), [])
  const { data } = useActivitiesRange(subDays(today, 28), today)

  const totals = useMemo(() => {
    const acc = { ride: 0, run: 0, strength: 0 }
    for (const a of data?.activities ?? []) {
      const t = a.tss ?? 0
      if (a.sport === 'cycling') acc.ride += t
      else if (a.sport === 'running') acc.run += t
      else acc.strength += t
    }
    return acc
  }, [data])

  const grand = totals.ride + totals.run + totals.strength
  if (grand <= 0) return null

  const segments = [
    { key: 'ride', label: de ? 'Rad' : 'Ride', tss: totals.ride, color: 'var(--color-strain)' },
    { key: 'run', label: de ? 'Lauf' : 'Run', tss: totals.run, color: 'var(--color-accent)' },
    { key: 'strength', label: de ? 'Kraft' : 'Strength', tss: totals.strength, color: 'var(--color-exercise)' },
  ].map((s) => ({ ...s, pct: (s.tss / grand) * 100 }))

  return (
    <div className="rounded-[24px] p-5 flex flex-col gap-4" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      <div className="flex flex-col gap-0.5">
        <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Last nach Sportart' : 'Load by Sport'}</span>
        <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{de ? 'Belastungsanteil je Disziplin' : 'Training-stress share by discipline'}</span>
      </div>

      {/* Stacked bar */}
      <div className="flex" style={{ height: 16, gap: 2 }}>
        {segments.map((s) => (
          <div key={s.key} style={{ width: `${s.pct}%`, height: '100%', borderRadius: 8, background: s.color, minWidth: s.pct > 0 ? 4 : 0 }} />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-col gap-2">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-2">
            <span style={{ width: 8, height: 8, borderRadius: 4, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--color-ink)', flex: 1 }}>{s.label}</span>
            <span className="num-mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink)' }}>{Math.round(s.pct)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
