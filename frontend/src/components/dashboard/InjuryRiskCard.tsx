import { useMemo } from 'react'
import { subDays } from 'date-fns'
import { useLocale } from '../../contexts/LocaleContext'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { usePeriodReport } from '../../hooks/usePeriodReport'

// Load Ratio — acute:chronic workload ratio (ACWR) as an injury guard. Acute =
// last-7d TSS sum; chronic = last-28d daily average × 7; ratio = acute/chronic.
// A 4-zone gauge places the athlete against the sweet spot. ACWR is a guide, not
// a verdict — its validity is contested in the literature.

const R_MIN = 0
const R_MAX = 2
const pos = (r: number) => Math.max(0, Math.min(1, (r - R_MIN) / (R_MAX - R_MIN)))

// Zone edges in ratio units.
const ZONES = [
  { to: 0.8, color: 'var(--color-muted)' }, // undertraining
  { to: 1.3, color: 'var(--color-recovery)' }, // sweet spot
  { to: 1.5, color: 'var(--color-amber)' }, // caution
  { to: R_MAX, color: 'var(--color-move)' }, // danger
]

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="eyebrow" style={{ fontSize: 11, letterSpacing: '0.04em', color: 'var(--color-muted)' }}>{label}</span>
      <span className="num-display" style={{ fontSize: 20, color: color ?? 'var(--color-ink)' }}>{value}</span>
    </div>
  )
}

export default function InjuryRiskCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const today = useMemo(() => new Date(), [])
  const { data } = useActivitiesRange(subDays(today, 28), today)
  const { data: report } = usePeriodReport(90)

  // Acute = last-7d TSS; chronic = last-28d TSS as a weekly average. Summed
  // from real activity TSS (PMC daily_tss zeroes recent weeks).
  const acwr = useMemo(() => {
    const acts = data?.activities ?? []
    if (acts.length === 0) return null
    const d7 = subDays(today, 7)
    let acute = 0
    let last28 = 0
    for (const a of acts) {
      const t = a.tss ?? 0
      const when = new Date(a.started_at ?? a.date ?? 0)
      last28 += t
      if (when >= d7) acute += t
    }
    const chronic = last28 / 4 // weekly average over 28 days
    const ratio = chronic > 0 ? acute / chronic : 0
    return { acute: Math.round(acute), chronic: Math.round(chronic), ratio }
  }, [data, today])

  if (!acwr) return null
  const ramp = report?.load_dynamics?.ramp_per_week

  const inSweet = acwr.ratio >= 0.8 && acwr.ratio <= 1.3
  const state = acwr.ratio < 0.8
    ? { label: de ? 'Untertraining' : 'Undertraining', color: 'var(--color-muted)' }
    : inSweet
      ? { label: de ? 'Optimalbereich' : 'Sweet spot', color: 'var(--color-recovery)' }
      : acwr.ratio <= 1.5
        ? { label: de ? 'Vorsicht' : 'Caution', color: 'var(--color-amber)' }
        : { label: de ? 'Gefahr' : 'Danger', color: 'var(--color-move)' }

  const markerPct = pos(acwr.ratio) * 100

  return (
    <div className="rounded-[24px] p-5 flex flex-col gap-4" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Lastverhältnis · Verletzungsschutz' : 'Load Ratio · injury guard'}</span>
          <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{de ? 'Akut : chronisch (ACWR)' : 'Acute : chronic (ACWR)'}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="num-display" style={{ fontSize: 26, lineHeight: 1, color: state.color }}>{acwr.ratio.toFixed(2)}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: state.color }}>{state.label}</span>
        </div>
      </div>

      {/* 4-zone gauge */}
      <div className="flex flex-col gap-2">
        <div className="relative" style={{ height: 12 }}>
          <div className="absolute inset-0 flex gap-0.5 overflow-hidden" style={{ borderRadius: 6 }}>
            {ZONES.map((z, i) => {
              const from = i === 0 ? R_MIN : ZONES[i - 1].to
              const w = (pos(z.to) - pos(from)) * 100
              return <div key={i} style={{ width: `${w}%`, background: z.color }} />
            })}
          </div>
          <div className="absolute" style={{ left: `${markerPct}%`, top: -8, transform: 'translateX(-50%)', width: 6, height: 28, borderRadius: 3, background: '#FFFFFF', border: '2px solid var(--color-paper-2)' }} />
        </div>
        <div className="flex justify-between" style={{ fontSize: 11, fontWeight: 500 }}>
          <span style={{ color: 'var(--color-muted)' }}>0.8</span>
          <span style={{ color: 'var(--color-recovery)' }}>{de ? 'Optimal' : 'Sweet spot'}</span>
          <span style={{ color: 'var(--color-move)' }}>1.5</span>
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--color-rule)' }} />

      <div className="flex justify-between">
        <Stat label={de ? 'Akut · 7T' : 'Acute · 7d'} value={Math.round(acwr.acute).toLocaleString()} />
        <Stat label={de ? 'Chronisch · 28T' : 'Chronic · 28d'} value={Math.round(acwr.chronic).toLocaleString()} />
        <Stat label={de ? 'Anstieg' : 'Ramp'} value={ramp != null ? `${ramp >= 0 ? '+' : ''}${Math.round(ramp)}` : '—'} color="var(--color-amber)" />
      </div>

      <span style={{ fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.4 }}>{de ? 'ACWR ist ein Richtwert, kein Urteil — in der Forschung umstritten.' : 'ACWR is a guide, not a verdict — contested in the literature.'}</span>
    </div>
  )
}
