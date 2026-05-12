import { useMemo } from 'react'
import { subDays } from 'date-fns'
import { usePMC } from '../../hooks/usePMC'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import type { PMCEntry, DailyMetric } from '../../api/dashboard'
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

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

/**
 * HRV-adjusted form (TSB′). Calendar TSB is pure load arithmetic; if HRV is
 * suppressed vs your 28-day baseline you're more fatigued than the number says
 * (and vice-versa). TSB' = TSB × (1 + clamp((hrv7 − hrv28)/hrv28, ±0.3)).
 * Returns null when there isn't enough HRV history — caller falls back to raw.
 */
function hrvAdjustedTsb(tsb: number, metrics: DailyMetric[]): { value: number; factorPct: number } | null {
  const now = Date.now()
  const d7 = subDays(new Date(), 7).getTime()
  const hrv28 = metrics.map((m) => m.hrv_status).filter((v): v is number => v != null)
  const hrv7 = metrics
    .filter((m) => new Date(m.recorded_at).getTime() >= d7 && new Date(m.recorded_at).getTime() <= now)
    .map((m) => m.hrv_status)
    .filter((v): v is number => v != null)
  const m28 = mean(hrv28)
  const m7 = mean(hrv7)
  if (m28 == null || m7 == null || m28 === 0 || hrv7.length < 2) return null
  const factor = Math.max(-0.3, Math.min(0.3, (m7 - m28) / m28))
  return { value: tsb * (1 + factor), factorPct: Math.round(factor * 100) }
}

function Row({
  label,
  value,
  color = 'var(--color-ink)',
  sub,
  title,
}: {
  label: string
  value: string
  color?: string
  sub?: string
  title?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5" title={title}>
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
  const today = useMemo(() => new Date(), [])
  const { data: metricsResp } = useDailyMetrics(useMemo(() => subDays(today, 28), [today]), today)

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

  const adj = hrvAdjustedTsb(latest.tsb, metricsResp?.metrics ?? [])
  const formVal = adj ? adj.value : latest.tsb
  const formSub = adj ? "′" : undefined
  const formTitle = adj
    ? `HRV-adjusted form (TSB′). Raw TSB ${signed(latest.tsb)} · HRV ${adj.factorPct >= 0 ? '+' : ''}${adj.factorPct}% vs 28d baseline`
    : `Form (TSB) — calendar load balance`

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
          <Row label="FORM" value={signed(formVal)} sub={formSub} title={formTitle} color={formColor(formVal)} />
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
