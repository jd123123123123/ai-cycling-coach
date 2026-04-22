import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, subDays } from 'date-fns'
import { ArrowUpRight, TrendingDown, TrendingUp, Minus, Info } from 'lucide-react'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { useGarminStatus } from '../../hooks/useGarminStatus'
import { useCountUp } from '../../hooks/useCountUp'
import { fadeSlideInitial, fadeSlideUp } from '../../utils/motion'
import type { DailyMetric } from '../../api/dashboard'
import ReadinessContributors from './ReadinessContributors'
import { SideSheet } from '../ui/SideSheet'
import BiometricsDetail from './BiometricsDetail'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  TIER_META,
  computeReadiness,
  latestWithData,
  readinessTier,
} from '../../utils/metrics'

// ─── Insight helpers ─────────────────────────────────────────────────────────
// Personal baseline percentile — "better than X% of your last N days" is the
// single most dopamine-loaded signal from Whoop/Oura. Computed client-side off
// the 30-day metrics window so we don't need any backend work.

function percentileRank(values: number[], target: number): number | null {
  const clean = values.filter((v) => Number.isFinite(v))
  if (clean.length < 3) return null
  const below = clean.filter((v) => v < target).length
  return Math.round((below / clean.length) * 100)
}

function readinessSeries(metrics: DailyMetric[]): Array<{ date: string; score: number }> {
  return metrics
    .map((m) => {
      const score = computeReadiness(m.hrv_status, m.body_battery, m.sleep_score)
      return score == null ? null : { date: m.date, score }
    })
    .filter((x): x is { date: string; score: number } => x != null)
}

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
  // Animate both the arc sweep and the big center number. The arc already
  // transitions via stroke-dasharray; we drive the number with the same
  // count-up used across the app for visual consistency.
  const animatedScore = useCountUp(scoreClamped, { durationMs: 1100, digits: 0 })
  const progressAngle = startAngle - (animatedScore / 100) * Math.PI

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
        {animatedScore}
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

// ─── Insight chips ───────────────────────────────────────────────────────────

function DeltaChip({ delta }: { delta: number }) {
  const rounded = Math.round(delta)
  const isUp = rounded > 0
  const isDown = rounded < 0
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus
  const color = isUp
    ? 'var(--color-forest-2)'
    : isDown
      ? 'var(--color-alert)'
      : 'var(--color-muted)'
  const bg = isUp
    ? 'rgba(48, 108, 64, 0.10)'
    : isDown
      ? 'rgba(138, 29, 29, 0.10)'
      : 'rgba(100, 100, 100, 0.08)'
  const sign = isUp ? '+' : ''
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 num-mono text-[12px]"
      style={{ color, backgroundColor: bg }}
      aria-label={`${sign}${rounded} vs yesterday`}
    >
      <Icon size={12} strokeWidth={2.2} />
      {sign}{rounded} <span className="opacity-70">vs yesterday</span>
    </span>
  )
}

// One-shot fade-slide wrapper — used for the insight strip so all chips lift
// in together instead of individually. Lighter than per-chip state.
function EnterGroup({
  children,
  delayMs = 0,
  className,
}: {
  children: React.ReactNode
  delayMs?: number
  className?: string
}) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <div
      className={className}
      style={visible ? fadeSlideUp({ delayMs }) : fadeSlideInitial}
    >
      {children}
    </div>
  )
}

function PercentileChip({ percentile, color }: { percentile: number; color: string }) {
  // Flip the framing above 50 so the message always reads as a positive
  // reinforcement ("Top 27%") or an honest mirror ("Bottom 18%"). Whoop does
  // the same inversion in its summaries.
  const label = percentile >= 50
    ? `Top ${100 - percentile}%`
    : `Bottom ${percentile}%`
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px]"
      style={{
        color,
        backgroundColor: 'rgba(0, 0, 0, 0.04)',
        border: '1px solid rgba(0, 0, 0, 0.06)',
      }}
      title={`Your readiness today ranks against the last 30 days`}
    >
      <span className="num-mono">{label}</span>
      <span className="opacity-60" style={{ color: 'var(--color-muted)' }}>· 30d</span>
    </span>
  )
}

