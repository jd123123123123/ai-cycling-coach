import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, startOfWeek, subDays } from 'date-fns'
import { ArrowUpRight, TrendingDown, TrendingUp, Minus, Info } from 'lucide-react'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { useGarminStatus } from '../../hooks/useGarminStatus'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useCountUp } from '../../hooks/useCountUp'
import { useTodaySnapshot, type WakeNowPair } from '../../hooks/useTodaySnapshot'
import { useIntradayDay } from '../../hooks/useIntraday'
import { fadeSlideInitial, fadeSlideUp } from '../../utils/motion'
import { formatSigned } from '../../utils/format'
import type { DailyMetric } from '../../api/dashboard'
import ReadinessContributors from './ReadinessContributors'
import ContributorsSheet from './ContributorsSheet'
import UncertainValue from './UncertainValue'
import Sparkline from './Sparkline'
import { useLanguage } from '../../contexts/LanguageContext'
import { useLocale } from '../../contexts/LocaleContext'
import { confidence, MIN_DAYS_HRV } from '../../utils/confidence'
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
// in-hero KPI strip. They were removed — the readiness dial is the
// canonical single score; contributors live in ContributorsSheet.
// This is the "one call-to-action per fold" rule (Phase 7.05 Plan 02).

// ─── ActivityRings — 3 concentric rings (Apple Watch / Whoop style) ───────────
// Outer ring = weekly training load vs target hours
// Middle ring = readiness / recovery (the main score)
// Inner ring = last night's sleep score

const RING_LOAD_COLOR = '#BF5AF2'   // purple — load/strain
const RING_SLEEP_COLOR = '#0A84FF'  // blue   — sleep

