import { usePMC } from '../../hooks/usePMC'
import type { PMCEntry } from '../../api/dashboard'
import Sparkline from './Sparkline'

/**
 * PMCCompact — promoted training-state tile for the Today tab.
 *
 * Shows fitness (CTL) / fatigue (ATL) / form (TSB) as a tight readout plus a
 * 90-day CTL+ATL micro-chart. This is the single most decision-relevant chart
 * in endurance training, so it lives above the fold — the full PMCChart with
 * sport toggles + projections stays in the Deep-dive accordion.
 */

function formColor(tsb: number | null): string {
  if (tsb == null) return 'var(--color-muted)'
  if (tsb <= -20) return 'var(--color-bad)'
  if (tsb < -10) return 'var(--color-caution)'
  return 'var(--color-good)'
}

function signed(n: number): string {
  return (n >= 0 ? '+' : '') + Math.round(n)
}

function Row({
  label,
  value,
  color = 'var(--color-ink)',
  sub,
}: {
  label: string
  value: string
  color?: string
  sub?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span
        className="eyebrow"
        style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.22em' }}
      >
        {label}
      </span>
      <span className="num-mono leading-none" style={{ color, fontSize: 22, fontWeight: 500 }}>
        {value}
        {sub && (
          <span className="ml-1.5 opacity-60" style={{ fontSize: 11, fontWeight: 400 }}>
            {sub}
          </span>
        )}
      </span>
    </div>
  )
}

export default function PMCCompact() {
  const { data, isLoading, isError } = usePMC(90)

  if (isLoading) {
    return (
      <div
        className="h-28 rounded-[12px] animate-pulse"
        style={{ backgroundColor: 'var(--color-rule)' }}
      />
    )
  }

  const series: PMCEntry[] = data?.entries ?? []
  if (isError || series.length === 0) return null

  const latest = series[series.length - 1]
  const priorWeek = series.length >= 8 ? series[series.length - 8] : series[0]
  const ctlDelta = latest.ctl - priorWeek.ctl

  const ctlValues = series.map((e) => e.ctl)
  const atlValues = series.map((e) => e.atl)

  return (
    <div
      className="rounded-[12px] p-4 sm:p-5"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="eyebrow" style={{ color: 'var(--color-muted)' }}>
          Training state · 90 days
        </span>
        <span className="num-mono" style={{ color: 'var(--color-muted)', fontSize: 11 }}>
          CTL {signed(ctlDelta)} · 7d
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-x-5 gap-y-1 items-center">
        <div className="divide-y" style={{ borderColor: 'var(--color-rule)' }}>
          <Row label="FITNESS" value={String(Math.round(latest.ctl))} />
          <Row label="FATIGUE" value={String(Math.round(latest.atl))} />
          <Row label="FORM" value={signed(latest.tsb)} color={formColor(latest.tsb)} />
        </div>

        <div className="hidden sm:flex flex-col items-end gap-1 pl-4" style={{ borderLeft: '1px solid var(--color-rule)' }}>
          <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 9 }}>FITNESS</span>
          <Sparkline values={ctlValues} width={150} height={34} stroke="var(--color-ink-2)" showDot={false} />
          <span className="eyebrow mt-1" style={{ color: 'var(--color-muted)', fontSize: 9 }}>FATIGUE</span>
          <Sparkline values={atlValues} width={150} height={34} stroke="var(--color-muted)" showDot={false} />
        </div>
      </div>
    </div>
  )
}
