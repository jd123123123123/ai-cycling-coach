import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Bike, Trophy, TrendingUp,
  TrendingDown, Medal, ArrowUp, LineChart, Flag, ArrowRight,
} from 'lucide-react'
import { subDays } from 'date-fns'
import { useLocale } from '../contexts/LocaleContext'
import HoverBars from '../components/ui/HoverBars'
import MobileBottomNav from '../components/dashboard/MobileBottomNav'
import { usePowerProfile } from '../hooks/usePowerProfile'
import { usePMC } from '../hooks/usePMC'
import { useAthleteProfile } from '../hooks/useAthleteProfile'
import { useActivitiesRange } from '../hooks/useActivitiesRange'
import { useCoachBrief } from '../hooks/useCoachBrief'
import { useGoalTrajectory } from '../hooks/useGoalTrajectory'
import { useCurrentWeek } from '../hooks/useCurrentWeek'
import type { ProjectionContext } from '../api/weeks'
import {
  granularityForDays, granularityLabel, pctChange,
  bucketByGranularity, wkgPotential,
} from '../utils/progression'

/**
 * Bike Progress — a 1:1 rebuild of the Pencil "Bike Progress" (POWER · PROGRESS)
 * design: a deep progression / projection screen for cycling.
 *
 * Every headline figure comes from real hooks:
 *   • "Where you stand" — the canonical threshold_watts from
 *     /analytics/power-profile (audit P0-1: one FTP everywhere).
 *   • THE PROJECTION — the ONE forward forecast, the Bayesian /weeks/current
 *     projection with its p10–p90 band; below 30 % confidence it shows a range,
 *     never a point promise (audit P0-4: no 13-minute miracles).
 *   • Power curve / peaks — sanitized server-side; rendered as-is.
 * Where a figure genuinely needs a lab we render an honest "—" instead of
 * fabricating a number.
 */

const DASH = '—'

// hex→CSS-var token map from the .pen
const C = {
  paper: 'var(--color-paper)',
  paper2: 'var(--color-paper-2)',
  surface2: 'var(--color-surface-2)',
  surface3: 'var(--color-surface-3)',
  rule: 'var(--color-rule)',
  ink: 'var(--color-ink)',
  ink2: 'var(--color-ink-2)',
  muted: 'var(--color-muted)',
  accent: 'var(--color-accent)',
  recovery: 'var(--color-recovery)',
  strain: 'var(--color-strain)',
  stand: 'var(--color-stand)',
  amber: 'var(--color-amber)',
  move: 'var(--color-move)',
  exercise: 'var(--color-exercise)',
}
const soft = (v: string, pct = 15) => `color-mix(in srgb, ${v} ${pct}%, transparent)`

const n0 = (x: number | null | undefined) => (x == null || !isFinite(x) ? null : Math.round(x))
const n1 = (x: number | null | undefined) => (x == null || !isFinite(x) ? null : Math.round(x * 10) / 10)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ── shared shells ──────────────────────────────────────────────────────────
function Card({ children, gap = 16, pad = 20, accent = false }: {
  children: React.ReactNode; gap?: number; pad?: number; accent?: boolean
}) {
  return (
    <div
      className="rounded-[24px]"
      style={{
        display: 'flex', flexDirection: 'column', gap, padding: pad,
        background: accent ? soft(C.accent, 15) : C.paper2,
        border: `1px solid ${accent ? C.accent : C.rule}`,
      }}
    >
      {children}
    </div>
  )
}

function CardHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: C.ink }}>{title}</span>
        {sub && <span style={{ fontSize: 12, color: C.ink2 }}>{sub}</span>}
      </div>
      {right}
    </div>
  )
}

function SectionHeader({ tick, title, sub }: { tick: string; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3">
      <span style={{ width: 3, height: 26, borderRadius: 2, background: tick, flex: 'none' }} />
      <div className="flex flex-col" style={{ gap: 1 }}>
        <span className="num-display" style={{ fontSize: 17, fontWeight: 700, letterSpacing: 0.5, color: C.ink }}>{title}</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: C.muted }}>{sub}</span>
      </div>
    </div>
  )
}

function Pill({ children, color, bg }: { children: React.ReactNode; color: string; bg?: string }) {
  return (
    <span className="inline-flex items-center rounded-full"
      style={{ gap: 5, padding: '5px 10px', fontSize: 12, fontWeight: 700, color, background: bg ?? C.surface2 }}>
      {children}
    </span>
  )
}

/** Summary-card metric tile: big value + a period-over-period delta chip whose
 *  colour honours the metric's polarity (higherBetter=false → higher is worse,
 *  e.g. resting HR). Shows an honest "—" when the prior window has no data. */
