import { Link } from 'react-router-dom'
import { format, subDays } from 'date-fns'
import { ArrowUpRight, Heart, Activity, Moon, Zap, Waves } from 'lucide-react'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { useGarminStatus } from '../../hooks/useGarminStatus'
import type { DailyMetric } from '../../api/dashboard'
import Sparkline from './Sparkline'
import {
  TIER_META,
  classifyMetric,
  computeReadiness,
  latestWithData,
  normalizeHrv,
  readinessTier,
  seriesForSparkline,
  trendDelta,
} from '../../utils/metrics'
import type { MetricZone } from '../../utils/metrics'
import { hrvBaselineBand } from '../../utils/advanced-metrics'
import type { HrvBandPoint } from '../../utils/advanced-metrics'

const ZONE_SWATCH: Record<MetricZone, string> = {
  good: 'var(--color-forest-2)',
  fair: 'var(--color-amber-2)',
  poor: 'var(--color-alert)',
  unknown: 'var(--color-muted)',
}

const ZONE_LABEL: Record<MetricZone, string> = {
  good: 'on point',
  fair: 'watch',
  poor: 'below base',
  unknown: '—',
}

// ─── DeltaChip ───────────────────────────────────────────────────────────────

function DeltaChip({
  pct,
  unit = '%',
  invertSentiment = false,
}: {
  pct: number | null
  unit?: string
  invertSentiment?: boolean
}) {
  if (pct == null || Number.isNaN(pct)) {
    return <span className="eyebrow opacity-60">no trend</span>
  }
  const isUp = pct > 0.5
  const isDown = pct < -0.5
  const isGood = invertSentiment ? isDown : isUp
  const isBad = invertSentiment ? isUp : isDown
  const color = isGood
    ? 'var(--color-forest-2)'
    : isBad
    ? 'var(--color-alert)'
    : 'var(--color-muted)'
  const arrow = isUp ? '▲' : isDown ? '▼' : '•'
  const abs = Math.abs(pct)
  const formatted = abs >= 10 ? abs.toFixed(0) : abs.toFixed(1)
  return (
    <span
      className="num-mono text-[11px] font-medium"
      style={{ color }}
      aria-label={`Trend ${isUp ? 'up' : isDown ? 'down' : 'flat'} ${formatted}${unit}`}
    >
      {arrow} {formatted}
      {unit}
    </span>
  )
}

// ─── KPI card ────────────────────────────────────────────────────────────────

interface KpiProps {
  icon: React.ReactNode
  label: string
  value: number | null
  unit?: string
  zone: MetricZone
  sparkValues: Array<number | null>
  delta: ReturnType<typeof trendDelta>
  invertDelta?: boolean
  /** Optional HRV band data — shown only on HRV tile */
  bandValues?: HrvBandPoint[]
  /** Band status microcopy shown above the value — only rendered if non-null */
  bandStatus?: string
  bandStatusColor?: string
}

