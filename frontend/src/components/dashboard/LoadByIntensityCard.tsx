import { useLocale } from '../../contexts/LocaleContext'
import { usePeriodReport } from '../../hooks/usePeriodReport'

// Load by Intensity — a single stacked bar splitting Easy / Moderate / Hard from
// the period report's zone distribution, plus the detected model and whether it
// aligns to the target. Renders nothing until intensity data exists.

export default function LoadByIntensityCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data } = usePeriodReport(90)
  const mix = data?.intensity
  if (!mix) return null

  const segments = [
    { key: 'easy', label: de ? 'Leicht' : 'Easy', pct: mix.z1_pct, color: 'var(--color-recovery)' },
    { key: 'mod', label: de ? 'Moderat' : 'Moderate', pct: mix.z2_pct, color: 'var(--color-amber)' },
    { key: 'hard', label: de ? 'Hart' : 'Hard', pct: mix.z3_pct, color: 'var(--color-move)' },
  ]

  return (
    <div className="rounded-[24px] p-5 flex flex-col gap-4" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Last nach Intensität' : 'Load by Intensity'}</span>
          <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{mix.model}{mix.model && mix.target_model ? ' · ' : ''}{de ? 'Ziel: ' : 'target: '}{mix.target_model}</span>
        </div>
        <span className="inline-flex items-center rounded-full px-2.5 py-1" style={{ background: `color-mix(in srgb, ${mix.aligned ? 'var(--color-recovery)' : 'var(--color-amber)'} 15%, transparent)` }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: mix.aligned ? 'var(--color-recovery)' : 'var(--color-amber)' }}>{mix.aligned ? (de ? 'ausgerichtet' : 'aligned') : (de ? 'abweichend' : 'off target')}</span>
        </span>
      </div>

      {/* Stacked bar */}
      <div className="flex" style={{ height: 16, gap: 2 }}>
        {segments.map((s) => (
          <div key={s.key} style={{ width: `${Math.max(0, s.pct)}%`, height: '100%', borderRadius: 8, background: s.color, minWidth: s.pct > 0 ? 4 : 0 }} />
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