function MetricTile({ label, value, unit, cur, prev, higherBetter = true, digits = 0 }: {
  label: string; value: string; unit?: string
  cur: number | null; prev: number | null; higherBetter?: boolean; digits?: number
}) {
  const abs = cur != null && prev != null ? cur - prev : null
  const pct = pctChange(cur, prev)
  const good = abs == null ? null : higherBetter ? abs >= 0 : abs <= 0
  const col = good == null ? C.muted : good ? C.recovery : C.move
  return (
    <div className="flex flex-col rounded-[16px]" style={{ gap: 6, padding: 14, background: C.surface2, minWidth: 0 }}>
      <span className="eyebrow" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, color: C.ink2 }}>{label}</span>
      <div className="flex items-end" style={{ gap: 3, minWidth: 0 }}>
        <span className="num-display" style={{ fontSize: 22, fontWeight: 700, color: C.ink, lineHeight: 1, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
        {unit && <span style={{ fontSize: 11, color: C.muted, paddingBottom: 2, flex: 'none' }}>{unit}</span>}
      </div>
      {abs == null ? (
        <span style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>{DASH}</span>
      ) : (
        <span className="inline-flex items-center" style={{ gap: 3, fontSize: 11, fontWeight: 700, color: col, flexWrap: 'wrap', fontVariantNumeric: 'tabular-nums' }}>
          {abs >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {abs >= 0 ? '+' : ''}{abs.toFixed(digits)}{pct != null ? ` · ${pct >= 0 ? '+' : ''}${Math.round(pct)}%` : ''}
        </span>
      )}
    </div>
  )
}


// ── page ───────────────────────────────────────────────────────────────────
const RANGES = ['7D', '14D', '31D', '90D', '1Y', 'All'] as const
type Range = typeof RANGES[number]
const RANGE_DAYS: Record<Range, number> = { '7D': 7, '14D': 14, '31D': 31, '90D': 90, '1Y': 365, 'All': 760 }

export default function BikeProgressView() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const navigate = useNavigate()
  const today = useMemo(() => new Date(), [])

  const [range, setRange] = useState<Range>('90D')

  // Active range → days → cutoff timestamp. Everything derived from `rides` honors this.
  const rangeDays = RANGE_DAYS[range]
  const cutoff = useMemo(() => +subDays(today, rangeDays), [today, rangeDays])
  // Previous window [today - 2*rangeDays, today - rangeDays) for period-over-period deltas.
  const prevCutoff = useMemo(() => +subDays(today, 2 * rangeDays), [today, rangeDays])
  // API rejects windows > 366 days. Fetch enough to also cover the prior window, clamped to 365.
  const fetchFrom = useMemo(() => subDays(today, Math.min(2 * rangeDays, 365)), [today, rangeDays])
  const rangeLabel = de ? `letzte ${rangeDays} Tage` : `last ${rangeDays} days`

  const { data: power } = usePowerProfile()
  const { data: pmc } = usePMC(90)
  const { data: athlete } = useAthleteProfile()
  const { data: actData } = useActivitiesRange(fetchFrom, today)
  const { data: brief } = useCoachBrief()
  const { data: traj } = useGoalTrajectory()
  const { data: week } = useCurrentWeek()

  const pmcSeries = pmc?.entries ?? []
  const latestCtl = pmcSeries.length ? Math.round(pmcSeries[pmcSeries.length - 1].ctl) : null
  const activities = useMemo(() => actData?.activities ?? [], [actData])
  const rideStart = (a: { started_at?: string | null; date?: string | null }) =>
    +new Date(a.started_at ?? a.date ?? 0)
  // All cycling rides with power in the FETCHED window (covers current + prior periods).
  const ridesAll = useMemo(
    () => activities.filter((a) => a.sport === 'cycling' && (a.normalized_power ?? 0) > 0),
    [activities],
  )
  // Current-range rides: everything the range-scoped cards derive from.
  const rides = useMemo(
    () => ridesAll.filter((a) => rideStart(a) >= cutoff),
    [ridesAll, cutoff],
  )
  // Prior-window rides for period-over-period comparison.
  const ridesPrev = useMemo(
    () => ridesAll.filter((a) => rideStart(a) >= prevCutoff && rideStart(a) < cutoff),
    [ridesAll, prevCutoff, cutoff],
  )
  // Best-NP FTP proxy per window (max normalized power). Real data only → null when empty.
  const bestNp = (rs: typeof ridesAll) =>
    rs.length ? Math.round(Math.max(...rs.map((a) => a.normalized_power ?? 0))) : null
  const ftpProxyNow = useMemo(() => bestNp(rides), [rides])
  const ftpProxyPrev = useMemo(() => bestNp(ridesPrev), [ridesPrev])
  // Δ vs prior period — only when prior window has rides. Never fabricated.
  const ftpPeriodDelta = ftpProxyNow != null && ftpProxyPrev != null ? ftpProxyNow - ftpProxyPrev : null

  // ── Period-over-period SUMMARY: current window vs prior equivalent window ──
  // Every headline metric is the same span before/after `cutoff`; deltas are
  // honest (null when the prior window is empty → "no prior data to compare").
  const gran = granularityForDays(rangeDays)
  const granTxt = granularityLabel(gran, de)
  const sumRides = (rs: typeof ridesAll, pick: (a: (typeof ridesAll)[number]) => number) =>
    rs.reduce((s, a) => s + (pick(a) || 0), 0)
  const tssNow = sumRides(rides, (a) => a.tss ?? 0)
  const tssPrev = sumRides(ridesPrev, (a) => a.tss ?? 0)
  const hoursNow = sumRides(rides, (a) => (a.duration_seconds ?? 0) / 3600)
  const hoursPrev = sumRides(ridesPrev, (a) => (a.duration_seconds ?? 0) / 3600)
  const distNow = sumRides(rides, (a) => (a.distance_meters ?? 0) / 1000)
  const distPrev = sumRides(ridesPrev, (a) => (a.distance_meters ?? 0) / 1000)
  // Avg CTL (fitness) over each window, drawn from the PMC series' dated entries.
  const ctlAvg = (from: number, to: number) => {
    const xs = pmcSeries.filter((e) => { const t = +new Date(e.date); return t >= from && t < to }).map((e) => e.ctl)
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
  }
  const ctlNow = ctlAvg(cutoff, +today + 864e5)
  const ctlPrev = ctlAvg(prevCutoff, cutoff)
  const hasPrior = ridesPrev.length > 0
  // Range-adaptive TSS trend: re-buckets daily / weekly / monthly by range.
  const chartStart = useMemo(() => new Date(Math.max(cutoff, +fetchFrom)), [cutoff, fetchFrom])
  const tssBuckets = useMemo(
    () => bucketByGranularity(rides.map((a) => ({ t: rideStart(a), v: a.tss ?? 0 })), chartStart, today, gran, 'sum'),
    [rides, chartStart, today, gran],
  )
  // Verdict from the real deltas (fitness = CTL, volume = TSS).
  const fitPct = pctChange(ctlNow, ctlPrev)
  const volPct = pctChange(tssNow, tssPrev)
  const trendWord = (p: number | null, de_: boolean) =>
    p == null ? (de_ ? 'stabil' : 'steady')
      : p >= 4 ? (de_ ? `+${Math.round(p)} %` : `up ${Math.round(p)}%`)
      : p <= -4 ? (de_ ? `−${Math.abs(Math.round(p))} %` : `down ${Math.abs(Math.round(p))}%`)
      : (de_ ? 'stabil' : 'steady')
  const verdict = !hasPrior
    ? (de ? 'Keine Vorperiode zum Vergleichen — Basislinie im Aufbau' : 'No prior period to compare — building your baseline')
    : de
      ? `Fitness ${trendWord(fitPct, true)} vs. die letzten ${rangeDays} Tage · Volumen ${trendWord(volPct, true)}`
      : `Fitness ${trendWord(fitPct, false)} vs the previous ${rangeDays} days · volume ${trendWord(volPct, false)}`
  const weight = athlete?.weight_kg ?? 68.5
  const hasWeight = athlete?.weight_kg != null
  // THE canonical threshold (audit P0-1): manual FTP when set, else the
  // sanitized model eFTP — served by /analytics/power-profile.
  const currentFtp = n0(power?.threshold_watts) ?? athlete?.ftp_watts ?? null
  const ftpIsManual = power?.threshold_source === 'manual'

  // ── Range-scoped Power Profile: best NP per granularity bucket across the
  // window's rides (per-ride normalized power is the only power figure the
  // activity feed exposes, so it stands in as the range's mean-max signal). ──
  const mmpBuckets = useMemo(
    () => bucketByGranularity(rides.map((a) => ({ t: rideStart(a), v: a.normalized_power ?? 0 })), chartStart, today, gran, 'max'),
    [rides, chartStart, today, gran],
  )
  const peakNp = ftpProxyNow // best NP in the selected window
  const peakNpWkg = peakNp != null && hasWeight ? n1(peakNp / weight) : null

  // ── FTP-over-time proxy: best NP per calendar month (real rides) ──────────
  const monthly = useMemo(() => {
    const buckets = new Map<string, { ym: string; label: string; ftp: number }>()
    for (const a of rides) {
      const iso = (a.started_at ?? a.date ?? '').slice(0, 10)
      if (!iso) continue
      const ym = iso.slice(0, 7)
      const np = a.normalized_power ?? 0
      const prev = buckets.get(ym)
      if (!prev || np > prev.ftp) {
        buckets.set(ym, { ym, label: MONTHS[Number(iso.slice(5, 7)) - 1] ?? ym, ftp: np })
      }
    }
    return Array.from(buckets.values()).sort((a, b) => a.ym.localeCompare(b.ym))
  }, [rides])

  const ftpSeries = monthly.slice(-8)
  const ftpGain = ftpSeries.length >= 2 ? n0(ftpSeries[ftpSeries.length - 1].ftp - ftpSeries[0].ftp) : null
  const monthsSpan = monthly.length

  // ── Potential vs W/kg standards (real, motivating — not current+20) ───────
  // Map current W/kg onto a men's coaching W/kg ladder → current level + the
  // next milestone band + a strong-amateur long-range target (~4.5 W/kg). The
  // gauge shows genuine headroom.
  const ftpWkgNow = currentFtp != null && hasWeight ? currentFtp / weight : null
  const potential = ftpWkgNow != null ? wkgPotential(ftpWkgNow) : null
  // Next-milestone watts (crossing into the next W/kg band) + Δ to it.
  const nextWatts = potential != null ? Math.round(potential.nextValue * weight) : null
  const nextDelta = nextWatts != null && currentFtp != null ? nextWatts - currentFtp : null
  // Honest "how far along toward strong-amateur potential" — lands most rec
  // athletes ~60–75% with real room to grow (NOT the old ~92% current+20 gauge).
  const ceilPct = potential?.pctToTarget ?? null

  // ── Power-curve peaks (sanitized server-side) ─────────────────────────────
  const peakAt = (s: string) => n0(power?.peaks?.[s]) // seconds→watts
  const CURVE: { s: string; label: string }[] = [
    { s: '5', label: '5s' }, { s: '60', label: '1min' }, { s: '300', label: '5min' },
    { s: '1200', label: '20min' }, { s: '3600', label: '60min' },
  ]

  // ── THE PROJECTION — the one forward forecast (audit P0-4) ───────────────
  // The Bayesian /weeks/current projection with p10–p90 band. No client-side
  // OLS forecast, no event-time claims: below 30 % confidence we show the
  // range, never a point promise.
  const goalName = ((brief?.evidence as Record<string, unknown> | undefined)?.athlete as
    Record<string, unknown> | undefined)?.goal_target as string | undefined
  const daysToGoal = traj?.days_to_goal ?? null
  const proj: ProjectionContext | null = week?.projection ?? null
  // Mirror the backend's confidence formula (band tightness × sample richness)
  // when confidence_pct isn't in the payload; never invent a higher number.
  const projConfPct = useMemo(() => {
    if (!proj) return null
    if (proj.confidence_pct != null) return proj.confidence_pct
    if (proj.projected_central == null || !proj.band_80) return null
    const bandW = proj.band_80[1] - proj.band_80[0]
    const ratio = proj.projected_central > 0 ? bandW / proj.projected_central : 1
    const sampleFactor = proj.samples_used != null ? Math.min(1, proj.samples_used / 10) : 1
    return Math.round(100 * Math.max(0, Math.min(1, (1 - ratio) * sampleFactor)))
  }, [proj])
  const projTier = projConfPct == null
    ? null
    : projConfPct >= 70
      ? { label: de ? 'hoch' : 'high', color: C.recovery }
      : projConfPct >= 40
        ? { label: de ? 'moderat' : 'moderate', color: C.ink2 }
        : { label: de ? 'niedrig' : 'low', color: C.muted }
  // Below 30 % (or unknown) confidence: range-only, no central point promise.
  const projRangeOnly = projConfPct == null || projConfPct < 30
  const projP10 = proj?.band_80 ? Math.round(proj.band_80[0]) : null
  const projP90 = proj?.band_80 ? Math.round(proj.band_80[1]) : null
  const projCentral = proj?.projected_central != null ? Math.round(proj.projected_central) : null
  const projCurrent = proj?.current_estimate != null ? Math.round(proj.current_estimate) : null
  const projHorizonIso = proj?.path.length ? proj.path[proj.path.length - 1].date : null
  const projHorizonLabel = projHorizonIso
    ? new Date(`${projHorizonIso}T12:00:00`).toLocaleDateString(de ? 'de-DE' : 'en-US', { day: 'numeric', month: 'short' })
    : null

  // ── Hero W/kg + percentile bucket ────────────────────────────────────────
  const ftpWkg = currentFtp != null && weight ? n1(currentFtp / weight) : null
  const pctTop = ftpWkg == null ? null : ftpWkg >= 4.5 ? 3 : ftpWkg >= 4.0 ? 8 : ftpWkg >= 3.5 ? 18 : ftpWkg >= 3.0 ? 35 : 55
  const firstWkg = ftpSeries.length >= 2 && weight ? n1(ftpSeries[0].ftp / weight) : null

  // Period-over-period chip (green up / red down). Renders "—" when prior window is empty.
  const vsPeriodLabel = de ? 'vs. Vorperiode' : `vs. prior ${range}`
  const PeriodDelta = () => (
    <Pill
      color={ftpPeriodDelta == null ? C.muted : ftpPeriodDelta >= 0 ? C.recovery : C.move}
      bg={ftpPeriodDelta == null ? C.surface2 : soft(ftpPeriodDelta >= 0 ? C.recovery : C.move, 15)}
    >
      {ftpPeriodDelta != null && (ftpPeriodDelta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />)}
      {ftpPeriodDelta == null ? DASH : `${ftpPeriodDelta >= 0 ? '+' : ''}${ftpPeriodDelta} W`}
      <span style={{ fontWeight: 500, opacity: 0.75 }}>{vsPeriodLabel}</span>
    </Pill>
  )

  const noRides = rides.length === 0
  const emptyMsg = de ? 'Keine Daten im Zeitraum' : 'No data in range'

  // strings
  const T = {
    overline: 'POWER · PROGRESS',
    title: de ? 'Radfahren' : 'Cycling',
    synced: de ? 'Synchron' : 'Synced',
  }

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: C.paper, color: C.ink }}>
      <div className="max-w-md mx-auto px-4 pb-28" style={{ paddingTop: 8 }}>
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 mb-3"
          style={{ color: C.ink2, fontSize: 13, fontWeight: 600, background: 'none', border: 0, padding: '6px 0' }}>
          <ArrowLeft size={18} /> {de ? 'Zurück' : 'Back'}
        </button>

        <div className="flex flex-col" style={{ gap: 20 }}>
          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="flex flex-col" style={{ gap: 14 }}>
            <div className="flex items-center justify-between">
              <div className="flex flex-col" style={{ gap: 2 }}>
                <span className="eyebrow" style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1, color: C.muted }}>{T.overline}</span>
                <span className="num-display" style={{ fontSize: 28, fontWeight: 700, color: C.ink }}>{T.title}</span>
              </div>
            </div>
            {/* Bike-only: run/lift progress pages archived — sport toggle removed. */}
          </div>

          {/* ── Range filter ──────────────────────────────────────────── */}
          <div className="flex rounded-full" style={{ gap: 3, padding: 4, background: C.surface2 }}>
            {RANGES.map((r) => (
              <button key={r} onClick={() => setRange(r)}
                className="flex-1 rounded-full" style={{
                  minHeight: 40, padding: '8px 4px', fontSize: 12, fontWeight: 600, border: 0,
                  background: range === r ? C.accent : 'transparent',
                  color: range === r ? C.ink : C.ink2,
                }}>
                {r}
              </button>
            ))}
          </div>

          {/* ═══ 1 · WHERE YOU STAND ═══ */}
          <SectionHeader tick={C.accent} title={de ? 'WO DU STEHST' : 'WHERE YOU STAND'}
            sub={de ? 'Deine Radform genau jetzt' : 'Your cycling fitness right now'} />

          {/* ── Hero: Functional Threshold Power (the headline number) ── */}
          <Card gap={20} pad={22}>
            <div className="flex items-center justify-between">
              <span className="eyebrow" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, color: C.muted }}>
                {ftpIsManual
                  ? (de ? 'FTP · AUS DEINEM PROFIL' : 'FTP · FROM YOUR PROFILE')
                  : (de ? 'FTP (GESCHÄTZT)' : 'FTP (ESTIMATED)')}
              </span>
              {pctTop != null && (
                <Pill color={C.accent} bg={soft(C.accent, 15)}>
                  <Trophy size={14} /> {de ? `Top ${pctTop}%` : `Top ${pctTop}%`}
                </Pill>
              )}
            </div>
            <div className="flex items-center" style={{ gap: 18, flexWrap: 'wrap', rowGap: 12 }}>
              <div className="flex items-end" style={{ gap: 5 }}>
                <span className="num-display" style={{ fontSize: 54, fontWeight: 700, color: C.ink, lineHeight: 1 }}>{currentFtp ?? DASH}</span>
                <span style={{ fontSize: 16, fontWeight: 500, color: C.muted, paddingBottom: 10 }}>W</span>
              </div>
              <span style={{ width: 1, height: 44, background: C.rule }} />
              <div className="flex flex-col" style={{ gap: 2 }}>
                <div className="flex items-end" style={{ gap: 4 }}>
                  <span className="num-display" style={{ fontSize: 32, fontWeight: 700, color: C.accent, lineHeight: 1 }}>{ftpWkg ?? DASH}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: C.muted, paddingBottom: 5 }}>W/kg</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 500, color: C.muted }}>{n1(weight)} kg</span>
              </div>
              <div style={{ flex: 1 }} />
              <PeriodDelta />
            </div>
            <div style={{ height: 1, background: C.rule }} />
            {/* Potential vs W/kg standards — motivating, honest headroom (not a fake ~92% cap). */}
            <div className="flex flex-col" style={{ gap: 10 }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col" style={{ gap: 2, minWidth: 0 }}>
                  <span className="num-display" style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>
                    {potential ? `${de ? potential.level_de : potential.level} · ${n1(ftpWkgNow)} W/kg` : (de ? 'Leistungspotenzial' : 'Power potential')}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: C.muted }}>
                    {!potential
                      ? (de ? 'Körpergewicht ergänzen, um dein W/kg-Potenzial zu sehen' : 'Add body weight to see your W/kg potential')
                      : nextDelta != null && nextDelta > 0
                        ? (de
                            ? `Nächstes Ziel → ${n1(potential.nextValue)} W/kg · +${nextDelta} W`
                            : `Next milestone → ${n1(potential.nextValue)} W/kg · +${nextDelta} W`)
                        : (de ? 'Spitzenband erreicht — weiter halten' : 'Top band reached — hold it')}
                  </span>
                </div>
                {ceilPct != null && (
                  <div className="flex flex-col items-end" style={{ gap: 1, flex: 'none' }}>
                    <span className="num-display" style={{ fontSize: 20, fontWeight: 700, color: C.accent, lineHeight: 1 }}>{ceilPct}%</span>
                    <span style={{ fontSize: 10, fontWeight: 500, color: C.muted }}>{de ? 'zum Ziel' : 'to target'}</span>
                  </div>
                )}
              </div>
              <div className="rounded-full overflow-hidden" style={{ height: 10, background: C.surface3 }}>
                <div style={{ height: '100%', width: `${ceilPct ?? 0}%`, background: C.accent, borderRadius: 5 }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 500, color: C.muted }}>
                {potential
                  ? (de
                      ? `Fortschritt zur Amateur-Spitze (~${n1(potential.targetValue)} W/kg) · echter Spielraum zum Wachsen`
                      : `Progress toward strong-amateur W/kg (~${n1(potential.targetValue)} W/kg) · real room to grow`)
                  : (de ? `Jetzt · ${currentFtp ?? DASH} W` : `Now · ${currentFtp ?? DASH} W`)}
              </span>
            </div>
          </Card>

          {/* ── Summary: period-over-period verdict + training load ───── */}
          <Card accent gap={16} pad={20}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col" style={{ gap: 2, minWidth: 0 }}>
                <span className="eyebrow" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: C.accent }}>
                  {de ? `ZUSAMMENFASSUNG · ${rangeLabel.toUpperCase()}` : `SUMMARY · ${rangeLabel.toUpperCase()}`}
                </span>
                <span className="num-display" style={{ fontSize: 15, fontWeight: 700, color: C.ink, lineHeight: 1.35 }}>{verdict}</span>
              </div>
              <Pill color={C.accent} bg={soft(C.accent, 15)}>{de ? `${granTxt}` : `${granTxt} view`}</Pill>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <MetricTile label="TSS" value={noRides ? DASH : String(Math.round(tssNow))} cur={hasPrior ? tssNow : null} prev={hasPrior ? tssPrev : null} />
              <MetricTile label={de ? 'STUNDEN' : 'HOURS'} value={noRides ? DASH : n1(hoursNow)?.toString() ?? DASH} unit="h" cur={hasPrior ? hoursNow : null} prev={hasPrior ? hoursPrev : null} digits={1} />
              <MetricTile label={de ? 'DISTANZ' : 'DISTANCE'} value={noRides ? DASH : String(Math.round(distNow))} unit="km" cur={hasPrior ? distNow : null} prev={hasPrior ? distPrev : null} />
              <MetricTile label={de ? 'Ø CTL' : 'AVG CTL'} value={ctlNow != null ? String(Math.round(ctlNow)) : DASH} cur={ctlNow} prev={ctlPrev} />
            </div>
            {/* Range-adaptive TSS trend — daily / weekly / monthly buckets */}
            {tssBuckets.some((b) => b.value > 0) ? (
              <>
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.ink2 }}>{de ? 'Belastung (TSS)' : 'Training load (TSS)'}</span>
                  <span style={{ fontSize: 11, color: C.muted }}>{de ? `${granTxt} Buckets` : `${granTxt} buckets`}</span>
                </div>
                <HoverBars
                  height={96}
                  radius={5}
                  defaultColor={C.accent}
                  bars={tssBuckets.map((b, i) => ({
                    value: b.value,
                    valueLabel: `${Math.round(b.value)} TSS`,
                    label: b.label,
                    highlight: i === tssBuckets.length - 1,
                  }))}
                />
              </>
            ) : (
              <span style={{ fontSize: 12, color: C.muted }}>{emptyMsg}</span>
            )}
          </Card>

          {/* ═══ 2 · THE TREND ═══ */}
          <SectionHeader tick={C.recovery} title={de ? 'DER TREND' : 'THE TREND'}
            sub={de ? `Wie du hierher kamst · ${monthsSpan} Monate` : `How you got here · ${monthsSpan} months`} />

          {/* FTP Progression */}
          <Card>
            <CardHead title={de ? 'FTP-Verlauf' : 'FTP Progression'}
              sub={de ? `Schwellenleistung · Watt · ${rangeLabel}` : `Threshold power · watts · ${rangeLabel}`}
              right={
                <div className="flex flex-col items-end" style={{ gap: 6 }}>
                  {ftpGain != null && (
                    <Pill color={ftpGain >= 0 ? C.recovery : C.move} bg={soft(ftpGain >= 0 ? C.recovery : C.move, 15)}>
                      {ftpGain >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{ftpGain >= 0 ? '+' : ''}{ftpGain} W
                    </Pill>
                  )}
                  <PeriodDelta />
                </div>
              } />
            {ftpSeries.length >= 2 ? (
              <HoverBars
                height={150}
                defaultColor={C.surface3}
                radius={6}
                bars={ftpSeries.map((m, i) => ({
                  value: m.ftp,
                  valueLabel: `${Math.round(m.ftp)} W`,
                  label: m.label,
                  highlight: i === ftpSeries.length - 1,
                }))}
              />
            ) : (
              <div style={{ fontSize: 12, color: C.muted, padding: '20px 0' }}>{noRides ? emptyMsg : (de ? 'Mehr Fahrten nötig für den Verlauf' : 'Needs more rides to chart a trend')}</div>
            )}
            <div className="flex" style={{ gap: 8 }}>
              {ftpSeries.map((m, i) => (
                <span key={i} className="flex-1 text-center" style={{ fontSize: 11, fontWeight: i === ftpSeries.length - 1 ? 700 : 500, color: i === ftpSeries.length - 1 ? C.accent : C.muted }}>{m.label}</span>
              ))}
            </div>
            <div style={{ height: 1, background: C.rule }} />
            <div className="flex items-center justify-between">
              <div className="flex flex-col" style={{ gap: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.ink2 }}>{de ? 'Leistungsgewicht' : 'Power-to-weight'}</span>
                <div className="flex items-end" style={{ gap: 6 }}>
                  <span className="num-display" style={{ fontSize: 15, fontWeight: 600, color: C.muted }}>{firstWkg ?? DASH}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>→</span>
                  <span className="num-display" style={{ fontSize: 15, fontWeight: 700, color: C.accent }}>{ftpWkg ?? DASH} W/kg</span>
                </div>
              </div>
              <div className="flex items-end" style={{ gap: 4, height: 40 }}>
                {ftpSeries.slice(-6).map((m, i, a) => {
                  const vals = a.map((x) => x.ftp / weight)
                  const mx = Math.max(...vals, 1)
                  return <span key={i} style={{ width: 7, height: Math.max(8, (m.ftp / weight / mx) * 40), borderRadius: 3, background: i === a.length - 1 ? C.accent : C.surface3 }} />
                })}
              </div>
            </div>
          </Card>

          {/* ═══ 3 · THE PROJECTION ═══ */}
          <SectionHeader tick={C.strain} title={de ? 'DIE PROGNOSE' : 'THE PROJECTION'}
            sub={de ? 'Richtung Renntag · mit Unsicherheitsband' : 'Toward race day · with uncertainty band'} />

          {/* THE one projection: /weeks/current Bayesian forecast, p10–p90 band */}
          <Card>
            <CardHead
              title={de ? 'Renntag-Prognose' : 'Race-day projection'}
              sub={proj
                ? `${proj.metric_label}${projHorizonLabel ? ` · ${de ? 'bis' : 'to'} ${projHorizonLabel}` : ''}`
                : (de ? 'Modellprognose' : 'Model forecast')}
              right={projTier && projConfPct != null ? (
                <Pill color={projTier.color} bg={soft(projTier.color, 15)}>
                  {projConfPct}% · {projTier.label}
                </Pill>
              ) : undefined}
            />
            {!proj ? (
              <div style={{ fontSize: 12, color: C.muted, padding: '12px 0' }}>
                {de
                  ? 'Noch keine belastbare Prognose — braucht mehr Trainingshistorie.'
                  : 'No reliable projection yet — needs more training history.'}
              </div>
            ) : (
              <>
                {/* Goal context */}
                {(goalName != null || daysToGoal != null) && (
                  <div className="flex items-center" style={{ gap: 10 }}>
                    <span className="flex items-center justify-center rounded-[12px]" style={{ width: 34, height: 34, background: C.surface2, flex: 'none' }}>
                      <Flag size={18} style={{ color: C.amber }} />
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink2 }}>
                      {goalName ?? (de ? 'Zielevent' : 'Goal event')}
                      {daysToGoal != null ? ` · ${daysToGoal} ${de ? 'Tage' : 'days'}` : ''}
                    </span>
                  </div>
                )}
                {projRangeOnly ? (
                  /* Low/unknown confidence → range only, no point promise */
                  <div className="flex flex-col" style={{ gap: 4 }}>
                    <span className="num-display" style={{ fontSize: 22, fontWeight: 700, color: C.ink, lineHeight: 1.25 }}>
                      {projP10 != null && projP90 != null
                        ? (de
                            ? `Richtung Renntag: ${projP10}–${projP90} W möglich`
                            : `Trending toward ${projP10}–${projP90} W by race day`)
                        : DASH}
                    </span>
                    <span style={{ fontSize: 12, color: C.muted }}>
                      {de
                        ? 'Das Band ist noch breit — je mehr Fahrten, desto enger wird es.'
                        : 'The band is still wide — it tightens with every ride.'}
                    </span>
                  </div>
                ) : (
                  /* Central point + band */
                  <div className="flex items-center justify-between rounded-[16px]" style={{ padding: 16, background: C.surface2 }}>
                    <div className="flex flex-col" style={{ gap: 3 }}>
                      <span className="eyebrow" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, color: C.muted }}>{de ? 'AKTUELL' : 'CURRENT'}</span>
                      <span className="num-display" style={{ fontSize: 22, fontWeight: 700, color: C.ink2 }}>{projCurrent != null ? `${projCurrent} W` : DASH}</span>
                    </div>
                    <ArrowRight size={20} style={{ color: C.muted }} />
                    <div className="flex flex-col items-end" style={{ gap: 3 }}>
                      <span className="eyebrow" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, color: C.accent }}>{de ? 'RENNTAG' : 'RACE DAY'}</span>
                      <span className="num-display" style={{ fontSize: 22, fontWeight: 700, color: C.ink }}>{projCentral != null ? `${projCentral} W` : DASH}</span>
                      {projP10 != null && projP90 != null && (
                        <span className="num-display" style={{ fontSize: 11, fontWeight: 600, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
                          {projP10}–{projP90} W (80 %)
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {/* Band chart from the projection path */}
                {proj.path.length >= 2 && (() => {
                  const pts = proj.path
                  const lo = Math.min(...pts.map((p) => p.p10))
                  const hi = Math.max(...pts.map((p) => p.p90))
                  const span = Math.max(1, hi - lo)
                  const W = 300, H = 96
                  const x = (i: number) => (i / (pts.length - 1)) * W
                  const y = (v: number) => H - ((v - lo) / span) * (H - 10) - 5
                  const band = [
                    ...pts.map((p, i) => `${x(i).toFixed(1)},${y(p.p90).toFixed(1)}`),
                    ...[...pts].reverse().map((p, i) => `${x(pts.length - 1 - i).toFixed(1)},${y(p.p10).toFixed(1)}`),
                  ].join(' ')
                  const central = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.central).toFixed(1)}`).join(' ')
                  return (
                    <div className="flex flex-col" style={{ gap: 6 }}>
                      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 96, display: 'block' }} aria-hidden>
                        <polygon points={band} fill={soft(C.accent, 14)} />
                        <polyline points={central} fill="none" stroke={C.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: 10.5, color: C.muted }}>{de ? 'Jetzt' : 'Now'}</span>
                        <span style={{ fontSize: 10.5, color: C.muted }}>
                          {de ? 'Band: p10–p90 (80 %)' : 'Band: p10–p90 (80%)'}
                        </span>
                        <span style={{ fontSize: 10.5, color: C.muted }}>{projHorizonLabel ?? ''}</span>
                      </div>
                    </div>
                  )
                })()}
                {/* Honest narration straight from the model — no client re-spin */}
                <div className="flex items-start rounded-[16px]" style={{ gap: 12, padding: 14, background: soft(C.paper, 70), border: `1px solid ${soft(C.strain, 20)}` }}>
                  <span className="flex items-center justify-center rounded-full" style={{ width: 34, height: 34, background: C.strain, flex: 'none' }}>
                    <LineChart size={19} style={{ color: C.ink }} />
                  </span>
                  <div className="flex flex-col" style={{ gap: 3, minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, lineHeight: 1.4 }}>{proj.projected_outcome}</span>
                    <span style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.4 }}>
                      {proj.caveat}{latestCtl != null ? ` · CTL ${latestCtl}` : ''}
                    </span>
                  </div>
                </div>
              </>
            )}
          </Card>

          {/* ═══ 4 · THE DETAIL ═══ */}
          <SectionHeader tick={C.muted} title={de ? 'DIE DETAILS' : 'THE DETAIL'}
            sub={de ? 'Belege im Detail · Bestleistungen & Kurve' : 'The supporting reference · efforts & curve'} />

          {/* Power Profile — range-scoped best-effort power (best NP per bucket) */}
          <Card gap={14}>
            <CardHead title={de ? 'Leistungsprofil' : 'Power Profile'}
              sub={de ? `Bestleistungen · ${rangeLabel}` : `Best efforts · ${rangeLabel}`}
              right={<Pill color={C.ink2}><Medal size={14} style={{ color: C.amber }} /> {rides.length} {de ? 'Fahrten' : 'rides'}</Pill>} />
            {noRides || !mmpBuckets.some((b) => b.value > 0) ? (
              <div style={{ fontSize: 12, color: C.muted, padding: '20px 0' }}>
                {de ? 'Keine Bestleistungen im Zeitraum' : 'No efforts in range'}
              </div>
            ) : (
              <>
                <div className="flex items-end justify-between">
                  <div className="flex flex-col" style={{ gap: 2 }}>
                    <span className="eyebrow" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, color: C.ink2 }}>
                      {de ? 'SPITZEN-NP · ZEITRAUM' : 'PEAK NP · RANGE'}
                    </span>
                    <div className="flex items-end" style={{ gap: 4 }}>
                      <span className="num-display" style={{ fontSize: 28, fontWeight: 700, color: C.ink, lineHeight: 1 }}>{peakNp ?? DASH}</span>
                      <span style={{ fontSize: 12, color: C.muted, paddingBottom: 3 }}>W</span>
                    </div>
                  </div>
                  {peakNpWkg != null && (
                    <Pill color={C.recovery} bg={soft(C.recovery, 15)}><ArrowUp size={12} /> {peakNpWkg} W/kg</Pill>
                  )}
                </div>
                <HoverBars
                  height={120}
                  radius={5}
                  defaultColor={C.surface3}
                  bars={mmpBuckets.map((b) => ({
                    value: b.value,
                    valueLabel: `${Math.round(b.value)} W`,
                    label: b.label,
                    highlight: peakNp != null && Math.round(b.value) === Math.round(peakNp),
                  }))}
                />
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: 11, color: C.muted }}>{de ? `Beste NP je ${granTxt}-Bucket` : `Best NP per ${granTxt} bucket`}</span>
                  <span style={{ fontSize: 11, color: C.muted }}>{rangeLabel}</span>
                </div>
              </>
            )}
          </Card>

          {/* Power Curve — sanitized server-side bests, no projected ceiling */}
          <Card>
            <CardHead title={de ? 'Leistungskurve' : 'Power Curve'}
              sub={de ? 'Deine besten Efforts je Dauer' : 'Your best efforts per duration'} />
            {!power?.peaks || Object.keys(power.peaks).length === 0 ? (
              <div style={{ fontSize: 12, color: C.muted, padding: '20px 0' }}>{emptyMsg}</div>
            ) : (
            <>
            <div className="flex items-end" style={{ gap: 12, height: 150 }}>
              {CURVE.map((c) => {
                const now = peakAt(c.s)
                const allNow = CURVE.map((x) => peakAt(x.s) ?? 0)
                const mx = Math.max(...allNow, 1)
                const curH = now != null ? (now / mx) * 120 : 0
                return (
                  <div key={c.s} className="flex-1 flex flex-col items-center justify-end" style={{ gap: 5, height: '100%' }}>
                    <span className="w-full" style={{ height: curH, background: C.accent, borderRadius: 6 }} />
                    <span className="num-display" style={{ fontSize: 11, fontWeight: 700, color: C.ink2 }}>{now ?? DASH}</span>
                  </div>
                )
              })}
            </div>
            <div className="flex" style={{ gap: 12 }}>
              {CURVE.map((c) => <span key={c.s} className="flex-1 text-center" style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>{c.label}</span>)}
            </div>
            </>
            )}
          </Card>

        </div>
      </div>
      <MobileBottomNav />
    </div>
  )
}