function MetricChip({
  label,
  value,
  suffix,
}: {
  label: string
  value: number | null | undefined
  suffix?: string
}) {
  const display = value == null || !Number.isFinite(value) ? '—' : Math.round(value)
  return (
    <span
      className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px]"
      style={{
        backgroundColor: 'var(--color-paper)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <span
        className="eyebrow"
        style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.18em' }}
      >
        {label.toUpperCase()}
      </span>
      <span className="num-mono font-medium" style={{ color: 'var(--color-ink)' }}>
        {display}{suffix ?? ''}
      </span>
    </span>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ReadinessHero() {
  const today = new Date()
  // 30-day window so the hero can surface personal-baseline percentile +
  // day-over-day delta + mini-trend insights without extra API work.
  const thirtyDaysAgo = subDays(today, 30)

  const {
    data: metricsData,
    isLoading: metricsLoading,
    isError: metricsError,
    refetch,
  } = useDailyMetrics(thirtyDaysAgo, today)

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

  // Insight layer — computed off the 30-day window we already fetch.
  // Kept dead-simple: the hero doesn't need to be right about every edge,
  // it needs to make the user feel *seen*.
  const series = readinessSeries(metrics)
  const sortedByDate = series
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
  const latestIdx = latest ? sortedByDate.findIndex((s) => s.date === latest.date) : -1
  const prevScore = latestIdx > 0 ? sortedByDate[latestIdx - 1].score : null
  const delta = readiness != null && prevScore != null ? readiness - prevScore : null

  // Percentile excludes today so the comparison is "vs history", not "vs itself".
  const historicalScores = sortedByDate
    .filter((_, i) => i !== latestIdx)
    .map((s) => s.score)
  const percentile = readiness != null
    ? percentileRank(historicalScores, readiness)
    : null

  // Metric chips — pull raw numbers for the trio that drive readiness.
  const chips: Array<{ label: string; value: number | null | undefined; suffix?: string }> = latest
    ? [
        { label: 'Sleep', value: latest.sleep_score },
        { label: 'HRV', value: latest.hrv_status, suffix: '/100' },
        { label: 'Battery', value: latest.body_battery },
      ]
    : []

  // ⚠️ TEMPORARY WIRING: biometrics SideSheet opened from "Why this?" button.
  // Wave 3 replaces this with the unified ContributorsSheet that merges
  // TransparencyDrawer + WhyAmITired + BiometricsDetail. Keep the
  // data-testid="readiness-hero" — it is permanent.
  const [biometricsOpen, setBiometricsOpen] = useState(false)
  const { language } = useLanguage()

  return (
    // data-testid="readiness-hero" — permanent attribute used by StickyReadinessBar's
    // IntersectionObserver to know when the hero has scrolled out of view.
    <section data-testid="readiness-hero" className="flex flex-col gap-4">
      {/* HERO CARD — tier-tinted so the whole card signals body state at a
         glance. The radial gradient fades to the normal paper colour so the
         tint reads as atmosphere, not a hard block of colour. */}
      <div
        className="paper-grain relative rounded-[20px] overflow-hidden"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          border: '1px solid var(--color-rule)',
          backgroundImage: meta
            ? `radial-gradient(120% 80% at 0% 0%, color-mix(in srgb, ${meta.color} 14%, transparent), transparent 60%)`
            : undefined,
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
          <div className="flex items-center gap-3">
            {lastSync && (
              <span className="eyebrow opacity-70 num-mono">
                synced {lastSync}
              </span>
            )}
            {/* "Why this?" button — opens BiometricsDetail in a SideSheet.
                ⚠️ TEMPORARY: Wave 3 replaces with ContributorsSheet. */}
            {readiness != null && (
              <button
                type="button"
                onClick={() => setBiometricsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium min-h-[32px]"
                style={{
                  color: 'var(--color-ink-2)',
                  backgroundColor: 'var(--color-paper)',
                  border: '1px solid var(--color-rule)',
                }}
                title={language === 'simple' ? 'Why this score?' : 'Why this?'}
              >
                <Info size={11} strokeWidth={1.8} />
                {language === 'simple' ? 'Why?' : 'Why this?'}
              </button>
            )}
          </div>
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

                {/* Insight strip — delta vs yesterday · percentile vs last 30 days.
                   This is the "wow, I can't live without this" moment per Whoop/Oura
                   playbook: a raw score means nothing without personal context. */}
                {(delta != null || percentile != null) && (
                  <EnterGroup
                    delayMs={300}
                    className="flex items-center gap-2 flex-wrap mt-1"
                  >
                    {delta != null && (
                      <DeltaChip delta={delta} />
                    )}
                    {percentile != null && (
                      <PercentileChip percentile={percentile} color={meta.color} />
                    )}
                  </EnterGroup>
                )}

                {/* Supporting metric trio — the signals that drive readiness.
                   Small enough not to fight the hero number; present enough
                   that a glance tells you which system is carrying today. */}
                {chips.length > 0 && (
                  <EnterGroup
                    delayMs={500}
                    className="flex gap-2 flex-wrap pt-1"
                  >
                    {chips.map((c) => (
                      <MetricChip key={c.label} {...c} />
                    ))}
                  </EnterGroup>
                )}

                {/* Contributors drawer — "Why this score?" expander.
                   Direct counter to the #1 Whoop complaint: opaque scoring.
                   Show the math, always. */}
                <ReadinessContributors metrics={metrics} latest={latest ?? null} />
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

      {/* ⚠️ TEMPORARY: BiometricsDetail SideSheet wiring.
         Wave 3 ContributorsSheet replaces this. See 06.1-02-SUMMARY.md. */}
      <SideSheet
        open={biometricsOpen}
        onClose={() => setBiometricsOpen(false)}
        eyebrow="Contributors"
        title={language === 'simple' ? "What's driving it" : 'Readiness contributors'}
      >
        <BiometricsDetail />
      </SideSheet>
    </section>
  )
}

