import { useMemo } from 'react'
import { subDays } from 'date-fns'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { usePMC } from '../../hooks/usePMC'
import type { DailyMetric } from '../../api/dashboard'

// ─── Types ──────────────────────────────────────────────────────────────────

type DeltaTone = 'good' | 'warn' | 'bad' | 'neutral'

interface KpiCell {
  key: string
  label: string
  value: string | null
  unit?: string
  delta?: string | null
  tone: DeltaTone
  higherIsBetter?: boolean
  intradayKey?: string
}

// ─── Math helpers ───────────────────────────────────────────────────────────

function meanOfRecent(metrics: DailyMetric[], key: keyof DailyMetric, days: number): number | null {
  if (metrics.length === 0) return null
  const sorted = metrics
    .slice()
    .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
    .slice(0, days)
  const vals = sorted
    .map((m) => m[key])
    .filter((v): v is number => typeof v === 'number')
  if (vals.length === 0) return null
  return vals.reduce((s, v) => s + v, 0) / vals.length
}

function latestValue(metrics: DailyMetric[], key: keyof DailyMetric): number | null {
  const sorted = metrics
    .slice()
    .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
  for (const m of sorted) {
    const v = m[key]
    if (typeof v === 'number') return v
  }
  return null
}

function toneFromPct(pct: number | null, higherIsBetter: boolean): DeltaTone {
  if (pct === null) return 'neutral'
  const abs = Math.abs(pct)
  const positive = pct >= 0
  if (abs < 3) return 'neutral'
  const good = higherIsBetter ? positive : !positive
  if (abs > 10) return good ? 'good' : 'bad'
  return good ? 'good' : 'warn'
}

function fmtNumber(value: number | null, decimals = 0): string | null {
  if (value === null) return null
  return value.toFixed(decimals)
}

