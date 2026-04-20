import { useEffect, useMemo, useRef, useState } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { format, subDays } from 'date-fns'
import { Heart, Moon, Zap, Waves, Activity, ArrowUpRight, Gauge, Wind, Mountain } from 'lucide-react'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import type { DailyMetric } from '../../api/dashboard'
import { efficiencyFactorSeries, movingAverage } from '../../utils/advanced-metrics'
import Sparkline from './Sparkline'
import IntradayModal, { type IntradayMetric } from './IntradayModal'

type Range = 14 | 30 | 90

const RANGES: { key: Range; label: string }[] = [
  { key: 14, label: '14d' },
  { key: 30, label: '30d' },
  { key: 90, label: '90d' },
]

interface BiometricSpec {
  key: keyof DailyMetric
  label: string
  unit: string
  color: string
  icon: React.ReactNode
  higherIsBetter: boolean
  /** Ideal-range zone for the band coloring */
  good?: number
  warn?: number
  /** Descriptive copy under the title */
  copy: string
  /** If set, clicking a point on this chart opens the IntradayModal with this metric.
   *  Sleep and resting HR have no per-minute granularity from Garmin — leave null. */
  intraday: IntradayMetric | null
}

const BIOMETRICS: BiometricSpec[] = [
  {
    key: 'hrv_status',
    label: 'Heart rate variability',
    unit: 'ms',
    color: '#1c4433',
    icon: <Heart size={14} strokeWidth={1.8} />,
    higherIsBetter: true,
    good: 60,
    warn: 40,
    copy: 'Morning HRV. Trending up = parasympathetic recovery; down = stress load.',
    intraday: 'hrv',
  },
  {
    key: 'body_battery',
    label: 'Body battery',
    unit: '/100',
    color: '#2a6147',
    icon: <Zap size={14} strokeWidth={1.8} />,
    higherIsBetter: true,
    good: 60,
    warn: 30,
    copy: 'Garmin\u2019s composite energy reserve from HRV + activity + sleep.',
    intraday: 'body_battery',
  },
  {
    key: 'sleep_score',
    label: 'Sleep score',
    unit: '/100',
    color: '#143555',
    icon: <Moon size={14} strokeWidth={1.8} />,
    higherIsBetter: true,
    good: 80,
    warn: 60,
    copy: 'Overall sleep quality. 80+ = restorative; under 60 = deficit accumulating.',
    intraday: null,
  },
  {
    key: 'stress_level',
    label: 'Stress',
    unit: 'avg',
    color: '#b04a0c',
    icon: <Waves size={14} strokeWidth={1.8} />,
    higherIsBetter: false,
    good: 25,
    warn: 50,
    copy: 'Daily average sympathetic load (0\u2013100). Lower is better.',
    intraday: 'stress',
  },
  {
    key: 'resting_hr',
    label: 'Resting heart rate',
    unit: 'bpm',
    color: '#8a1d1d',
    icon: <Activity size={14} strokeWidth={1.8} />,
    higherIsBetter: false,
    good: 55,
    warn: 68,
    copy: 'Morning resting HR. A sustained rise of 5+ bpm = hidden fatigue or illness.',
    intraday: null,
  },
]

// ─── Reusable uPlot detail chart ───────────────────────────────────────────────