function ActivityRings({
  score,
  sleepScore,
  loadPct,
}: {
  score: number
  sleepScore: number | null
  loadPct: number
}) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const tier = readinessTier(score) ?? 'rest'
  const meta = TIER_META[tier]

  const size = 240
  const cx = size / 2   // 120
  const cy = size / 2   // 120
  const sw = 11         // strokeWidth — consistent across all rings

  // Rings ordered outer→inner: Load, Recovery, Sleep
  const ringDefs = [
    { r: 98,  color: RING_LOAD_COLOR,   rawPct: Math.max(0, Math.min(100, loadPct)),           label: 'Load',     durationMs: 1100 },
    { r: 78,  color: meta.color,        rawPct: Math.max(0, Math.min(100, score)),              label: 'Recovery', durationMs: 1200 },
    { r: 58,  color: RING_SLEEP_COLOR,  rawPct: Math.max(0, Math.min(100, sleepScore ?? 0)),   label: 'Sleep',    durationMs: 1000 },
  ]

  // Three separate count-up animations drive both the ring fill and the stat label
  const animLoad     = useCountUp(ringDefs[0].rawPct, { durationMs: ringDefs[0].durationMs, digits: 0 })
  const animRecovery = useCountUp(ringDefs[1].rawPct, { durationMs: ringDefs[1].durationMs, digits: 0 })
  const animSleep    = useCountUp(ringDefs[2].rawPct, { durationMs: ringDefs[2].durationMs, digits: 0 })
  const animValues   = [animLoad, animRecovery, animSleep]

  return (
    <div className="flex flex-col items-center gap-3 shrink-0">
      {/* Ring canvas */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
        aria-label={de
          ? `Erholung ${score}, Schlaf ${sleepScore ?? 0}, Wochenbelastung ${Math.round(loadPct)}%`
          : `Recovery ${score}, Sleep ${sleepScore ?? 0}, Weekly load ${Math.round(loadPct)}%`}
      >
        {/* Ambient glow — recovery tier color bleeds through center */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(50% 50% at 50% 50%, color-mix(in srgb, ${meta.color} 22%, transparent) 0%, transparent 100%)`,
            filter: 'blur(28px)',
            transform: 'scale(0.55)',
            animation: 'fade-in 1s ease-out 600ms both',
          }}
          aria-hidden
        />

        {/* SVG rotated -90° so all rings start at 12 o'clock */}
        <svg
          width={size}
          height={size}
          style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}
          aria-hidden
        >
          <defs>
            {ringDefs.map((_, i) => (
              <filter key={i} id={`rg-tip-${i}`} x="-70%" y="-70%" width="240%" height="240%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ))}
          </defs>

          {ringDefs.map((ring, i) => {
            const circ = 2 * Math.PI * ring.r
            const anim = animValues[i]
            const offset = circ * (1 - anim / 100)
            const tipAngle = (anim / 100) * 2 * Math.PI
            const tipX = cx + ring.r * Math.cos(tipAngle)
            const tipY = cy + ring.r * Math.sin(tipAngle)
            return (
              <g key={i}>
                {/* Track */}
                <circle cx={cx} cy={cy} r={ring.r} fill="none"
                  stroke="var(--color-rule)" strokeWidth={sw} opacity={0.4} />
                {/* Progress */}
                <circle cx={cx} cy={cy} r={ring.r} fill="none"
                  stroke={ring.color} strokeWidth={sw}
                  strokeLinecap="round"
                  strokeDasharray={`${circ} ${circ}`}
                  strokeDashoffset={offset} />
                {/* Glowing tip dot */}
                {anim > 2 && (
                  <circle cx={tipX} cy={tipY} r={sw / 2 + 1.5}
                    fill={ring.color}
                    filter={`url(#rg-tip-${i})`}
                    style={{
                      animation: 'tip-glow-pulse 2.4s ease-in-out infinite',
                      animationDelay: `${i * 400}ms`,
                      transformOrigin: `${tipX}px ${tipY}px`,
                    }}
                  />
                )}
              </g>
            )
          })}
        </svg>

        {/* Center overlay — recovery score, not rotated */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ animation: 'score-enter 700ms cubic-bezier(.22,1,.36,1) 350ms both' }}
        >
          <span
            className="num-display leading-none"
            style={{ fontSize: 58, color: 'var(--color-ink)' }}
          >
            {animRecovery}
          </span>
          <span
            className="eyebrow mt-1"
            style={{ color: 'var(--color-muted)', fontSize: 8, letterSpacing: '0.3em' }}
          >
            {de ? 'DEINE ERHOLUNG' : 'YOUR RECOVERY'}
          </span>
        </div>
      </div>

      {/* Ring legend — 3 pills showing each ring's value */}
      <div
        className="flex items-center gap-3"
        style={{ animation: 'fade-in 400ms ease-out 900ms both' }}
      >
        {[
          { color: RING_SLEEP_COLOR, label: de ? 'Schlaf' : 'Sleep', value: animSleep },
          { color: meta.color,       label: de ? 'Erholung' : 'Recovery', value: animRecovery },
          { color: RING_LOAD_COLOR,  label: de ? 'Belastung' : 'Load', value: animLoad, suffix: '%' },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: s.color }}
              aria-hidden
            />
            <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 9 }}>
              {s.label.toUpperCase()}
            </span>
            <span className="num-mono text-[12px]" style={{ color: s.color }}>
              {s.value}{s.suffix ?? ''}
            </span>
          </div>
        ))}
      </div>
    </div>
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
  const { locale } = useLocale()
  const de = locale === 'de'
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
    ? 'rgba(48, 209, 88, 0.14)'
    : isDown
      ? 'rgba(255, 69, 58, 0.14)'
      : 'rgba(255, 255, 255, 0.07)'
  const signedStr = formatSigned(rounded, 0)
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 num-mono text-[12px]"
      style={{ color, backgroundColor: bg }}
      aria-label={`${signedStr} ${de ? 'ggü. gestern' : 'vs yesterday'}`}
    >
      <Icon size={12} strokeWidth={2.2} />
      {signedStr} <span className="opacity-70">{de ? 'ggü. gestern' : 'vs yesterday'}</span>
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
  const { locale } = useLocale()
  const de = locale === 'de'
  // Flip the framing above 50 so the message always reads as a positive
  // reinforcement ("Top 27%") or an honest mirror ("Bottom 18%"). Whoop does
  // the same inversion in its summaries.
  const label = percentile >= 50
    ? `Top ${100 - percentile}%`
    : `${de ? 'Untere' : 'Bottom'} ${percentile}%`
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px]"
      style={{
        color,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        border: '1px solid rgba(255, 255, 255, 0.09)',
      }}
      title={de
        ? `Deine Erholung heute im Vergleich zu den letzten 30 Tagen`
        : `Your readiness today ranks against the last 30 days`}
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

