import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Footprints, Bike, Dumbbell, Trophy, TrendingUp,
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
import {
  linreg, forecast, criticalPower, powerForDuration, climbPowerWatts,
  fmtRaceTime, confidence, granularityForDays, granularityLabel, pctChange,
  bucketByGranularity, wkgPotential,
} from '../utils/progression'

/**
 * Bike Progress — a 1:1 rebuild of the Pencil "Bike Progress" (POWER · PROGRESS)
 * design: a deep progression / projection screen for cycling.
 *
 * Every headline figure is derived from real hooks and the sport-science engine in
 * utils/progression:
 *   • FTP progression + forecast — monthly best-NP proxy series → OLS linreg →
 *     damped forecast toward a physiological ceiling (current + ~20 W).
 *   • Power curve / critical power — Monod–Scherrer CP + W′ from the power-duration
 *     peaks; powerForDuration() projects each duration's ceiling.
 *   • Event prediction (Gran Fondo Dolomites) — climbPowerWatts() inverted for road
 *     speed on the decisive climbs → current vs projected finish time.
 * Where a figure genuinely needs a lab (blood lactate LT1/LT2, VLaMax, gross
 * efficiency, CdA, tHb-mass, DEXA body-fat) we render the full structure with an
 * honest "—" / "needs a lab test" instead of fabricating a number.
 */