function KpiCard({
  icon, label, value, unit, zone, sparkValues, delta, invertDelta,
  bandValues, bandStatus, bandStatusColor,
}: KpiProps) {
  const swatch = ZONE_SWATCH[zone]
  const zoneLabel = ZONE_LABEL[zone]
  return (
    <div
      className="paper-grain relative flex flex-col gap-3 rounded-[14px] p-4 min-w-0 transition-colors"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span style={{ color: swatch }} className="opacity-80">{icon}</span>
          <span className="eyebrow truncate">{label}</span>
        </div>
        <span
          className="eyebrow whitespace-nowrap"
          style={{ color: swatch, opacity: value == null ? 0.5 : 1 }}
        >
          {zoneLabel}
        </span>
      </div>

      {/* HRV baseline band status microcopy */}
      {bandStatus && (
        <span
          className="num-mono text-[10px] -mt-1"
          style={{ color: bandStatusColor ?? 'var(--color-muted)' }}
        >
          {bandStatus}
        </span>
      )}

      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span
            className="num-display text-[44px] leading-none"
            style={{ color: 'var(--color-ink)' }}
          >
            {value != null ? value : '—'}
          </span>
          {value != null && unit && (
            <span className="eyebrow" style={{ letterSpacing: '0.1em' }}>
              {unit}
            </span>
          )}
        </div>
        <div style={{ color: swatch }} className="flex-shrink-0">
          <Sparkline
            values={sparkValues}
            width={72}
            height={24}
            stroke={swatch}
            fill={swatch + '14'}
            bandValues={bandValues?.map((b) => ({ lower: b.lower, upper: b.upper }))}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <DeltaChip pct={delta?.pct ?? null} invertSentiment={invertDelta} />
        {delta && (
          <span className="eyebrow opacity-70">
            7d · {delta.baseline.toFixed(delta.baseline >= 100 ? 0 : 1)}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── ReadinessDial ───────────────────────────────────────────────────────────

function ReadinessDial({ score }: { score: number }) {
  const tier = readinessTier(score) ?? 'rest'
  const meta = TIER_META[tier]
  // Arc geometry — semi-circle gauge from -90° to 90° (pointing up)
  const size = 200
  const stroke = 16
  const radius = (size - stroke) / 2
  const cx = size / 2
  const cy = size / 2 + 4
  const startAngle = Math.PI
  const endAngle = 0
  const scoreClamped = Math.max(0, Math.min(100, score))
  const progressAngle = startAngle - (scoreClamped / 100) * Math.PI

  const polar = (angle: number, r: number) => [
    cx + r * Math.cos(angle),
    cy - r * Math.sin(angle),
  ]
  const [bgStartX, bgStartY] = polar(startAngle, radius)
  const [bgEndX, bgEndY] = polar(endAngle, radius)
  const [progEndX, progEndY] = polar(progressAngle, radius)

  // Notches for 0, 25, 50, 75, 100
  const notches = [0, 25, 50, 75, 100].map((v) => {
    const a = startAngle - (v / 100) * Math.PI
    const [x1, y1] = polar(a, radius - 2)
    const [x2, y2] = polar(a, radius + 10)
    return { v, x1, y1, x2, y2 }
  })

  return (
    <svg
      width={size}
      height={size / 2 + 28}
      viewBox={`0 0 ${size} ${size / 2 + 28}`}
      className="block"
      aria-label={`Readiness ${score} out of 100`}
    >
      {/* Background track */}
      <path
        d={`M ${bgStartX} ${bgStartY} A ${radius} ${radius} 0 0 1 ${bgEndX} ${bgEndY}`}
        fill="none"
        stroke="var(--color-rule)"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      {/* Progress arc */}
      <path
        d={`M ${bgStartX} ${bgStartY} A ${radius} ${radius} 0 0 1 ${progEndX} ${progEndY}`}
        fill="none"
        stroke={meta.color}
        strokeWidth={stroke}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 600ms ease' }}
      />
      {/* Notches */}
      {notches.map((n) => (
        <line
          key={n.v}
          x1={n.x1}
          y1={n.y1}
          x2={n.x2}
          y2={n.y2}
          stroke="var(--color-muted)"
          strokeWidth={1}
          opacity={0.25}
        />
      ))}
      {/* Center number */}
      <text
        x={cx}
        y={cy - 16}
        textAnchor="middle"
        className="num-display"
        style={{ fontSize: 64, fontWeight: 500, fill: 'var(--color-ink)' }}
      >
        {scoreClamped}
      </text>
      <text
        x={cx}
        y={cy + 10}
        textAnchor="middle"
        className="eyebrow"
        style={{ fill: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.24em' }}
      >
        READINESS · /100
      </text>
    </svg>
  )
}

// ─── Loading skeleton ────────────────────────────────────────────────────────

function HeroSkeleton() {
  return (
    <div
      className="paper-grain rounded-[20px] p-6 sm:p-8"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <div className="h-5 w-40 rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
      <div className="mt-6 h-24 rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
    </div>
  )
}

// ─── Coach's note — Phase 5 placeholder ──────────────────────────────────────

function CoachNote({ tierKey, metricsExist }: { tierKey: ReturnType<typeof readinessTier>; metricsExist: boolean }) {
  const tier = tierKey ?? 'rest'
  const meta = TIER_META[tier]
  const note = metricsExist
    ? meta.sentiment
    : 'Connect Garmin to unlock tailored daily guidance from your cycling coach.'
  return (
    <div
      className="relative rounded-[14px] px-5 py-4 sm:px-6 sm:py-5 overflow-hidden"
      style={{
        background: meta.bg,
        border: `1px solid ${meta.color}33`,
      }}
    >
      <div className="flex items-start gap-4">
        <div
          className="hidden sm:block w-[2px] h-10 rounded mt-1"
          style={{ backgroundColor: meta.color }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className="eyebrow"
              style={{ color: meta.color }}
            >
              Coach's note · today
            </span>
            <span
              className="num-mono text-[10px] px-2 py-0.5 rounded-sm"
              style={{
                color: 'var(--color-muted)',
                backgroundColor: 'rgba(20,24,17,0.04)',
                border: '1px solid var(--color-rule)',
              }}
            >
              AI brief in Phase 5
            </span>
          </div>
          <p
            className="serif-caps text-[17px] sm:text-[19px] leading-snug mt-2"
            style={{ color: 'var(--color-ink)' }}
          >
            {note}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ReadinessHero() {
  const today = new Date()
  const sevenDaysAgo = subDays(today, 7)

  const {
    data: metricsData,
    isLoading: metricsLoading,
    isError: metricsError,
    refetch,
  } = useDailyMetrics(sevenDaysAgo, today)

  const { data: garminData, isLoading: garminLoading } = useGarminStatus()

  const isLoading = metricsLoading || garminLoading

  if (isLoading) return <HeroSkeleton />

  // Garmin not connected — beautiful empty state
  if (garminData && !garminData.connected) {
    return (
      <div
        className="paper-grain rounded-[20px] p-6 sm:p-8 relative overflow-hidden"
        style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
      >
        <span
          className="num-display absolute -right-4 -top-2 opacity-[0.05] leading-none select-none pointer-events-none"
          style={{ fontSize: 180, color: 'var(--color-forest)' }}
          aria-hidden
        >
          Ø
        </span>
        <div className="relative">
          <span className="eyebrow" style={{ color: 'var(--color-forest)' }}>
            New rider · {format(today, 'EEEE · dd MMM')}
          </span>
          <h1
            className="num-display mt-3 leading-[0.95]"
            style={{ fontSize: 'clamp(42px, 7vw, 72px)', color: 'var(--color-ink)' }}
          >
            Let&apos;s map your body.
          </h1>
          <p
            className="mt-4 max-w-xl text-[15px] leading-relaxed"
            style={{ color: 'var(--color-ink-2)' }}
          >
            Connect your Garmin to start tracking sleep, HRV, body battery, stress,
            and training readiness — the raw material your coach uses to shape each day.
          </p>
          <Link
            to="/garmin/connect"
            className="mt-6 inline-flex items-center gap-2 rounded-full px-5 py-3 text-[14px] font-medium transition-transform hover:-translate-y-0.5"
            style={{
              backgroundColor: 'var(--color-ink)',
              color: 'var(--color-paper)',
            }}
          >
            Connect Garmin
            <ArrowUpRight size={16} strokeWidth={2} />
          </Link>
        </div>
      </div>
    )
  }

  if (metricsError) {
    return (
      <div
        className="paper-grain rounded-[20px] p-6 sm:p-8"
        style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
      >
        <span className="eyebrow" style={{ color: 'var(--color-alert)' }}>
          Couldn&apos;t load body status
        </span>
        <button
          onClick={() => void refetch()}
          className="mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium"
          style={{
            backgroundColor: 'var(--color-ink)',
            color: 'var(--color-paper)',
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  const metrics: DailyMetric[] = metricsData?.metrics ?? []
  const latest = latestWithData(metrics, 'sleep_score')
    ?? latestWithData(metrics, 'hrv_status')
    ?? latestWithData(metrics, 'body_battery')

  const readiness = latest
    ? computeReadiness(latest.hrv_status, latest.body_battery, latest.sleep_score)
    : null

  const tier = readinessTier(readiness)
  const meta = tier ? TIER_META[tier] : null

  const metricDate = latest?.date ? new Date(latest.date) : today
  const lastSync = garminData?.last_sync_at
    ? format(new Date(garminData.last_sync_at), 'MMM d, HH:mm')
    : null

  return (
    <section className="flex flex-col gap-5">
      {/* HERO CARD */}
      <div
        className="paper-grain relative rounded-[20px] overflow-hidden"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          border: '1px solid var(--color-rule)',
        }}
      >
        {/* Top meta row */}
        <div className="flex items-center justify-between px-6 pt-5 sm:px-8 sm:pt-7">
          <div className="flex items-center gap-3">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: meta?.color ?? 'var(--color-muted)' }}
              aria-hidden
            />
            <span className="eyebrow">
              {format(metricDate, 'EEEE · dd MMM yyyy')}
            </span>
          </div>
          {lastSync && (
            <span className="eyebrow opacity-70 num-mono">
              synced {lastSync}
            </span>
          )}
        </div>

        {/* Main reading */}
        <div className="px-6 pb-7 pt-4 sm:px-8 sm:pb-9 sm:pt-5 grid gap-6 sm:gap-10 sm:grid-cols-[auto_1fr] items-center">
          {readiness != null && tier && meta ? (
            <>
              <div className="flex flex-col items-center sm:items-start -mt-2">
                <ReadinessDial score={readiness} />
              </div>
              <div className="flex flex-col gap-3 min-w-0">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span
                    className="serif-caps text-[11px] tracking-[0.28em] uppercase"
                    style={{ color: meta.color }}
                  >
                    {meta.label}
                  </span>
                  <span
                    className="num-mono text-[11px]"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    verdict
                  </span>
                </div>
                <h1
                  className="num-display leading-[0.95]"
                  style={{
                    fontSize: 'clamp(36px, 5.5vw, 56px)',
                    color: 'var(--color-ink)',
                  }}
                >
                  {meta.verb} today.
                </h1>
                <p
                  className="text-[15px] leading-relaxed max-w-lg"
                  style={{ color: 'var(--color-ink-2)' }}
                >
                  {meta.sentiment}
                </p>
              </div>
            </>
          ) : (
            <div className="col-span-full">
              <span className="eyebrow">Awaiting metrics</span>
              <p
                className="num-display mt-3 leading-[0.95]"
                style={{
                  fontSize: 'clamp(32px, 4.5vw, 48px)',
                  color: 'var(--color-ink)',
                }}
              >
                Your next sync will paint this in.
              </p>
              <p
                className="mt-3 text-[14px] max-w-md"
                style={{ color: 'var(--color-ink-2)' }}
              >
                Garmin is connected but hasn&apos;t delivered biometrics yet — usually
                an overnight wait.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* KPI STRIP */}
      <KpiStrip metrics={metrics} />

      {/* COACH'S NOTE */}
      <CoachNote tierKey={tier} metricsExist={readiness != null} />
    </section>
  )
}

// ─── KPI strip — 5 metrics with sparklines ───────────────────────────────────

function KpiStrip({ metrics }: { metrics: DailyMetric[] }) {
  // Build ordered windows for each KPI. Metrics are ASC by date.
  const sleepSeries = seriesForSparkline(metrics, 'sleep_score')
  const hrvSeries = metrics.map((m) => normalizeHrv(m.hrv_status))
  const batterySeries = seriesForSparkline(metrics, 'body_battery')
  const stressSeries = seriesForSparkline(metrics, 'stress_level')
  const restingHrSeries = seriesForSparkline(metrics, 'resting_hr')

  // Adjusted metrics for HRV (normalized) — rebuild a tiny array for trendDelta
  const sleepDelta = trendDelta(metrics, 'sleep_score')
  const batteryDelta = trendDelta(metrics, 'body_battery')
  const stressDelta = trendDelta(metrics, 'stress_level')
  const restingHrDelta = trendDelta(metrics, 'resting_hr')
  // HRV delta via synthetic array (normalized values)
  const hrvVals = hrvSeries.filter((v): v is number => v != null)
  const hrvDelta = (() => {
    if (hrvVals.length < 2) return null
    const current = hrvVals[hrvVals.length - 1]
    const prior = hrvVals.slice(0, -1)
    const baseline = prior.reduce((s, v) => s + v, 0) / prior.length
    if (baseline === 0) return null
    const delta = current - baseline
    const pct = (delta / baseline) * 100
    return { current, delta, pct, baseline }
  })()

  const latestSleep = sleepSeries.findLast?.((v) => v != null) ?? null
  const latestHrv = hrvSeries.findLast?.((v) => v != null) ?? null
  const latestBattery = batterySeries.findLast?.((v) => v != null) ?? null
  const latestStress = stressSeries.findLast?.((v) => v != null) ?? null
  const latestRestingHr = restingHrSeries.findLast?.((v) => v != null) ?? null

  // HRV baseline band (Whoop-style rolling mean ± 1 std-dev)
  const hrvBand = hrvBaselineBand(hrvSeries, 7)
  const latestBand = hrvBand[hrvBand.length - 1]

  // Derive band status microcopy
  const hrvBandStatus = (() => {
    if (latestHrv == null || latestBand?.lower == null || latestBand?.upper == null) return null
    const lower = Math.round(latestBand.lower)
    const upper = Math.round(latestBand.upper)
    if (latestHrv >= lower && latestHrv <= upper) {
      return { text: `In range · ${lower}–${upper}`, color: 'var(--color-forest-2)' }
    }
    if (latestHrv < lower) {
      return { text: 'Below base', color: 'var(--color-alert)' }
    }
    return { text: 'Above base', color: 'var(--color-forest-2)' }
  })()

  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
      <KpiCard
        icon={<Moon size={14} strokeWidth={1.8} />}
        label="Sleep"
        value={latestSleep != null ? Math.round(latestSleep) : null}
        unit="/ 100"
        zone={classifyMetric(latestSleep, 80, 60, true)}
        sparkValues={sleepSeries}
        delta={sleepDelta}
      />
      <KpiCard
        icon={<Heart size={14} strokeWidth={1.8} />}
        label="HRV"
        value={latestHrv != null ? Math.round(latestHrv) : null}
        unit="idx"
        zone={classifyMetric(latestHrv, 60, 40, true)}
        sparkValues={hrvSeries}
        delta={hrvDelta}
        bandValues={hrvBand}
        bandStatus={hrvBandStatus?.text}
        bandStatusColor={hrvBandStatus?.color}
      />
      <KpiCard
        icon={<Zap size={14} strokeWidth={1.8} />}
        label="Body Battery"
        value={latestBattery != null ? Math.round(latestBattery) : null}
        unit="/ 100"
        zone={classifyMetric(latestBattery, 60, 30, true)}
        sparkValues={batterySeries}
        delta={batteryDelta}
      />
      <KpiCard
        icon={<Waves size={14} strokeWidth={1.8} />}
        label="Stress"
        value={latestStress != null ? Math.round(latestStress) : null}
        unit="avg"
        zone={classifyMetric(latestStress, 30, 60, false)}
        sparkValues={stressSeries}
        delta={stressDelta}
        invertDelta
      />
      <KpiCard
        icon={<Activity size={14} strokeWidth={1.8} />}
        label="Resting HR"
        value={latestRestingHr != null ? Math.round(latestRestingHr) : null}
        unit="bpm"
        zone={classifyMetric(latestRestingHr, 55, 70, false)}
        sparkValues={restingHrSeries}
        delta={restingHrDelta}
        invertDelta
      />
    </div>
  )
}
