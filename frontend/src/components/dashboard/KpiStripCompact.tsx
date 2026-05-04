import { useMemo } from 'react'
import { subDays } from 'date-fns'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { usePMC } from '../../hooks/usePMC'
import { useTodaySnapshot } from '../../hooks/useTodaySnapshot'
import type { DailyMetric } from '../../api/dashboard'
import { useLanguage } from '../../contexts/LanguageContext'
import { translateCoach } from '../../utils/coachLanguage'
import { useCountUp } from '../../hooks/useCountUp'
import Sparkline from './Sparkline'
import { toneFromPct as toneFromPctShared, tokenForTone } from '../../utils/delta'
import { formatSigned } from '../../utils/format'

// ─── Types ──────────────────────────────────────────────────────────────────

interface KpiCell {
  key: string
  label: string
  value: string | null
  rawValue: number | null
  digits?: number
  format?: (n: number) => string
  unit?: string
  delta?: string | null
  /** CSS color string — produced by tokenForTone(toneFromPct(…)) from utils/delta */
  tone: string
  /** Whether positive delta is good (true) or bad (false); used to pick arrow icon */
  higherIsBetter?: boolean
  deltaPct?: number | null
  intradayKey?: string
  tooltip?: string
  sparkline?: Array<number | null>
  sparklineColor?: string
  // Step 6: when set, the cell renders a compact `wake → now` pair instead
  // of the count-up number. Only Battery uses this; Stress/HRV stay as their
  // existing single-value tiles per the today-runthrough scope.
  wakeNow?: { wake: number | null; now: number | null }
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

function sparklineSeries(metrics: DailyMetric[], key: keyof DailyMetric, days: number): Array<number | null> {
  const sorted = metrics
    .slice()
    .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
    .slice(-days)
  return sorted.map((m) => {
    const v = m[key]
    return typeof v === 'number' ? v : null
  })
}

/** Compute a CSS color token from a percent change and direction. */
function cellTone(pct: number | null, higherIsBetter: boolean): string {
  return tokenForTone(toneFromPctShared(pct, higherIsBetter ? 'good' : 'bad'))
}

function fmtNumber(value: number | null, decimals = 0): string | null {
  if (value === null) return null
  return value.toFixed(decimals)
}

function fmtDelta(pct: number | null): string | null {
  if (pct === null || !isFinite(pct)) return null
  return formatSigned(pct, 0) + '%'
}

// ─── Cell component ─────────────────────────────────────────────────────────

function KpiCellView({ cell }: { cell: KpiCell }) {
  // cell.tone is already a CSS var() string — use directly
  const toneColor = cell.tone

  // Determine arrow direction from deltaPct + higherIsBetter.
  // Muted tone → show Minus; positive delta in good direction → ArrowUpRight; else ArrowDownRight.
  const dp = cell.deltaPct
  const Icon =
    dp == null || Math.abs(dp) < 3 ? Minus :
    (dp > 0) === (cell.higherIsBetter !== false) ? ArrowUpRight :
    ArrowDownRight

  // Count-up: if rawValue present, animate the number on mount.
  // TSB can be negative — useCountUp handles it since skipZero only skips if target===0.
  const animated = useCountUp(cell.rawValue ?? 0, {
    durationMs: 900,
    digits: cell.digits ?? 0,
    skipZero: false,
  })
  const displayValue = cell.rawValue == null
    ? '—'
    : cell.format
      ? cell.format(animated)
      : animated.toFixed(cell.digits ?? 0)

  return (
    <div
      className="group flex flex-col gap-1 min-w-0 px-3 py-3 cursor-default transition-colors"
      style={{
        borderRight: '1px solid var(--color-rule)',
        transition: 'background-color 180ms ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor =
          'color-mix(in srgb, var(--color-rule) 40%, transparent)'
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
      }}
      title={cell.tooltip}
    >
      <span className="eyebrow" style={{ color: 'var(--color-muted)' }}>
        {cell.label}
      </span>
      <div className="flex items-baseline gap-1 min-w-0">
        {cell.wakeNow ? (
          // Step 6: compact wake → now pair for Battery only. Same tile
          // styling — just two stacked-baseline numerals with a discreet
          // arrow. `now` carries the dominant size to keep the eye on the
          // current reading; `wake` is the reference.
          <>
            <span
              className="num-mono"
              style={{
                color: 'var(--color-ink-2)',
                fontSize: 13,
              }}
            >
              {cell.wakeNow.wake == null ? '—' : Math.round(cell.wakeNow.wake)}
            </span>
            <span style={{ color: 'var(--color-muted)', fontSize: 11 }}>→</span>
            <span
              className="num-mono dashboard-break-words"
              style={{
                fontSize: 'clamp(20px, 2.6vw, 26px)',
                color: 'var(--color-ink)',
                lineHeight: 1,
              }}
            >
              {cell.wakeNow.now == null ? '—' : Math.round(cell.wakeNow.now)}
            </span>
          </>
        ) : (
          <>
            <span
              className="num-mono dashboard-break-words"
              style={{
                fontSize: 'clamp(20px, 2.6vw, 26px)',
                color: 'var(--color-ink)',
                lineHeight: 1,
              }}
            >
              {displayValue}
            </span>
            {cell.unit && cell.rawValue != null && (
              <span
                className="num-mono text-[10px]"
                style={{ color: 'var(--color-muted)' }}
              >
                {cell.unit}
              </span>
            )}
          </>
        )}
      </div>
      {cell.sparkline && cell.sparkline.some((v) => v != null) && (
        <div className="mt-0.5 -mx-0.5" aria-hidden>
          {/* Per-KPI mini-trend — stroke matches delta tone (single source of truth).
              Width=64 height=16 keeps it inside the cell budget without breaking the strip height. */}
          <Sparkline
            values={cell.sparkline}
            width={64}
            height={16}
            stroke={toneColor}
            showDot
          />
        </div>
      )}
      {cell.delta && (
        <span
          className="inline-flex items-center gap-0.5 num-mono text-[11px]"
          style={{ color: toneColor }}
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
  const { data: snapshot } = useTodaySnapshot()
  const { language } = useLanguage()

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

    // Steps — daily movement outside structured training; key recovery signal
    const stepsLatest = latestValue(metrics, 'steps')
    const steps7d = meanOfRecent(metrics, 'steps', 7)
    const steps28d = meanOfRecent(metrics, 'steps', 28)
    const stepsDelta = steps7d !== null && steps28d !== null && steps28d !== 0
      ? ((steps7d - steps28d) / steps28d) * 100
      : null

    const tsbLabel = language === 'simple' ? 'Freshness' : 'TSB'
    const ctlLabel = language === 'simple' ? 'Fitness' : 'CTL'

    const hrvSparkline = sparklineSeries(metrics, 'hrv_status', 14)
    const rhrSparkline = sparklineSeries(metrics, 'resting_hr', 14)
    const sleepSparkline = sparklineSeries(metrics, 'sleep_score', 14)

    return [
      {
        key: 'hrv',
        label: 'HRV',
        value: fmtNumber(hrvLatest, 0),
        rawValue: hrvLatest,
        unit: 'ms',
        delta: fmtDelta(hrvDelta),
        tone: cellTone(hrvDelta, true),
        deltaPct: hrvDelta,
        higherIsBetter: true,
        intradayKey: 'hrv',
        tooltip: translateCoach('kpi.hrv.tooltip', language),
        sparkline: hrvSparkline,
        sparklineColor: 'var(--color-forest-2)',
      },
      {
        key: 'body-batt',
        // Step 6: Battery is the only KPI that gets a wake → now pair in the
        // strip. When the snapshot is unavailable (cold start, sleep window
        // missing) we fall back to the latest single value so the tile never
        // collapses to two `—`s.
        label: 'Body batt',
        value: fmtNumber(bbLatest, 0),
        rawValue: bbLatest,
        unit: snapshot?.body_battery ? undefined : '/100',
        delta: snapshot?.body_battery ? null : fmtDelta(bbDelta),
        tone: cellTone(bbDelta, true),
        deltaPct: bbDelta,
        higherIsBetter: true,
        tooltip: translateCoach('kpi.bodyBatt.tooltip', language),
        wakeNow: snapshot?.body_battery
          ? {
              wake: snapshot.body_battery.wake,
              now: snapshot.body_battery.now ?? bbLatest,
            }
          : undefined,
      },
      {
        key: 'sleep',
        label: 'Sleep',
        value: fmtNumber(sleepLatest, 0),
        rawValue: sleepLatest,
        unit: 'score',
        delta: fmtDelta(sleepDelta),
        tone: cellTone(sleepDelta, true),
        deltaPct: sleepDelta,
        higherIsBetter: true,
        tooltip: translateCoach('kpi.sleep.tooltip', language),
        sparkline: sleepSparkline,
        sparklineColor: '#0A84FF',
      },
      {
        key: 'tsb',
        label: tsbLabel,
        value: tsb !== null ? (tsb >= 0 ? `+${tsb.toFixed(0)}` : tsb.toFixed(0)) : null,
        rawValue: tsb,
        format: (n: number) => n >= 0 ? `+${Math.round(n)}` : `${Math.round(n)}`,
        unit: '',
        delta: fmtDelta(tsbDelta),
        // TSB has a non-monotonic good/bad logic: extreme positive TSB is also a warning.
        // Keep this bespoke mapping and convert to a CSS token directly.
        tone: tsb === null ? 'var(--color-muted)'
          : tsb < -20 ? 'var(--color-alert)'
          : tsb < -10 ? 'var(--color-amber)'
          : tsb > 20 ? 'var(--color-amber)'
          : 'var(--color-forest-2)',
        deltaPct: tsbDelta,
        tooltip: translateCoach('kpi.tsb.tooltip', language),
      },
      {
        key: 'ctl',
        label: ctlLabel,
        value: fmtNumber(ctl, 0),
        rawValue: ctl,
        unit: '',
        delta: fmtDelta(ctlDelta),
        tone: cellTone(ctlDelta, true),
        deltaPct: ctlDelta,
        higherIsBetter: true,
        tooltip: translateCoach('kpi.ctl.tooltip', language),
      },
      {
        key: 'rhr',
        label: 'rHR',
        value: fmtNumber(rhrLatest, 0),
        rawValue: rhrLatest,
        unit: 'bpm',
        delta: fmtDelta(rhrDelta),
        tone: cellTone(rhrDelta, false),
        deltaPct: rhrDelta,
        higherIsBetter: false,
        intradayKey: 'resting_hr',
        tooltip: translateCoach('kpi.rhr.tooltip', language),
        sparkline: rhrSparkline,
        sparklineColor: 'rgba(214, 87, 47, 0.8)',
      },
      {
        key: 'steps',
        label: language === 'simple' ? 'Steps' : 'Steps',
        value: stepsLatest != null ? Math.round(stepsLatest).toLocaleString() : null,
        rawValue: stepsLatest,
        format: (n: number) => Math.round(n).toLocaleString(),
        unit: '',
        delta: fmtDelta(stepsDelta),
        tone: cellTone(stepsDelta, true),
        deltaPct: stepsDelta,
        higherIsBetter: true,
        tooltip: 'Daily steps — active recovery movement between training sessions.',
      },
    ]
  }, [metricsData, pmcData, snapshot, language])

  const isLoading = metricsLoading || pmcLoading

  if (isLoading) {
    return (
      <div
        className="rounded-[12px] h-[84px] shimmer-bg overflow-hidden"
        style={{ border: '1px solid var(--color-rule)' }}
        aria-hidden
      />
    )
  }

  return (
    <div
      className="rounded-[12px] overflow-hidden grid grid-cols-4 sm:grid-cols-7 min-w-0"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
      aria-label="Daily KPI strip"
    >
      {cells.map((c, idx) => (
        <div
          key={c.key}
          className={`${(idx + 1) % 4 === 0 ? 'border-r-transparent' : ''} ${idx >= 4 ? 'border-t sm:border-t-0' : ''}`}
          style={{ minWidth: 0 }}
        >
          <KpiCellView cell={c} />
        </div>
      ))}
    </div>
  )
}