function fmtDelta(pct: number | null): string | null {
  if (pct === null || !isFinite(pct)) return null
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(0)}%`
}

// ─── Cell component ─────────────────────────────────────────────────────────

function KpiCellView({ cell }: { cell: KpiCell }) {
  const toneColor: Record<DeltaTone, string> = {
    good: 'var(--color-forest-2)',
    warn: 'var(--color-amber)',
    bad: 'var(--color-alert)',
    neutral: 'var(--color-muted)',
  }

  const Icon =
    cell.tone === 'good' ? ArrowUpRight :
    cell.tone === 'bad' || cell.tone === 'warn' ? ArrowDownRight :
    Minus

  return (
    <div
      className="flex flex-col gap-1 min-w-0 px-3 py-3"
      style={{ borderRight: '1px solid var(--color-rule)' }}
    >
      <span className="eyebrow" style={{ color: 'var(--color-muted)' }}>
        {cell.label}
      </span>
      <div className="flex items-baseline gap-1 min-w-0">
        <span
          className="num-mono dashboard-break-words"
          style={{
            fontSize: 'clamp(20px, 2.6vw, 26px)',
            color: 'var(--color-ink)',
            lineHeight: 1,
          }}
        >
          {cell.value ?? '—'}
        </span>
        {cell.unit && (
          <span
            className="num-mono text-[10px]"
            style={{ color: 'var(--color-muted)' }}
          >
            {cell.unit}
          </span>
        )}
      </div>
      {cell.delta && (
        <span
          className="inline-flex items-center gap-0.5 num-mono text-[11px]"
          style={{ color: toneColor[cell.tone] }}
        >
          <Icon size={10} strokeWidth={2} />
          {cell.delta}
        </span>
      )}
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function KpiStripCompact() {
  const today = new Date()
  const thirtyDaysAgo = subDays(today, 30)

  const { data: metricsData, isLoading: metricsLoading } = useDailyMetrics(thirtyDaysAgo, today)
  const { data: pmcData, isLoading: pmcLoading } = usePMC(30)

  const cells = useMemo<KpiCell[]>(() => {
    const metrics = metricsData?.metrics ?? []
    const pmc = pmcData?.entries ?? []

    // HRV
    const hrvLatest = latestValue(metrics, 'hrv_status')
    const hrv7d = meanOfRecent(metrics, 'hrv_status', 7)
    const hrv28d = meanOfRecent(metrics, 'hrv_status', 28)
    const hrvDelta = hrv7d !== null && hrv28d !== null && hrv28d !== 0
      ? ((hrv7d - hrv28d) / hrv28d) * 100
      : null

    // Body battery
    const bbLatest = latestValue(metrics, 'body_battery')
    const bb7d = meanOfRecent(metrics, 'body_battery', 7)
    const bb28d = meanOfRecent(metrics, 'body_battery', 28)
    const bbDelta = bb7d !== null && bb28d !== null && bb28d !== 0
      ? ((bb7d - bb28d) / bb28d) * 100
      : null

    // Sleep
    const sleepLatest = latestValue(metrics, 'sleep_score')
    const sleep7d = meanOfRecent(metrics, 'sleep_score', 7)
    const sleep28d = meanOfRecent(metrics, 'sleep_score', 28)
    const sleepDelta = sleep7d !== null && sleep28d !== null && sleep28d !== 0
      ? ((sleep7d - sleep28d) / sleep28d) * 100
      : null

    // PMC latest entry
    const pmcLatest = pmc[pmc.length - 1]
    const tsb = pmcLatest?.tsb ?? null
    const ctl = pmcLatest?.ctl ?? null

    // Compute 7d vs 28d TSB / CTL deltas
    const tsb28 = pmc.length >= 28 ? pmc[pmc.length - 28]?.tsb : null
    const tsbDelta = tsb !== null && tsb28 !== null && tsb28 !== 0
      ? ((tsb - tsb28) / Math.abs(tsb28)) * 100
      : null

    const ctl28 = pmc.length >= 28 ? pmc[pmc.length - 28]?.ctl : null
    const ctlDelta = ctl !== null && ctl28 !== null && ctl28 !== 0
      ? ((ctl - ctl28) / ctl28) * 100
      : null

    // rHR
    const rhrLatest = latestValue(metrics, 'resting_hr')
    const rhr7d = meanOfRecent(metrics, 'resting_hr', 7)
    const rhr28d = meanOfRecent(metrics, 'resting_hr', 28)
    const rhrDelta = rhr7d !== null && rhr28d !== null && rhr28d !== 0
      ? ((rhr7d - rhr28d) / rhr28d) * 100
      : null

    return [
      {
        key: 'hrv',
        label: 'HRV',
        value: fmtNumber(hrvLatest, 0),
        unit: 'ms',
        delta: fmtDelta(hrvDelta),
        tone: toneFromPct(hrvDelta, true),
        higherIsBetter: true,
        intradayKey: 'hrv',
      },
      {
        key: 'body-batt',
        label: 'Body batt',
        value: fmtNumber(bbLatest, 0),
        unit: '/100',
        delta: fmtDelta(bbDelta),
        tone: toneFromPct(bbDelta, true),
        higherIsBetter: true,
      },
      {
        key: 'sleep',
        label: 'Sleep',
        value: fmtNumber(sleepLatest, 0),
        unit: 'score',
        delta: fmtDelta(sleepDelta),
        tone: toneFromPct(sleepDelta, true),
        higherIsBetter: true,
      },
      {
        key: 'tsb',
        label: 'TSB',
        value: tsb !== null ? (tsb >= 0 ? `+${tsb.toFixed(0)}` : tsb.toFixed(0)) : null,
        unit: '',
        delta: fmtDelta(tsbDelta),
        // TSB: very negative = bad; fresh+ = neutral; near zero = optimal
        tone: tsb === null ? 'neutral'
          : tsb < -20 ? 'bad'
          : tsb < -10 ? 'warn'
          : tsb > 20 ? 'warn'
          : 'good',
      },
      {
        key: 'ctl',
        label: 'CTL',
        value: fmtNumber(ctl, 0),
        unit: '',
        delta: fmtDelta(ctlDelta),
        tone: toneFromPct(ctlDelta, true),
        higherIsBetter: true,
      },
      {
        key: 'rhr',
        label: 'rHR',
        value: fmtNumber(rhrLatest, 0),
        unit: 'bpm',
        delta: fmtDelta(rhrDelta),
        // rHR lower is better — a rise is warning
        tone: toneFromPct(rhrDelta, false),
        higherIsBetter: false,
        intradayKey: 'resting_hr',
      },
    ]
  }, [metricsData, pmcData])

  const isLoading = metricsLoading || pmcLoading

  if (isLoading) {
    return (
      <div
        className="rounded-[12px] h-[84px] animate-pulse"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          border: '1px solid var(--color-rule)',
        }}
      />
    )
  }

  return (
    <div
      className="rounded-[12px] overflow-hidden grid grid-cols-3 sm:grid-cols-6 min-w-0"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
      aria-label="Daily KPI strip"
    >
      {cells.map((c, idx) => (
        <div
          key={c.key}
          // Remove right border from the last col on each row to avoid stutter
          className={`${(idx + 1) % 3 === 0 ? 'border-r-transparent' : ''} ${idx >= 3 ? 'border-t sm:border-t-0' : ''}`}
          style={{ minWidth: 0 }}
        >
          <KpiCellView cell={c} />
        </div>
      ))}
    </div>
  )
}
