import { Link } from 'react-router-dom'
import { format, subDays } from 'date-fns'
import { ArrowUpRight } from 'lucide-react'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { useGarminStatus } from '../../hooks/useGarminStatus'
import type { DailyMetric } from '../../api/dashboard'
import CoachBrief from './CoachBrief'
import {
  TIER_META,
  computeReadiness,
  latestWithData,
  readinessTier,
} from '../../utils/metrics'

// Phase 5.1: DeltaChip + KpiCard helpers previously lived here to power an
// in-hero KPI strip. They were moved out (not just hidden) because the
// dashboard now surfaces raw KPIs via KpiStripCompact in fold 2 — the hero
// renders the readiness dial only, keeping fold 1 focused on the prescribed
// workout. This is the "one call-to-action per fold" rule.

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

      {/* COACH BRIEF — live causal AI brief (Phase 5.1 prescriptive workout).
         Phase 5.1 note: the old in-hero KpiStrip was moved to KpiStripCompact
         (fold 2) to honor the iPhone-hierarchy rule: fold 1 has ONE call-to-action. */}
      <CoachBrief />
    </section>
  )
}