const DASH = '—'
const BIKE_KG = 8 // road bike + kit, for climb mass

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
  const currentFtp = athlete?.ftp_watts ?? n0(power?.eftp_watts) ?? n0(power?.cp_watts) ?? null

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

  const trend = useMemo(() => {
    if (monthly.length < 2) return null
    const t0 = new Date(monthly[0].ym + '-01').getTime()
    return linreg(monthly.map((m) => ({ x: (new Date(m.ym + '-01').getTime() - t0) / (7 * 864e5), y: m.ftp })))
  }, [monthly])
  const slopePerWeek = trend?.slope ?? null
  const conf = confidence(trend)

  const ftpSeries = monthly.slice(-8)
  const ftpGain = ftpSeries.length >= 2 ? n0(ftpSeries[ftpSeries.length - 1].ftp - ftpSeries[0].ftp) : null
  const monthsSpan = monthly.length

  // ── Potential vs W/kg standards (real, motivating — not current+20) ───────
  // Map current W/kg onto a men's coaching W/kg ladder → current level + the
  // next milestone band + a strong-amateur long-range target (~4.5 W/kg). The
  // gauge shows genuine headroom, and the same attainable target watts feed the
  // damped forecast as its ceiling.
  const ftpWkgNow = currentFtp != null && hasWeight ? currentFtp / weight : null
  const potential = ftpWkgNow != null ? wkgPotential(ftpWkgNow) : null
  // Long-range attainable target in watts (strong-amateur W/kg × body weight).
  // Falls back to a modest +20 W only when body weight is missing (no W/kg).
  const ceiling = potential != null
    ? Math.round(potential.targetValue * weight)
    : (currentFtp != null ? currentFtp + 20 : null)
  // Next-milestone watts (crossing into the next W/kg band) + Δ to it.
  const nextWatts = potential != null ? Math.round(potential.nextValue * weight) : null
  const nextDelta = nextWatts != null && currentFtp != null ? nextWatts - currentFtp : null
  const fc = useMemo(() => {
    if (currentFtp == null || slopePerWeek == null) return []
    return forecast(currentFtp, slopePerWeek, 13, ceiling ?? undefined)
  }, [currentFtp, slopePerWeek, ceiling])
  const projFtp = fc.length ? n0(fc[fc.length - 1]) : null
  const projDelta = projFtp != null && currentFtp != null ? projFtp - currentFtp : null
  // Honest "how far along toward strong-amateur potential" — lands most rec
  // athletes ~60–75% with real room to grow (NOT the old ~92% current+20 gauge).
  const ceilPct = potential?.pctToTarget ?? null

  // Forecast bars: last-2 actual months + 4 projected (sampled ~monthly = 4.3 wk)
  const forecastBars = useMemo(() => {
    const past = monthly.slice(-2).map((m) => ({ label: m.label, val: m.ftp, projected: false }))
    const proj: { label: string; val: number; projected: boolean }[] = []
    if (fc.length && past.length) {
      const startMonth = new Date(monthly[monthly.length - 1].ym + '-01').getMonth()
      for (let k = 1; k <= 4; k++) {
        const idx = Math.min(fc.length - 1, Math.round(k * 4.33))
        proj.push({ label: MONTHS[(startMonth + k) % 12], val: fc[idx], projected: true })
      }
    }
    return [...past, ...proj]
  }, [monthly, fc])

  // ── Critical Power model (Monod–Scherrer) from peaks ─────────────────────
  const peakAt = (s: string) => n0(power?.peaks?.[s]) // seconds→watts
  const cpModel = useMemo(() => {
    const peaks = power?.peaks
    if (!peaks) return null
    const pts = Object.entries(peaks).map(([t, p]) => ({ t: Number(t), p }))
    return criticalPower(pts)
  }, [power])
  const cpW = n0(power?.cp_watts ?? cpModel?.cp)

  // Power-curve durations (seconds) → now (real) + projected ceiling
  const CURVE: { s: string; label: string }[] = [
    { s: '5', label: '5s' }, { s: '60', label: '1min' }, { s: '300', label: '5min' },
    { s: '1200', label: '20min' }, { s: '3600', label: '60min' },
  ]
  const projPower = (s: number, now: number | null): number | null => {
    if (now == null) return null
    if (cpModel && s >= 120) {
      const projCp = (cpW ?? cpModel.cp) + (projDelta ?? 0)
      return Math.round(powerForDuration(projCp, cpModel.wPrime, s))
    }
    return Math.round(now * 1.05) // short efforts: modest neuromuscular projection
  }

  // ── Event prediction: Gran Fondo Dolomites (climb-power model) ────────────
  const goalName = ((brief?.evidence as Record<string, unknown> | undefined)?.athlete as
    Record<string, unknown> | undefined)?.goal_target as string | undefined
  const daysToGoal = traj?.days_to_goal ?? null
  const EVENT = { dist_m: 142_000, climb_m: 3_800, grad: 0.07 }
  const speedForPower = (p: number, mass: number, grad: number) => {
    let lo = 0.5, hi = 25
    for (let i = 0; i < 44; i++) {
      const mid = (lo + hi) / 2
      if (climbPowerWatts({ totalMassKg: mass, gradient: grad, speedMs: mid }) > p) hi = mid
      else lo = mid
    }
    return (lo + hi) / 2
  }
  const eventTime = (ftp: number): number => {
    const mass = weight + BIKE_KG
    const climbDist = EVENT.climb_m / EVENT.grad // road-m spent climbing
    const flatDist = Math.max(0, EVENT.dist_m - climbDist)
    const vc = speedForPower(ftp * 0.82, mass, EVENT.grad)
    const vf = speedForPower(ftp * 0.68, mass, 0.001)
    return climbDist / vc + flatDist / vf
  }
  const curTime = currentFtp != null ? eventTime(currentFtp) : null
  const projTime = projFtp != null ? eventTime(projFtp) : null
  const timeSavedMin = curTime != null && projTime != null ? Math.round((curTime - projTime) / 60) : null
  // Reason line for the event card — WHY the projected finish is faster/slower,
  // keyed to the real FTP delta + W/kg trend that drives the climb-power model.
  const eventReason: string | null = (() => {
    if (curTime == null || projTime == null || currentFtp == null || projFtp == null || timeSavedMin == null) return null
    const dW = projFtp - currentFtp
    const wkgFrom = currentFtp != null && weight ? n1(currentFtp / weight) : null
    const wkgTo = projFtp != null && weight ? n1(projFtp / weight) : null
    const wkgTxt = wkgFrom != null && wkgTo != null && wkgFrom !== wkgTo ? ` (${wkgFrom}→${wkgTo} W/kg)` : ''
    const mins = Math.abs(timeSavedMin)
    if (timeSavedMin >= 1) {
      return de
        ? `≈${mins} min schneller — deine FTP steigt +${dW} W${wkgTxt} und hebt dein Tempo an den 3.800 Hm.`
        : `≈${mins} min faster — your FTP is trending +${dW} W${wkgTxt}, lifting your speed on the 3,800 m of climbing.`
    }
    if (timeSavedMin <= -1) {
      return de
        ? `≈${mins} min langsamer — die Form trendet abwärts (${dW} W); mehr Umfang, um dein Klettertempo zu halten.`
        : `≈${mins} min slower — fitness is trending down (${dW} W); add volume to hold your climb speed.`
    }
    return de
      ? 'Auf Kurs — du hältst dein aktuelles Klettertempo.'
      : 'On track — holding your current climb speed.'
  })()

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
            {/* Sport toggle — navigates between the three progress pages. */}
            <div className="flex rounded-full" style={{ gap: 3, padding: 3, background: C.surface2 }}>
              {[
                { key: 'run', Icon: Footprints, label: de ? 'Laufen' : 'Run', to: '/progress/run', active: false },
                { key: 'bike', Icon: Bike, label: de ? 'Rad' : 'Bike', to: '/progress/bike', active: true },
                { key: 'lift', Icon: Dumbbell, label: de ? 'Kraft' : 'Lift', to: '/progress/lift', active: false },
              ].map(({ key, Icon, label, to, active }) => (
                <button key={key} type="button" onClick={() => { if (!active) navigate(to) }}
                  className="flex-1 inline-flex items-center justify-center rounded-full"
                  style={{ gap: 7, padding: '9px 12px', border: 0, cursor: active ? 'default' : 'pointer', background: active ? C.accent : 'transparent', color: active ? C.ink : C.ink2 }}>
                  <Icon size={17} /><span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
                </button>
              ))}
            </div>
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

          {/* ── Summary: period-over-period headline ──────────────────── */}
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

          {/* ── Hero: Functional Threshold Power ──────────────────────── */}
          <Card gap={20} pad={22}>
            <div className="flex items-center justify-between">
              <span className="eyebrow" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, color: C.muted }}>
                {de ? 'FUNKTIONELLE SCHWELLENLEISTUNG' : 'FUNCTIONAL THRESHOLD POWER'}
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

          {/* ═══ PROGRESS ═══ */}
          <SectionHeader tick={C.accent} title={de ? 'FORTSCHRITT' : 'PROGRESS'}
            sub={de ? `Was du aufgebaut hast · ${monthsSpan} Monate` : `What you've built · ${monthsSpan} months`} />

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

          {/* ═══ PROJECTION ═══ */}
          <SectionHeader tick={C.strain} title={de ? 'PROJEKTION' : 'PROJECTION'}
            sub={de ? 'Wohin es geht · Modellprognose' : "Where you're headed · model forecast"} />

          {/* FTP Forecast */}
          <Card>
            <CardHead title={de ? 'FTP-Prognose' : 'FTP Forecast'} sub={de ? `Projizierter Trend · aus ${rangeLabel}` : `Projected trend · from ${rangeLabel}`}
              right={
                <div className="flex items-center" style={{ gap: 10 }}>
                  <span className="inline-flex items-center" style={{ gap: 4, fontSize: 11, color: C.muted }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: C.accent }} />{de ? 'Ist' : 'Actual'}
                  </span>
                  <span className="inline-flex items-center" style={{ gap: 4, fontSize: 11, color: C.muted }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: 'transparent', border: `1.5px solid ${C.accent}` }} />{de ? 'Prognose' : 'Projected'}
                  </span>
                </div>
              } />
            {forecastBars.length === 0 && (
              <div style={{ fontSize: 12, color: C.muted, padding: '20px 0' }}>{emptyMsg}</div>
            )}
            <div className="flex items-end" style={{ gap: 10, height: 150 }}>
              {forecastBars.map((b, i) => {
                const mx = Math.max(...forecastBars.map((x) => x.val), 1)
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end" style={{ gap: 6, height: '100%' }}>
                    <span className="num-display" style={{ fontSize: 11, fontWeight: 700, color: b.projected ? C.accent : C.muted }}>{Math.round(b.val)}</span>
                    <span className="w-full" style={{
                      height: `${(b.val / mx) * 100}%`, borderRadius: 6,
                      background: b.projected ? soft(C.accent, 15) : (i === 1 ? C.accent : C.surface3),
                      border: b.projected ? `1.5px solid ${C.accent}` : 'none',
                    }} />
                  </div>
                )
              })}
            </div>
            <div className="flex" style={{ gap: 10 }}>
              {forecastBars.map((b, i) => (
                <span key={i} className="flex-1 text-center" style={{ fontSize: 10, fontWeight: b.projected ? 500 : 700, color: (!b.projected && i === 1) ? C.accent : C.muted }}>
                  {b.label}{!b.projected && i === 1 ? (de ? ' · jetzt' : ' · now') : ''}
                </span>
              ))}
            </div>
            {/* Callout */}
            <div className="flex items-center rounded-[16px]" style={{ gap: 12, padding: 14, background: soft(C.paper, 70), border: `1px solid ${soft(C.strain, 20)}` }}>
              <span className="flex items-center justify-center rounded-full" style={{ width: 38, height: 38, background: C.strain, flex: 'none' }}>
                <LineChart size={22} style={{ color: C.ink }} />
              </span>
              <div className="flex flex-col" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                <span className="num-display" style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{de ? 'Prognose FTP' : 'Projected FTP'} {projFtp ?? DASH} W</span>
                <span style={{ fontSize: 12, color: C.ink2 }}>
                  {conf.pct}% {de ? 'Konfidenz' : 'confidence'} · {de ? conf.label_de : conf.label}{latestCtl != null ? ` · CTL ${latestCtl}` : ''}{daysToGoal != null ? ` · ${daysToGoal}${de ? ' Tage bis Ziel' : ' days to goal'}` : ''}
                </span>
              </div>
              {projDelta != null && (
                <Pill color={C.recovery} bg={soft(C.recovery, 15)}><ArrowUp size={12} />{projDelta >= 0 ? '+' : ''}{projDelta} W</Pill>
              )}
            </div>
          </Card>

          {/* Power Curve */}
          <Card>
            <CardHead title={de ? 'Leistungskurve' : 'Power Curve'} sub={de ? 'Aktuell vs. projizierte Decke' : 'Current vs projected ceiling'}
              right={
                <div className="flex items-center" style={{ gap: 10 }}>
                  <span className="inline-flex items-center" style={{ gap: 4, fontSize: 11, color: C.muted }}><span style={{ width: 9, height: 9, borderRadius: 2, background: C.accent }} />{de ? 'Jetzt' : 'Now'}</span>
                  <span className="inline-flex items-center" style={{ gap: 4, fontSize: 11, color: C.muted }}><span style={{ width: 9, height: 9, borderRadius: 2, background: soft(C.accent, 15), border: `1px solid ${C.accent}` }} />{de ? 'Prog' : 'Proj'}</span>
                </div>
              } />
            {!power?.peaks || Object.keys(power.peaks).length === 0 ? (
              <div style={{ fontSize: 12, color: C.muted, padding: '20px 0' }}>{emptyMsg}</div>
            ) : (
            <>
            <div className="flex items-end" style={{ gap: 12, height: 170 }}>
              {CURVE.map((c) => {
                const now = peakAt(c.s)
                const proj = projPower(Number(c.s), now)
                const gain = proj != null && now != null ? proj - now : null
                const allNow = CURVE.map((x) => peakAt(x.s) ?? 0)
                const mx = Math.max(...allNow, 1)
                const curH = now != null ? (now / mx) * 120 : 0
                const capH = gain != null && gain > 0 ? (gain / mx) * 120 : 0
                return (
                  <div key={c.s} className="flex-1 flex flex-col items-center justify-end" style={{ gap: 5, height: '100%' }}>
                    {gain != null && gain > 0 && <span className="num-display" style={{ fontSize: 10, fontWeight: 700, color: C.accent }}>+{gain}</span>}
                    {capH > 0 && <span className="w-full" style={{ height: capH, background: soft(C.accent, 15), border: `1.5px solid ${C.accent}`, borderRadius: '6px 6px 0 0' }} />}
                    <span className="w-full" style={{ height: curH, background: C.accent, borderRadius: capH > 0 ? '0 0 6px 6px' : 6 }} />
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

          {/* Event Prediction */}
          <Card>
            <div className="flex items-center" style={{ gap: 12 }}>
              <span className="flex items-center justify-center rounded-[12px]" style={{ width: 40, height: 40, background: C.surface2, flex: 'none' }}>
                <Flag size={22} style={{ color: C.amber }} />
              </span>
              <div className="flex flex-col" style={{ gap: 2 }}>
                <span className="num-display" style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{goalName ?? 'Gran Fondo Dolomites'}</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: C.muted }}>
                  {daysToGoal != null ? `${daysToGoal} ${de ? 'Tage' : 'days'} · ` : ''}142 km · 3,800 m
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-[16px]" style={{ padding: 16, background: C.surface2 }}>
              <div className="flex flex-col" style={{ gap: 3 }}>
                <span className="eyebrow" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, color: C.muted }}>{de ? 'AKTUELL' : 'CURRENT'}</span>
                <span className="num-display" style={{ fontSize: 22, fontWeight: 700, color: C.ink2 }}>{curTime != null ? fmtRaceTime(curTime) : DASH}</span>
              </div>
              <ArrowRight size={20} style={{ color: C.muted }} />
              <div className="flex flex-col items-end" style={{ gap: 3 }}>
                <span className="eyebrow" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, color: C.accent }}>{de ? 'PROGNOSE' : 'PROJECTED'}</span>
                <span className="num-display" style={{ fontSize: 22, fontWeight: 700, color: C.ink }}>{projTime != null ? fmtRaceTime(projTime) : DASH}</span>
              </div>
              {timeSavedMin != null && (
                <Pill color={C.recovery} bg={soft(C.recovery, 15)}><TrendingDown size={12} />{Math.abs(timeSavedMin)} min</Pill>
              )}
            </div>
            {eventReason && (
              <span style={{ fontSize: 12, fontWeight: 500, color: C.ink2, lineHeight: 1.4 }}>{eventReason}</span>
            )}
          </Card>

        </div>
      </div>
      <MobileBottomNav />
    </div>
  )
}
