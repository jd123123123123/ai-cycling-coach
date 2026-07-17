import { useLocale } from '../../contexts/LocaleContext'
import { usePeriodReport } from '../../hooks/usePeriodReport'

// Monotony & Strain — Foster overtraining guard. Monotony = mean daily load / SD
// (varied load stays low); Weekly Strain = weekly load × monotony. Fed by the
// period report's load_dynamics. Renders nothing until both figures exist.

function TrackRow({
  label,
  value,
  fill,
  color,
  note,
}: {
  label: string
  value: string
  fill: number
  color: string
  note: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>{label}</span>
        <span className="num-display" style={{ fontSize: 20, color }}>{value}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--color-surface-2)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, fill * 100))}%`, height: '100%', borderRadius: 4, background: color }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{note}</span>
    </div>
  )
}

export default function MonotonyStrainCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data } = usePeriodReport(90)
  const ld = data?.load_dynamics
  if (!ld || ld.monotony == null || ld.strain == null) return null

  const monotony = ld.monotony
  const strain = ld.strain
  const monoOk = monotony < 2
  const monoColor = monoOk ? 'var(--color-recovery)' : 'var(--color-amber)'
  // Monotony track: 0..3 domain (2.0 target line sits at two-thirds).
  const monoFill = monotony / 3
  // Strain track: normalise against a rough 4000 upper reference.
  const strainFill = strain / 4000

  return (
    <div className="rounded-[24px] p-5 flex flex-col gap-4" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      <div className="flex flex-col gap-0.5">
        <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Monotonie & Strain' : 'Monotony & Strain'}</span>
        <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{de ? 'Übertrainings-Schutz · Foster-Methode' : 'Overtraining guard · Foster method'}</span>
      </div>

      <TrackRow
        label={de ? 'Monotonie' : 'Monotony'}
        value={monotony.toFixed(2)}
        fill={monoFill}
        color={monoColor}
        note={de ? 'Ziel < 2,0 · variierte Last' : 'Target < 2.0 · varied load'}
      />
      <TrackRow
        label={de ? 'Wochen-Strain' : 'Weekly Strain'}
        value={Math.round(strain).toLocaleString()}
        fill={strainFill}
        color="var(--color-strain)"
        note={de ? 'Last × Monotonie' : 'Load × monotony'}
      />
    </div>
  )
}