// ─── Wake → Now row (Step 6 — today-runthrough) ──────────────────────────────
// Whoop-grade discipline: dominant numeral = `now`, monochrome surface, single
// accent on the delta arrow. The wake reading and arrow are subordinated so the
// eye lands on "where you are right now" before reading drift. Sparkline hugs
// the row baseline; we reuse the existing Sparkline primitive rather than
// introducing a new SVG idiom.

function WakeNowRow({
  label,
  pair,
  sparkline,
}: {
  label: string
  pair: WakeNowPair
  sparkline?: Array<number | null>
}) {
  const wake = pair.wake
  const now = pair.now
  const hasPair = wake != null && now != null
  const delta = hasPair ? now - wake : null

  // Color discipline: a drop in body battery / stress is interpreted by the
  // user — we don't impose good/bad, just direction. The arrow gets ink-2
  // tone unless the delta is large enough to be informative on its own.
  const arrow = delta == null
    ? null
    : delta < 0 ? '▼'
    : delta > 0 ? '▲'
    : '·'

  const wakeStr = wake == null ? '—' : Math.round(wake).toString()
  const nowStr = now == null ? '—' : Math.round(now).toString()
  const deltaStr = delta == null ? '' : `${Math.abs(Math.round(delta))}`

  return (
    <div className="flex items-center gap-3 min-w-0">
      <span
        className="eyebrow shrink-0"
        style={{
          color: 'var(--color-muted)',
          fontSize: 10,
          letterSpacing: '0.18em',
          width: 56,
        }}
      >
        {label.toUpperCase()}
      </span>
      <div className="flex items-baseline gap-1.5 num-mono">
        <span
          style={{
            color: 'var(--color-ink-2)',
            fontSize: 14,
          }}
        >
          {wakeStr}
        </span>
        <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>→</span>
        <span
          style={{
            color: 'var(--color-ink)',
            fontSize: 22,
            lineHeight: 1,
          }}
        >
          {nowStr}
        </span>
        {arrow && delta !== 0 && (
          <span
            style={{
              color: 'var(--color-ink-2)',
              fontSize: 11,
              marginLeft: 4,
            }}
          >
            {arrow}{deltaStr}
          </span>
        )}
      </div>
      {sparkline && sparkline.some((v) => v != null) && (
        <div className="ml-auto" aria-hidden>
          <Sparkline
            values={sparkline}
            width={84}
            height={22}
            stroke="var(--color-ink-2)"
            showDot
          />
        </div>
      )}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ReadinessHero() {
  const today = new Date()
  const thirtyDaysAgo = subDays(today, 30)
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })

  const {
    data: metricsData,
    isLoading: metricsLoading,
    isError: metricsError,
    refetch,
  } = useDailyMetrics(thirtyDaysAgo, today)

  const { data: garminData, isLoading: garminLoading } = useGarminStatus()
  const { data: weekActs } = useActivitiesRange(weekStart, today)
  const { data: profile } = useAthleteProfile()

  // All hooks MUST be called before any early returns (Rules of Hooks).
  const [contributorsOpen, setContributorsOpen] = useState(false)
  const { language } = useLanguage()
  const { locale } = useLocale()
  const de = locale === 'de'

  // Step 6: wake → now snapshot. Hook stays unconditional at the top per the
  // 06.1-03 ContributorsSheet hoist precedent; downstream we tolerate undefined.
  const { data: snapshot } = useTodaySnapshot()

  // 6h intraday sparkline source — already cached for 30min by useIntradayDay
  // and shared with the existing biometrics drawer. No extra request when the
  // user has already opened today's intraday surfaces.
  const todayIso = format(today, 'yyyy-MM-dd')
  const { data: intraday } = useIntradayDay(todayIso)

  // Slice last 6h of body_battery samples for the hero sparkline. We don't
  // surface stress/HRV sparklines on small wake→now rows — the band is too
  // narrow to be honest with sub-points-per-hour.
  const sixHourSparkline = useMemo<Array<number | null>>(() => {
    const points = intraday?.body_battery ?? []
    if (points.length === 0) return []
    const cutoff = Date.now() - 6 * 60 * 60 * 1000
    return points
      .filter((p) => new Date(p.t).getTime() >= cutoff)
      .map((p) => (typeof p.v === 'number' ? p.v : null))
  }, [intraday])

  // Weekly load ring — hours trained this week vs target (from athlete profile)
  const loadPct = useMemo(() => {
    const acts = weekActs?.activities ?? []
    const weeklyHours = acts.reduce((s, a) => s + (a.duration_seconds ?? 0), 0) / 3600
    const targetHours = profile?.weekly_hours_available ?? 10
    return Math.min(100, (weeklyHours / targetHours) * 100)
  }, [weekActs, profile])

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
            {de ? 'Neuer Fahrer' : 'New rider'} · {format(today, 'EEEE · dd MMM')}
          </span>
          <h1
            className="num-display mt-3 leading-[0.95]"
            style={{ fontSize: 'clamp(42px, 7vw, 72px)', color: 'var(--color-ink)' }}
          >
            {de ? 'Lass uns deinen Körper vermessen.' : "Let's map your body."}
          </h1>
          <p
            className="mt-4 max-w-xl text-[15px] leading-relaxed"
            style={{ color: 'var(--color-ink-2)' }}
          >
            {de
              ? 'Verbinde dein Garmin, um Schlaf, HRV, Body Battery, Stress und Trainingsbereitschaft zu erfassen — das Rohmaterial, aus dem dein Coach jeden Tag formt.'
              : 'Connect your Garmin to start tracking sleep, HRV, body battery, stress, and training readiness — the raw material your coach uses to shape each day.'}
          </p>
          <Link
            to="/garmin/connect"
            className="mt-6 inline-flex items-center gap-2 rounded-full px-5 py-3 text-[14px] font-medium transition-transform hover:-translate-y-0.5"
            style={{
              backgroundColor: 'var(--color-ink)',
              color: 'var(--color-paper)',
            }}
          >
            {de ? 'Garmin verbinden' : 'Connect Garmin'}
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
          {de ? 'Körperstatus konnte nicht geladen werden' : "Couldn't load body status"}
        </span>
        <button
          onClick={() => void refetch()}
          className="mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium"
          style={{
            backgroundColor: 'var(--color-ink)',
            color: 'var(--color-paper)',
          }}
        >
          {de ? 'Erneut' : 'Retry'}
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

  // Step 6: wake → now rows replace the static chip trio for the two metrics
  // that genuinely drift through the day (Battery, Stress). HRV is overnight-
  // only — keep it as a single MetricChip so we don't fake a "now" reading the
  // sensor doesn't actually produce. Sleep stays as a chip too; nothing
  // changes there hour-to-hour. The single wake/now/now_at fallback is `—` per
  // the row component's null handling.
  const battery: WakeNowPair = snapshot?.body_battery ?? {
    wake: latest?.body_battery ?? null,
    now: latest?.body_battery ?? null,
    now_at: null,
  }
  const stress: WakeNowPair = snapshot?.stress ?? {
    wake: null,
    now: null,
    now_at: null,
  }
  const hrvOvernight = snapshot?.hrv_overnight_avg ?? latest?.hrv_status ?? null

  // Phase 7.05: HRV cell confidence gating — need ≥7 days of HRV data.
  // Thin data shows muted skeleton + "Need N more days of HRV." via <UncertainValue>.
  const hrvDays = metrics.filter((m) => m.hrv_status != null).length
  const hrvConfidence = confidence({ n_days: hrvDays, min_days: MIN_DAYS_HRV })
  const hrvDaysNeeded = Math.max(1, MIN_DAYS_HRV - hrvDays)
  const hrvLowCopy = de
    ? `Noch ${hrvDaysNeeded} Tag${hrvDaysNeeded === 1 ? '' : 'e'} HRV nötig.`
    : `Need ${hrvDaysNeeded} more day${hrvDaysNeeded === 1 ? '' : 's'} of HRV.`

  // "as of HH:MM" — tied to body_battery.now_at so the user knows when the
  // hero last reflected reality. Garmin publishes body battery on a ~5–10min
  // lag; an honest stamp beats a confident lie. Berlin user → 24h locale-aware.
  const asOfLabel = battery.now_at
    ? format(new Date(battery.now_at), 'HH:mm')
    : null

  // Sleep chip retained — it's a once-per-day reading, not drifting.
  const sleepChip: { label: string; value: number | null | undefined; suffix?: string } | null = latest
    ? { label: de ? 'Schlaf' : 'Sleep', value: latest.sleep_score }
    : null

  // Wave 3: ContributorsSheet replaces the temporary SideSheet→BiometricsDetail wiring.
  // The data-testid="readiness-hero" on the root section is PERMANENT — IntersectionObserver target.
  // (contributorsOpen / language hooks are declared at the top per Rules of Hooks.)

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
          border: meta ? `1px solid color-mix(in srgb, ${meta.color} 22%, var(--color-rule))` : '1px solid var(--color-rule)',
          backgroundImage: meta
            ? `radial-gradient(140% 100% at 0% 0%, color-mix(in srgb, ${meta.color} 18%, transparent), transparent 55%),
               radial-gradient(60% 40% at 100% 100%, color-mix(in srgb, ${meta.color} 6%, transparent), transparent 70%)`
            : undefined,
        }}
      >
        {/* Top meta row */}
        <div className="flex items-center justify-between px-6 pt-5 sm:px-8 sm:pt-7">
          <div className="flex items-center gap-3">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                backgroundColor: meta?.color ?? 'var(--color-muted)',
                color: meta?.color ?? 'var(--color-muted)',
                animation: 'dot-breathe 3s ease-in-out infinite',
              }}
              aria-hidden
            />
            <span className="eyebrow">
              {format(metricDate, 'EEEE · dd MMM yyyy')}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Percentile pill — "Top X% vs your own 30-day history".
               Why it works: social-proof-against-self, the most motivating
               comparison (you can always beat yesterday-you). */}
            {percentile != null && readiness != null && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold num-mono"
                style={{
                  color: meta?.color ?? 'var(--color-forest-2)',
                  backgroundColor: meta
                    ? `color-mix(in srgb, ${meta.color} 12%, transparent)`
                    : 'rgba(48, 209, 88, 0.10)',
                  border: meta
                    ? `1px solid color-mix(in srgb, ${meta.color} 30%, transparent)`
                    : '1px solid rgba(48, 209, 88, 0.25)',
                }}
                title={de
                  ? `Erholung liegt in den oberen ${100 - Math.round(percentile)}% deiner letzten 30 Tage`
                  : `Recovery is in the top ${100 - Math.round(percentile)}% of your last 30 days`}
              >
                Top {Math.max(1, 100 - Math.round(percentile))}% · 30d
              </span>
            )}
            {lastSync && (
              <span className="eyebrow opacity-70 num-mono hidden sm:inline">
                {de ? 'synchr.' : 'synced'} {lastSync}
              </span>
            )}
            {/* "Why this?" button — opens ContributorsSheet (Wave 3 unified drawer). */}
            {readiness != null && (
              <button
                type="button"
                onClick={() => setContributorsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium min-h-[32px]"
                style={{
                  color: 'var(--color-ink-2)',
                  backgroundColor: 'var(--color-paper)',
                  border: '1px solid var(--color-rule)',
                }}
                title={language === 'simple'
                  ? (de ? 'Warum dieser Wert?' : 'Why this score?')
                  : (de ? 'Warum das?' : 'Why this?')}
              >
                <Info size={11} strokeWidth={1.8} />
                {language === 'simple'
                  ? (de ? 'Warum?' : 'Why?')
                  : (de ? 'Warum das?' : 'Why this?')}
              </button>
            )}
          </div>
        </div>

        {/* Main reading */}
        <div className="px-6 pb-7 pt-4 sm:px-8 sm:pb-9 sm:pt-5 grid gap-6 sm:gap-10 sm:grid-cols-[auto_1fr] items-center">
          {readiness != null && tier && meta ? (
            <>
              <div className="flex flex-col items-center sm:items-start">
                <ActivityRings
                  score={readiness}
                  sleepScore={latest?.sleep_score ?? null}
                  loadPct={loadPct}
                />
              </div>
              <div className="flex flex-col gap-3 min-w-0">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span
                    className="eyebrow"
                    style={{ color: meta.color }}
                  >
                    {meta.label}
                  </span>
                  <span
                    className="num-mono text-[11px]"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    {de ? 'urteil' : 'verdict'}
                  </span>
                </div>
                <h1
                  className="num-display leading-[0.95]"
                  style={{
                    fontSize: 'clamp(36px, 5.5vw, 56px)',
                    color: 'var(--color-ink)',
                  }}
                >
                  {de ? meta.verbDe : meta.verb} {de ? 'heute' : 'today'}.
                </h1>
                <p
                  className="text-[15px] leading-relaxed max-w-lg"
                  style={{ color: 'var(--color-ink-2)' }}
                >
                  {de ? meta.sentimentDe : meta.sentiment}
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

                {/* Step 6 — wake → now rows for the metrics that actually drift
                   through the day. Battery + Stress get paired wake/now with a
                   delta arrow; HRV stays a single overnight number; Sleep stays
                   a static chip. The "as of HH:MM" stamp is wired to
                   body_battery.now_at so freshness is honest. */}
                <EnterGroup
                  delayMs={500}
                  className="flex flex-col gap-1.5 pt-1"
                >
                  <WakeNowRow
                    label={de ? 'Akku' : 'Battery'}
                    pair={battery}
                    sparkline={sixHourSparkline}
                  />
                  <WakeNowRow label="Stress" pair={stress} />
                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    {/* Phase 7.05: HRV gated through UncertainValue — thin data shows muted skeleton. */}
                    <UncertainValue
                      value={
                        <MetricChip
                          label="HRV"
                          value={hrvOvernight}
                          suffix={hrvOvernight != null ? '/100' : undefined}
                        />
                      }
                      confidence={hrvConfidence}
                      lowConfidenceCopy={hrvLowCopy}
                    />
                    {sleepChip && <MetricChip {...sleepChip} />}
                    {asOfLabel && (
                      <span
                        className="eyebrow num-mono"
                        style={{
                          color: 'var(--color-muted)',
                          fontSize: 10,
                          letterSpacing: '0.16em',
                        }}
                        title={de
                          ? 'Garmin liefert die Body Battery mit ~5–10 Minuten Verzögerung'
                          : 'Garmin publishes body battery on a ~5–10 minute lag'}
                      >
                        {de ? 'STAND' : 'AS OF'} {asOfLabel}
                      </span>
                    )}
                  </div>
                </EnterGroup>

                {/* Contributors drawer — "Why this score?" expander.
                   Direct counter to the #1 Whoop complaint: opaque scoring.
                   Show the math, always. */}
                <ReadinessContributors metrics={metrics} latest={latest ?? null} />
              </div>
            </>
          ) : (
            <div className="col-span-full">
              <span className="eyebrow">{de ? 'Warte auf Messwerte' : 'Awaiting metrics'}</span>
              <p
                className="num-display mt-3 leading-[0.95]"
                style={{
                  fontSize: 'clamp(32px, 4.5vw, 48px)',
                  color: 'var(--color-ink)',
                }}
              >
                {de ? 'Dein nächster Sync füllt das hier.' : 'Your next sync will paint this in.'}
              </p>
              <p
                className="mt-3 text-[14px] max-w-md"
                style={{ color: 'var(--color-ink-2)' }}
              >
                {de
                  ? 'Garmin ist verbunden, hat aber noch keine Biometrie geliefert — meist eine Sache über Nacht.'
                  : "Garmin is connected but hasn't delivered biometrics yet — usually an overnight wait."}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Wave 3: ContributorsSheet — unified "Why this?" drawer
         replaces the temporary SideSheet→BiometricsDetail wiring from 06.1-02. */}
      <ContributorsSheet
        open={contributorsOpen}
        onClose={() => setContributorsOpen(false)}
        initialSection="contributors"
      />
    </section>
  )
}