function DetailChart({
  spec,
  dates,
  values,
  heightPx,
  onPointClick,
}: {
  spec: BiometricSpec
  dates: number[] // unix timestamps in seconds
  values: Array<number | null>
  heightPx: number
  /** Called with ISO date (yyyy-mm-dd) when user clicks a point on the chart. */
  onPointClick?: (iso: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)

  // Stats
  const numeric = values.filter((v): v is number => v != null)
  const hasData = numeric.length >= 2
  const current = (() => {
    for (let i = values.length - 1; i >= 0; i--) {
      if (values[i] != null) return values[i]!
    }
    return null
  })()
  const avg = numeric.length > 0 ? numeric.reduce((s, v) => s + v, 0) / numeric.length : null
  const min = numeric.length > 0 ? Math.min(...numeric) : null
  const max = numeric.length > 0 ? Math.max(...numeric) : null

  // Zone classification for current value
  const zone = (() => {
    if (current == null || spec.good == null || spec.warn == null) return 'unknown'
    if (spec.higherIsBetter) {
      if (current >= spec.good) return 'good'
      if (current < spec.warn) return 'poor'
      return 'fair'
    } else {
      if (current <= spec.good) return 'good'
      if (current > spec.warn) return 'poor'
      return 'fair'
    }
  })()
  const zoneColor =
    zone === 'good'
      ? 'var(--color-forest-2)'
      : zone === 'fair'
      ? 'var(--color-amber-2)'
      : zone === 'poor'
      ? 'var(--color-alert)'
      : 'var(--color-muted)'

  useEffect(() => {
    const el = containerRef.current
    if (!el || dates.length === 0) return

    const width = el.clientWidth || 400
    const color = spec.color

    // Convert nulls to NaN so uPlot draws gaps properly
    const yData = values.map((v) => (v == null ? null : v)) as Array<number | null>

    // Build data where uPlot skips nulls (uPlot v1.6+ supports nulls with gaps:true on series)
    const opts: uPlot.Options = {
      width,
      height: heightPx,
      series: [
        {},
        {
          label: spec.label,
          stroke: color,
          width: 2,
          fill: color + '18',
          points: { show: true, size: 4, stroke: color, fill: color },
          spanGaps: false,
        },
      ],
      axes: [
        {
          stroke: '#757465',
          grid: { show: false },
          ticks: { show: false },
          font: '11px Geist, sans-serif',
          size: 30,
          values: (_u, splits) =>
            splits.map((ts) => format(new Date(ts * 1000), 'd MMM')),
        },
        {
          stroke: '#757465',
          grid: {
            stroke: '#e2d8c0',
            width: 0.5,
            dash: [2, 3],
          },
          ticks: { show: false },
          font: '11px Geist, sans-serif',
          size: 36,
        },
      ],
      hooks: {
        drawClear: [
          (u) => {
            // Paint ideal-range band if thresholds exist
            if (spec.good == null || spec.warn == null) return
            const ctx = u.ctx
            const [zoneTop, zoneBot] = spec.higherIsBetter
              ? [spec.good, spec.warn]
              : [spec.warn, spec.good]
            const yTopPx = u.valToPos(Math.max(zoneTop, zoneBot), 'y', true)
            const yBotPx = u.valToPos(Math.min(zoneTop, zoneBot), 'y', true)
            ctx.save()
            ctx.fillStyle = color + '12'
            ctx.fillRect(u.bbox.left, yTopPx, u.bbox.width, yBotPx - yTopPx)
            // Also paint avg baseline as dashed line
            if (avg != null) {
              const yAvg = u.valToPos(avg, 'y', true)
              ctx.strokeStyle = color + '70'
              ctx.setLineDash([4, 3])
              ctx.lineWidth = 1
              ctx.beginPath()
              ctx.moveTo(u.bbox.left, yAvg)
              ctx.lineTo(u.bbox.left + u.bbox.width, yAvg)
              ctx.stroke()
            }
            ctx.restore()
          },
        ],
        setCursor: [
          (u) => {
            const tip = tooltipRef.current
            if (!tip) return
            const idx = u.cursor.idx
            if (idx == null || u.cursor.left == null || u.cursor.left < 0) {
              tip.style.opacity = '0'
              return
            }
            const ts = u.data[0][idx]
            const val = u.data[1][idx]
            if (ts == null) { tip.style.opacity = '0'; return }
            const date = new Date((ts as number) * 1000)
            const dateLabel = format(date, 'EEE, d MMM yyyy')
            const valueLabel =
              val == null
                ? 'no reading'
                : `${Math.round(val as number).toLocaleString()} ${spec.unit}`
            tip.innerHTML = `<div class="num-mono text-[10px]" style="color:var(--color-muted);letter-spacing:0.1em;text-transform:uppercase">${dateLabel}</div><div class="num-display text-[18px] leading-tight" style="color:var(--color-ink)">${valueLabel}</div>`
            // Position tooltip near the cursor, clamped to container bounds
            const el = containerRef.current
            if (!el) return
            const tipWidth = 160
            const tipHeight = 48
            let left = (u.cursor.left as number) + 14
            if (left + tipWidth > el.clientWidth - 4) {
              left = (u.cursor.left as number) - tipWidth - 14
            }
            let top = (u.cursor.top as number) - tipHeight - 8
            if (top < 0) top = (u.cursor.top as number) + 12
            tip.style.left = `${left}px`
            tip.style.top = `${top}px`
            tip.style.opacity = '1'
          },
        ],
      },
      cursor: {
        drag: { x: false },
        focus: { prox: 24 },
        // Vertical guide line on hover
        x: true,
        y: false,
      },
      legend: { show: false },
    }

    const data: uPlot.AlignedData = [dates, yData]
    const plot = new uPlot(opts, data, el)
    plotRef.current = plot

    const ro = new ResizeObserver(() => {
      if (el) plot.setSize({ width: el.clientWidth, height: heightPx })
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      plot.destroy()
      plotRef.current = null
    }
  }, [dates, values, heightPx, spec, avg])

  const handleClick = () => {
    if (!onPointClick) return
    const plot = plotRef.current
    if (!plot) return
    const idx = plot.cursor.idx
    if (idx == null) return
    const ts = dates[idx]
    if (ts == null) return
    const iso = new Date(ts * 1000).toISOString().slice(0, 10)
    onPointClick(iso)
  }

  return (
    <div
      className="paper-grain relative rounded-[18px] overflow-hidden flex flex-col"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      {/* Header */}
      <div className="px-5 pt-5 sm:px-6 sm:pt-6 pb-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span style={{ color: spec.color }} className="opacity-80">
              {spec.icon}
            </span>
            <span className="eyebrow truncate">{spec.label}</span>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {hasData && (
              <span
                className="eyebrow whitespace-nowrap"
                style={{ color: zoneColor }}
              >
                {zone === 'good'
                  ? 'on point'
                  : zone === 'fair'
                  ? 'watch'
                  : zone === 'poor'
                  ? 'below base'
                  : '—'}
              </span>
            )}
            {spec.intraday && hasData && (
              <span
                className="eyebrow opacity-60 flex items-center gap-1 whitespace-nowrap"
                title="Click any day on the chart to see the 24h curve"
              >
                tap to explore
                <ArrowUpRight size={11} strokeWidth={2} />
              </span>
            )}
          </div>
        </div>

        {/* Big number — current value with unit */}
        <div className="flex items-baseline gap-2 mt-2">
          <span
            className="num-display leading-none"
            style={{ fontSize: 'clamp(36px, 4.5vw, 52px)', color: 'var(--color-ink)' }}
          >
            {current != null ? Math.round(current) : '—'}
          </span>
          <span
            className="num-mono text-[12px]"
            style={{ color: 'var(--color-muted)' }}
          >
            {spec.unit}
          </span>
        </div>

        {/* Micro stats row */}
        {hasData && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
            <span
              className="num-mono text-[11px]"
              style={{ color: 'var(--color-muted)' }}
            >
              avg {avg != null ? avg.toFixed(1) : '—'}
            </span>
            <span
              className="num-mono text-[11px]"
              style={{ color: 'var(--color-muted)' }}
            >
              min {min != null ? Math.round(min) : '—'}
            </span>
            <span
              className="num-mono text-[11px]"
              style={{ color: 'var(--color-muted)' }}
            >
              max {max != null ? Math.round(max) : '—'}
            </span>
          </div>
        )}

        <p
          className="mt-2 text-[12px] leading-snug"
          style={{ color: 'var(--color-ink-2)' }}
        >
          {spec.copy}
        </p>
      </div>

      {/* Chart area */}
      <div
        className="px-3 pb-4 pt-2 sm:px-4 min-w-0 relative"
        onClick={spec.intraday && hasData ? handleClick : undefined}
        style={{ cursor: spec.intraday && hasData ? 'pointer' : 'default' }}
      >
        {hasData ? (
          <>
            <div ref={containerRef} className="w-full min-w-0" />
            <div
              ref={tooltipRef}
              className="pointer-events-none absolute px-3 py-2 rounded-lg flex flex-col gap-0.5"
              style={{
                backgroundColor: 'var(--color-paper-2)',
                border: '1px solid var(--color-rule)',
                boxShadow: '0 10px 26px -12px rgba(20,24,17,0.28)',
                opacity: 0,
                transition: 'opacity 80ms ease',
                zIndex: 10,
                whiteSpace: 'nowrap',
              }}
            />
          </>
        ) : (
          <div
            className="w-full flex items-center justify-center text-center px-6"
            style={{ height: heightPx }}
          >
            <p
              className="serif-caps text-[14px] max-w-xs"
              style={{ color: 'var(--color-muted)' }}
            >
              Not enough data yet in this window. Check back after a few more sync cycles.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BiometricsDetail() {
  const [range, setRange] = useState<Range>(30)
  const today = useMemo(() => new Date(), [])
  const start = useMemo(() => subDays(today, range), [today, range])

  // Intraday drill-down state
  const [openIso, setOpenIso] = useState<string | null>(null)
  const [openMetric, setOpenMetric] = useState<IntradayMetric>('body_battery')
  const handlePointClick = (m: IntradayMetric) => (iso: string) => {
    setOpenMetric(m)
    setOpenIso(iso)
  }

  const { data, isLoading, isError, refetch } = useDailyMetrics(start, today)

  // Normalize: build per-day series covering every day in range (null for missing)
  const { dates, seriesByKey } = useMemo(() => {
    const byDate = new Map<string, DailyMetric>()
    for (const m of data?.metrics ?? []) {
      if (m.date) byDate.set(m.date, m)
    }
    const dayDates: number[] = []
    const perKey: Record<string, Array<number | null>> = {
      hrv_status: [],
      body_battery: [],
      sleep_score: [],
      stress_level: [],
      resting_hr: [],
    }
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - i)
      dayDates.push(d.getTime() / 1000)
      const iso = d.toISOString().slice(0, 10)
      const entry = byDate.get(iso)
      for (const key of Object.keys(perKey)) {
        const raw = entry ? (entry as unknown as Record<string, unknown>)[key] : null
        perKey[key].push(typeof raw === 'number' ? raw : null)
      }
    }
    return { dates: dayDates, seriesByKey: perKey }
  }, [data, range, today])

  return (
    <section className="flex flex-col gap-5">
      {/* Section header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <span className="eyebrow" style={{ color: 'var(--color-amber)' }}>
            Chapter II · Biometrics
          </span>
          <h2
            className="num-display mt-1 leading-none"
            style={{
              fontSize: 'clamp(28px, 4vw, 40px)',
              color: 'var(--color-ink)',
            }}
          >
            How the body is trending.
          </h2>
        </div>
        {/* Range toggle */}
        <div
          className="rounded-full p-0.5 inline-flex flex-shrink-0"
          style={{
            backgroundColor: 'rgba(20, 24, 17, 0.05)',
            border: '1px solid var(--color-rule)',
          }}
        >
          {RANGES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setRange(key)}
              className="py-2 px-3.5 text-[12px] font-medium rounded-full transition-all min-h-[36px]"
              style={{
                color: range === key ? 'var(--color-paper)' : 'var(--color-ink-2)',
                backgroundColor: range === key ? 'var(--color-ink)' : 'transparent',
                letterSpacing: '0.02em',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading / error */}
      {isLoading ? (
        <div className="grid gap-5 md:grid-cols-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-[260px] rounded-[18px] animate-pulse"
              style={{ backgroundColor: 'var(--color-rule)' }}
            />
          ))}
        </div>
      ) : isError ? (
        <div
          className="rounded-[18px] p-6 flex items-center justify-between flex-wrap gap-3"
          style={{
            backgroundColor: 'var(--color-paper-2)',
            border: '1px solid var(--color-rule)',
          }}
        >
          <span style={{ color: 'var(--color-alert)' }}>
            Couldn&apos;t load biometrics.
          </span>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-medium"
            style={{
              backgroundColor: 'var(--color-ink)',
              color: 'var(--color-paper)',
            }}
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {BIOMETRICS.map((spec) => (
            <DetailChart
              key={spec.key as string}
              spec={spec}
              dates={dates}
              values={seriesByKey[spec.key as string] ?? []}
              heightPx={200}
              onPointClick={spec.intraday ? handlePointClick(spec.intraday) : undefined}
            />
          ))}
        </div>
      )}

      {/* Advanced ride-science tiles — EF trend + decoupling + durability */}
      {!isLoading && !isError && <AdvancedMetricsStrip range={range} />}

      <IntradayModal
        open={openIso != null}
        onClose={() => setOpenIso(null)}
        iso={openIso}
        initialMetric={openMetric}
      />
    </section>
  )
}

// ─── Advanced metrics strip ──────────────────────────────────────────────────

interface AdvTileProps {
  icon: React.ReactNode
  label: string
  value: string | null
  unit?: string
  copy: string
  copyMuted?: string
  color: string
  trendValues?: Array<number | null>
  eyebrow?: string
  eyebrowColor?: string
}

function AdvancedTile({
  icon, label, value, unit, copy, copyMuted, color, trendValues, eyebrow, eyebrowColor,
}: AdvTileProps) {
  const hasTrend = trendValues && trendValues.some((v) => v != null)
  return (
    <div
      className="paper-grain relative rounded-[16px] p-4 sm:p-5 flex flex-col gap-3 min-w-0"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span style={{ color }} className="opacity-80">{icon}</span>
          <span className="eyebrow truncate">{label}</span>
        </div>
        {eyebrow && (
          <span className="eyebrow whitespace-nowrap" style={{ color: eyebrowColor ?? color }}>
            {eyebrow}
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span
            className="num-display leading-none"
            style={{ fontSize: 32, color: value != null ? 'var(--color-ink)' : 'var(--color-muted)' }}
          >
            {value ?? '—'}
          </span>
          {value != null && unit && (
            <span className="num-mono text-[11px]" style={{ color: 'var(--color-muted)' }}>
              {unit}
            </span>
          )}
        </div>
        {hasTrend && (
          <div style={{ color }} className="flex-shrink-0">
            <Sparkline values={trendValues} width={72} height={28} stroke={color} fill={color + '18'} />
          </div>
        )}
      </div>

      <p className="text-[11px] leading-snug" style={{ color: 'var(--color-ink-2)' }}>
        {copy}
        {copyMuted && (
          <span className="block mt-0.5 num-mono text-[10px]" style={{ color: 'var(--color-muted)' }}>
            {copyMuted}
          </span>
        )}
      </p>
    </div>
  )
}

function AdvancedMetricsStrip({ range }: { range: Range }) {
  const today = useMemo(() => new Date(), [])
  const start = useMemo(() => subDays(today, range), [today, range])
  const { data: activitiesData, isLoading } = useActivitiesRange(start, today)
  const activities = activitiesData?.activities ?? []

  const efPoints = useMemo(() => efficiencyFactorSeries(activities), [activities])
  const efMa = useMemo(() => movingAverage(efPoints, 28), [efPoints])

  // Build 14-slot EF trend (most-recent 14 rides) for the sparkline
  const efTrend = useMemo(() => {
    const tail = efPoints.slice(-14)
    return tail.map((p) => p.ef)
  }, [efPoints])

  // Current vs 28d avg for eyebrow delta
  const efLatest = efPoints.length > 0 ? efPoints[efPoints.length - 1].ef : null
  const efAvg = efMa.length > 0 ? efMa[efMa.length - 1].value : null
  const efDelta = efLatest != null && efAvg != null && efAvg !== 0
    ? ((efLatest - efAvg) / efAvg) * 100
    : null

  const efEyebrow = efDelta != null
    ? `${efDelta >= 0 ? '+' : ''}${efDelta.toFixed(1)}% vs 28d`
    : undefined
  const efEyebrowColor = efDelta == null
    ? 'var(--color-muted)'
    : efDelta >= 0 ? 'var(--color-forest-2)' : 'var(--color-amber-2)'

  // Decoupling + durability require power/HR sample streams that the current
  // /activities payload doesn't carry — the coach backend computes these via
  // advanced_metrics.compute_activity_metrics(), but there's no exposed client
  // endpoint yet. We surface the tiles now with a clear placeholder so the
  // shape is in place for when a /coach/metrics-trend route ships.
  const hasCyclingRides = activities.some((a) => a.sport === 'cycling')

  const placeholderCopy = hasCyclingRides
    ? 'Requires per-ride power + heart-rate samples — a backend trend endpoint will light this up.'
    : 'Ride cycling with a power meter and heart-rate strap to unlock this.'

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[0,1,2].map((i) => (
          <div key={i} className="h-[140px] rounded-[16px] animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className="eyebrow" style={{ color: 'var(--color-forest)' }}>
          Chapter II · Advanced ride science
        </span>
        <span className="num-mono text-[11px]" style={{ color: 'var(--color-muted)' }}>
          {activities.filter((a) => a.sport === 'cycling').length} cycling rides · {range}d
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <AdvancedTile
          icon={<Wind size={14} strokeWidth={1.8} />}
          label="Efficiency Factor"
          value={efLatest != null ? efLatest.toFixed(2) : null}
          unit="W/bpm"
          copy="NP divided by average heart rate — rising week-over-week = deeper aerobic base."
          copyMuted={efPoints.length > 0 ? `${efPoints.length} rides in window` : undefined}
          color="#1c4433"
          trendValues={efTrend}
          eyebrow={efEyebrow}
          eyebrowColor={efEyebrowColor}
        />
        <AdvancedTile
          icon={<Gauge size={14} strokeWidth={1.8} />}
          label="Aerobic decoupling"
          value={null}
          unit="%"
          copy="HR drift second-half vs first-half at steady power. Friel's most important aerobic-base metric."
          copyMuted={placeholderCopy}
          color="#b04a0c"
          eyebrow="sample-stream only"
          eyebrowColor="var(--color-muted)"
        />
        <AdvancedTile
          icon={<Mountain size={14} strokeWidth={1.8} />}
          label="Durability index"
          value={null}
          copy="Late-ride power as a fraction of fresh power after ~1000 kJ. The 2025 differentiator in endurance performance."
          copyMuted={placeholderCopy}
          color="#143555"
          eyebrow="sample-stream only"
          eyebrowColor="var(--color-muted)"
        />
      </div>
    </div>
  )
}
