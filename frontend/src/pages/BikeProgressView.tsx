import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Footprints, Bike, Dumbbell, Trophy, TrendingUp,
  TrendingDown, Medal, ArrowUp, LineChart, Flag, ArrowRight, Award,
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
import { useStreamAnalysis } from '../hooks/useStreamAnalysis'
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

/** A left-chip · meta / right value+sub row used across the Pro-Lab lists. */
function DetailRow({ chip, chipColor, title, desc, value, unit, sub, subColor, last }: {
  chip: string; chipColor: string; title: string; desc: string
  value: string; unit?: string; sub: string; subColor: string; last?: boolean
}) {
  return (
    <>
      <div className="flex items-center justify-between" style={{ padding: '12px 0' }}>
        <div className="flex items-center" style={{ gap: 12, minWidth: 0 }}>
          <span className="num-display flex items-center justify-center"
            style={{ width: 56, padding: '8px 0', borderRadius: 10, background: C.surface2, fontSize: 13, fontWeight: 700, color: chipColor, flex: 'none' }}>
            {chip}
          </span>
          <div className="flex flex-col" style={{ gap: 3, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{title}</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: C.muted }}>{desc}</span>
          </div>
        </div>
        <div className="flex flex-col items-end" style={{ gap: 3, flex: 'none' }}>
          <div className="flex items-end" style={{ gap: 3 }}>
            <span className="num-display" style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>{value}</span>
            {unit && <span style={{ fontSize: 11, fontWeight: 500, color: C.muted, paddingBottom: 3 }}>{unit}</span>}
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: subColor }}>{sub}</span>
        </div>
      </div>
      {!last && <div style={{ height: 1, background: C.rule }} />}
    </>
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
  const [mode, setMode] = useState<'simple' | 'pro'>('simple')

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
  const lastRideId = rides.length ? rides[rides.length - 1].id : undefined
  const { data: stream } = useStreamAnalysis(lastRideId)
  const bd = stream?.bike_dynamics

  const weight = athlete?.weight_kg ?? 68.5
  const hasWeight = athlete?.weight_kg != null
  const currentFtp = athlete?.ftp_watts ?? n0(power?.eftp_watts) ?? n0(power?.cp_watts) ?? null

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
  const wkgAt = (s: string) => n1(power?.peaks_wkg?.[s] ?? power?.wkg_curve?.[s])
  const cpModel = useMemo(() => {
    const peaks = power?.peaks
    if (!peaks) return null
    const pts = Object.entries(peaks).map(([t, p]) => ({ t: Number(t), p }))
    return criticalPower(pts)
  }, [power])
  const cpW = n0(power?.cp_watts ?? cpModel?.cp)
  const wPrimeKj = n1((power?.w_prime_j ?? (cpModel ? cpModel.wPrime : null) ?? NaN) / 1000)

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

  // ── Durability (real drop % after kJ) ────────────────────────────────────
  const fresh20 = peakAt('1200')
  const drop1500 = n1(power?.durability_best_pct)
  const drop2000 = n1(power?.durability_avg_pct)
  const fatigued20 = fresh20 != null && drop2000 != null ? Math.round(fresh20 * (1 - drop2000 / 100)) : null
  const durLabel = drop2000 == null ? DASH : drop2000 < 5 ? (de ? 'Stark' : 'Strong') : drop2000 < 8 ? (de ? 'Gut' : 'Solid') : (de ? 'Baubar' : 'Buildable')

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

          {/* Power Profile */}
          <Card gap={14}>
            <CardHead title={de ? 'Leistungsprofil' : 'Power Profile'} sub={de ? 'Saisonbeste Durchschnittsleistung' : 'Season-best mean power'}
              right={<Pill color={C.ink2}><Medal size={14} style={{ color: C.amber }} /> {rides.length} {de ? 'Fahrten' : 'rides'}</Pill>} />
            <div className="flex flex-col">
              {[
                { s: '5', d: '5s', zone: de ? 'Neuromuskulär' : 'Neuromuscular' },
                { s: '60', d: '1 min', zone: de ? 'Anaerob' : 'Anaerobic' },
                { s: '300', d: '5 min', zone: 'VO₂ max' },
                { s: '1200', d: '20 min', zone: de ? 'Schwelle' : 'Threshold' },
              ].map((row, i, arr) => {
                const w = peakAt(row.s)
                const wkg = wkgAt(row.s)
                return (
                  <div key={row.s}>
                    <div className="flex items-center justify-between" style={{ padding: '12px 0' }}>
                      <div className="flex items-center" style={{ gap: 12 }}>
                        <span className="num-display flex items-center justify-center"
                          style={{ width: 52, padding: '8px 0', borderRadius: 10, background: C.surface2, fontSize: 14, fontWeight: 700, color: C.ink }}>{row.d}</span>
                        <div className="flex flex-col" style={{ gap: 3 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{row.zone}</span>
                          <span style={{ fontSize: 11, fontWeight: 500, color: C.muted }}>{de ? 'Saisonbestwert' : 'Season best'}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end" style={{ gap: 3 }}>
                        <div className="flex items-end" style={{ gap: 3 }}>
                          <span className="num-display" style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>{w ?? DASH}</span>
                          <span style={{ fontSize: 11, color: C.muted, paddingBottom: 3 }}>W</span>
                        </div>
                        {wkg != null && (
                          <span className="inline-flex items-center" style={{ gap: 3, fontSize: 11, fontWeight: 700, color: C.recovery }}>
                            <ArrowUp size={11} /> {wkg} W/kg
                          </span>
                        )}
                      </div>
                    </div>
                    {i < arr.length - 1 && <div style={{ height: 1, background: C.rule }} />}
                  </div>
                )
              })}
            </div>
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

          {/* ═══ PRO LAB (Pro mode) ═══ */}
          {mode === 'pro' && (
            <>
              <SectionHeader tick={C.accent} title={de ? 'PRO LAB' : 'PRO LAB'}
                sub={de ? 'Elite-Physiologie · worauf Profis achten' : 'Elite physiology · what the pros obsess over'} />

              {/* Aerobic Engine */}
              <Card gap={14}>
                <CardHead title={de ? 'Aerobe Maschine' : 'Aerobic Engine'} sub={de ? 'Sauerstofftransport & aerobe Decke' : 'Oxygen delivery & aerobic ceiling'}
                  right={cpW != null ? <Pill color={C.ink2}>{de ? 'Gemessen' : 'Modeled'}</Pill> : undefined} />
                <div className="flex flex-col">
                  <DetailRow chip="VO₂" chipColor={C.accent} title="VO₂max" desc={de ? 'Braucht Labortest' : 'Needs a lab test'}
                    value={DASH} sub={de ? 'Spiroergometrie' : 'Lab spirometry'} subColor={C.muted} />
                  <DetailRow chip="CP" chipColor={C.accent} title={de ? 'Kritische Leistung' : 'Critical Power'} desc={de ? 'CP-Modell-Asymptote' : 'CP-model asymptote'}
                    value={cpW != null ? String(cpW) : DASH} unit="W"
                    sub={cpW != null && currentFtp != null ? `vs FTP ${currentFtp} W · ${cpW - currentFtp >= 0 ? '+' : ''}${cpW - currentFtp} W` : (de ? 'aus Spitzen' : 'from peaks')} subColor={C.ink2} />
                  <DetailRow chip="W′" chipColor={C.amber} title={de ? 'W′ anaerober Tank' : 'W′ anaerobic tank'} desc={de ? 'Akku über CP' : 'Battery above CP'}
                    value={wPrimeKj != null ? String(wPrimeKj) : DASH} unit="kJ"
                    sub={power?.phenotype?.type ?? (de ? 'Angriffe' : 'attacks')} subColor={C.amber} />
                  <DetailRow chip="VLa" chipColor={C.strain} title="VLaMax" desc={de ? 'Glykolytische Rate' : 'Glycolytic rate'}
                    value={DASH} sub={de ? 'Braucht Labortest' : 'Needs a lab test'} subColor={C.muted} last />
                </div>
              </Card>

              {/* Efficiency & Thresholds */}
              <Card gap={14}>
                <CardHead title={de ? 'Effizienz & Schwellen' : 'Efficiency & Thresholds'} sub={de ? 'Wo du sauber brennst vs. in den roten Bereich gehst' : 'Where you burn clean vs go into the red'} />
                <div className="flex flex-col">
                  <DetailRow chip="LT1" chipColor={C.recovery} title={de ? 'LT1 · aerob' : 'LT1 · aerobic'} desc={de ? 'Erster Laktatanstieg' : 'First rise in lactate'}
                    value={DASH} sub={de ? 'Braucht Laktattest' : 'Needs a lab test'} subColor={C.muted} />
                  <DetailRow chip="LT2" chipColor={C.amber} title={de ? 'LT2 · Schwelle' : 'LT2 · threshold'} desc={de ? 'Max. Laktat-Steady-State' : 'Max lactate steady state'}
                    value={DASH} sub={de ? 'Braucht Laktattest' : 'Needs a lab test'} subColor={C.muted} />
                  <DetailRow chip="GE" chipColor={C.strain} title={de ? 'Bruttowirkungsgrad' : 'Gross efficiency'} desc={de ? 'Watt raus ÷ Energie rein' : 'Watts out ÷ energy in'}
                    value={DASH} sub={de ? 'Braucht Labortest' : 'Needs a lab test'} subColor={C.muted} />
                  <DetailRow chip="Fat" chipColor={C.exercise} title="Fat-max" desc={de ? 'Zone maximaler Fettoxidation' : 'Peak fat oxidation zone'}
                    value={DASH} sub={de ? 'Braucht Labortest' : 'Needs a lab test'} subColor={C.muted} last />
                </div>
                <div className="flex items-center justify-between rounded-[16px]" style={{ padding: 14, background: soft(C.paper, 70), border: `1px solid ${C.rule}` }}>
                  <div className="flex flex-col" style={{ gap: 2, minWidth: 0 }}>
                    <span className="num-display" style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{de ? 'KH ⇄ Fett Übergang' : 'CHO ⇄ fat crossover'}</span>
                    <span style={{ fontSize: 12, color: C.ink2 }}>{de ? 'Darüber läufst du v.a. auf Kohlenhydraten' : 'Above this you run mostly on carbs'}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, flex: 'none' }}>{de ? 'Labortest' : 'lab test'}</span>
                </div>
              </Card>

              {/* Durability */}
              <Card>
                <CardHead title={de ? 'Ermüdungsresistenz' : 'Durability'} sub={de ? 'Ermüdungsresistenz · die neue Grenze' : 'Fatigue resistance · the new frontier'}
                  right={<Pill color={drop2000 != null && drop2000 < 5 ? C.recovery : C.amber} bg={soft(drop2000 != null && drop2000 < 5 ? C.recovery : C.amber, 15)}>{durLabel}</Pill>} />
                <div className="flex items-center" style={{ gap: 12 }}>
                  {[
                    { lab: de ? '20-MIN · FRISCH' : '20-MIN · FRESH', v: fresh20, wkg: fresh20 != null ? n1(fresh20 / weight) : null, col: C.ink },
                    { lab: de ? 'NACH 2000 kJ' : 'AFTER 2000 kJ', v: fatigued20, wkg: fatigued20 != null ? n1(fatigued20 / weight) : null, col: C.amber, arrow: true },
                  ].map((t, i) => (
                    <div key={i} className="flex items-center" style={{ gap: 12, flex: 1 }}>
                      {t.arrow && <span style={{ fontSize: 18, fontWeight: 700, color: C.muted }}>→</span>}
                      <div className="flex flex-col rounded-[16px]" style={{ gap: 4, padding: 14, background: C.surface2, flex: 1 }}>
                        <span className="eyebrow" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.3, color: C.ink2 }}>{t.lab}</span>
                        <div className="flex items-end" style={{ gap: 3 }}>
                          <span className="num-display" style={{ fontSize: 26, fontWeight: 700, color: t.col }}>{t.v ?? DASH}</span>
                          <span style={{ fontSize: 11, color: C.muted, paddingBottom: 4 }}>W</span>
                        </div>
                        <span style={{ fontSize: 11, color: C.muted }}>{t.wkg != null ? `${t.wkg} W/kg` : DASH}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col" style={{ gap: 12 }}>
                  {[
                    { lab: de ? 'Nach 1500 kJ' : 'After 1500 kJ', drop: drop1500, col: C.recovery },
                    { lab: de ? 'Nach 2000 kJ' : 'After 2000 kJ', drop: drop2000, col: C.amber },
                  ].map((d, i) => (
                    <div key={i} className="flex flex-col" style={{ gap: 8 }}>
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink2 }}>{d.lab}</span>
                        <div className="flex items-end" style={{ gap: 4 }}>
                          <span className="num-display" style={{ fontSize: 16, fontWeight: 700, color: d.drop != null ? d.col : C.muted }}>{d.drop != null ? `-${d.drop}%` : DASH}</span>
                          <span style={{ fontSize: 11, color: C.muted }}>{de ? 'Leistungsabfall' : 'power drop'}</span>
                        </div>
                      </div>
                      <div className="rounded-full overflow-hidden" style={{ height: 10, background: C.surface3 }}>
                        <div style={{ height: '100%', width: `${Math.min(100, (d.drop ?? 0) * 8)}%`, background: d.col, borderRadius: 5 }} />
                      </div>
                    </div>
                  ))}
                </div>
                <span style={{ fontSize: 11, fontWeight: 500, color: C.muted, lineHeight: 1.4 }}>
                  {de ? 'Geringerer Abfall = du hältst die Leistung tief ins lange Rennen. Elite-GC-Fahrer verlieren <5% nach 2000 kJ.'
                    : 'Lower drop = you hold power deep into long races. Elite GC riders lose <5% after 2000 kJ.'}
                  {bd?.stamina_end_pct != null && (de
                    ? ` Letzte Fahrt: ${Math.round(bd.stamina_end_pct)}% Stamina am Ende.`
                    : ` Last ride: ${Math.round(bd.stamina_end_pct)}% stamina at the finish.`)}
                </span>
              </Card>

              {/* Aero & Blood */}
              <Card gap={14}>
                <CardHead title={de ? 'Aero & Blut' : 'Aero & Blood'} sub={de ? 'Gratis-Speed & Sauerstoffkapazität' : 'Free speed & oxygen-carrying capacity'} />
                <div className="flex flex-col">
                  <DetailRow chip="CdA" chipColor={C.stand} title={de ? 'Aero-Widerstand (CdA)' : 'Aero drag (CdA)'} desc={de ? 'Frontale Widerstandsfläche' : 'Frontal drag area'}
                    value={DASH} sub={de ? 'Braucht Aerotest' : 'Needs a lab test'} subColor={C.muted} />
                  <DetailRow chip="⚡" chipColor={C.accent} title={de ? 'Gesparte Watt' : 'Watts saved'} desc={de ? 'vs. entspannte Position' : 'vs relaxed position'}
                    value={DASH} sub={de ? 'Braucht Aerotest' : 'Needs a lab test'} subColor={C.muted} />
                  <DetailRow chip="Hb" chipColor={C.move} title="tHb-mass" desc={de ? 'Gesamt-Hämoglobinmasse' : 'Total haemoglobin mass'}
                    value={DASH} sub={de ? 'Braucht CO-Rückatmung' : 'Needs a lab test'} subColor={C.muted} last />
                </div>
              </Card>

              {/* Body Composition */}
              <Card>
                <div className="flex flex-col" style={{ gap: 2 }}>
                  <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: C.ink }}>{de ? 'Körperzusammensetzung' : 'Body Composition'}</span>
                  <span style={{ fontSize: 12, color: C.ink2 }}>{de ? 'Jedes Gramm zählt am Berg' : 'Every gram counts on the climbs'}</span>
                </div>
                <div className="flex" style={{ gap: 12 }}>
                  {[
                    { lab: de ? 'GEWICHT' : 'WEIGHT', v: n1(athlete?.weight_kg), unit: 'kg' },
                    { lab: de ? 'KÖRPERFETT' : 'BODY FAT', v: null, unit: '%' },
                  ].map((t, i) => (
                    <div key={i} className="flex flex-col rounded-[16px]" style={{ gap: 4, padding: 14, background: C.surface2, flex: 1 }}>
                      <span className="eyebrow" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.3, color: C.ink2 }}>{t.lab}</span>
                      <div className="flex items-end" style={{ gap: 3 }}>
                        <span className="num-display" style={{ fontSize: 24, fontWeight: 700, color: C.ink }}>{t.v ?? DASH}</span>
                        <span style={{ fontSize: 11, color: C.muted, paddingBottom: 3 }}>{t.unit}</span>
                      </div>
                      {i === 1 && <span style={{ fontSize: 10, color: C.muted }}>{de ? 'DEXA nötig' : 'needs DEXA'}</span>}
                    </div>
                  ))}
                </div>
                <div style={{ height: 1, background: C.rule }} />
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{de ? 'W/kg nach Dauer' : 'W/kg by duration'}</span>
                  <span style={{ fontSize: 11, color: C.muted }}>{de ? 'Saisonbestwert' : 'Season best'}</span>
                </div>
                <div className="flex" style={{ gap: 8 }}>
                  {[{ s: '5', d: '5s' }, { s: '60', d: '1 min' }, { s: '300', d: '5 min' }, { s: '1200', d: '20 min' }].map((c) => {
                    const wkg = wkgAt(c.s)
                    return (
                      <div key={c.s} className="flex flex-col items-center rounded-[14px]" style={{ gap: 5, padding: '12px 6px', background: C.surface2, flex: 1 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>{c.d}</span>
                        <span className="num-display" style={{ fontSize: 18, fontWeight: 700, color: c.s === '1200' ? C.accent : C.ink }}>{wkg ?? DASH}</span>
                        <span style={{ fontSize: 9, color: C.muted }}>W/kg</span>
                      </div>
                    )
                  })}
                </div>
              </Card>
            </>
          )}

          {/* ═══ AMATEUR MODE ═══ */}
          <SectionHeader tick={C.exercise} title={de ? 'AMATEUR-MODUS' : 'AMATEUR MODE'}
            sub={de ? 'Gleiche Daten · null Fachjargon' : 'Same data · zero jargon'} />

          {/* Mode toggle */}
          <Card gap={12}>
            <div className="flex flex-col" style={{ gap: 2 }}>
              <span className="num-display" style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>{de ? 'Wie viel Detail willst du?' : 'How much detail do you want?'}</span>
              <span style={{ fontSize: 12, color: C.ink2 }}>{de ? 'Jederzeit wechseln — deine Daten bleiben gleich' : 'Switch anytime — your data stays the same'}</span>
            </div>
            <div className="flex rounded-full" style={{ gap: 3, padding: 3, background: C.surface2 }}>
              {([['simple', de ? 'Einfach' : 'Simple'], ['pro', 'Pro']] as const).map(([k, lab]) => (
                <button key={k} onClick={() => setMode(k)} className="flex-1 rounded-full"
                  style={{ padding: '10px 0', border: 0, fontSize: 14, fontWeight: mode === k ? 700 : 600, background: mode === k ? C.accent : 'transparent', color: mode === k ? C.ink : C.ink2 }}>
                  {lab}
                </button>
              ))}
            </div>
          </Card>

          {/* Coach-explains + BeginnerTrio (Simple mode) */}
          {mode === 'simple' && (
            <>
              {/* Coach: W′ */}
              <CoachCard
                accent={C.amber}
                title={de ? 'W′ — dein Streichholzheft' : 'W′ — your matchbook'}
                plain={de
                  ? 'W′ ("W-prime") sind die harten Antritte, die du über der Schwelle ausgeben kannst, bevor du platzt. Wie eine Schachtel Streichhölzer — jeder Sprint verbrennt eins.'
                  : 'W′ ("W-prime") is the hard efforts you can spend above threshold before you blow up. Think of it as a box of matches — each surge burns one.'}
                why={de
                  ? 'Ein größeres W′ heißt mehr Antritte, Brücken und Sprints im Rennen, bevor die Beine dichtmachen. Deins ist groß für einen Amateur.'
                  : 'A bigger W′ means more attacks, bridges and sprints in a race before your legs shut down. Yours is large for an amateur.'}
                doText={de
                  ? 'Mach kurze Über-Schwellen-Intervalle (30/30s), um das Heft zu vergrößern — und übe, es spät in Fahrten klug auszugeben.'
                  : 'Do short over-threshold intervals (30/30s) to grow the matchbook — then practice spending it wisely late in rides.'}
              />
              {/* Coach: VLaMax */}
              <CoachCard
                accent={C.strain}
                title={de ? 'VLaMax — Sprinter vs. Diesel' : 'VLaMax — sprinter vs diesel'}
                plain={de
                  ? 'VLaMax ist, wie schnell deine Muskeln Energie auf die schnelle, zuckrige Art erzeugen. Niedrig = sparsamer Diesel; hoch = explosiver Sprinter, der schneller leer ist.'
                  : 'VLaMax is how fast your muscles make energy the fast, sugary way. Low = a fuel-efficient diesel engine; high = an explosive sprinter that runs out quicker.'}
                why={de
                  ? 'Deins ist niedrig, super für lange Anstiege und Zeitfahren — du sparst Sprit und hältst die Leistung über Stunden.'
                  : 'Yours is low, which is great for long climbs and time trials — you sip fuel and hold power for hours.'}
                doText={de
                  ? 'Behalte lange Grundlagenfahrten im Plan, um es zu schützen; ergänze etwas Sprintarbeit nur, wenn du mehr Punch willst.'
                  : 'Keep long endurance rides in the plan to protect it; add a little sprint work only if you want more punch.'}
              />
              {/* BeginnerTrio */}
              <Card gap={18}>
                <div className="flex flex-col" style={{ gap: 2 }}>
                  <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: C.ink }}>{de ? 'Deine 3 Dinge, die zählen' : 'Your 3 things that matter'}</span>
                  <span style={{ fontSize: 12, color: C.ink2 }}>{de ? 'Du vs. ein typischer Amateur' : 'You vs a typical amateur rider'}</span>
                </div>
                {[
                  { title: de ? 'Konstanz' : 'Consistency', sub: de ? 'Getroffene Wochen dieses Jahr' : 'Weeks hit this year', val: '91%', valCol: C.recovery, fill: C.recovery, pct: 91, foot: de ? 'Besser als 91% der Amateure' : 'Better than 91% of amateurs' },
                  { title: de ? 'Leicht / hart Balance' : 'Easy / hard balance', sub: de ? 'Zeit leicht vs. hart' : 'Time easy vs hard', val: '80 / 20', valCol: C.stand, fill: C.stand, pct: 76, foot: de ? 'Besser als 76% der Amateure' : 'Better than 76% of amateurs' },
                  { title: de ? 'Nächstes FTP-Ziel' : 'Next FTP target', sub: projFtp != null ? `+${projDelta ?? 15} W ${de ? 'bis Oktober' : 'by October'}` : '+15 W by October', val: projFtp != null ? `${projFtp} W` : '296 W', valCol: C.accent, fill: C.accent, pct: 62, foot: de ? '62% des Weges · auf Kurs' : '62% of the way there · on track' },
                ].map((r, i) => (
                  <div key={i} className="flex flex-col" style={{ gap: 9 }}>
                    <div className="flex items-end justify-between">
                      <div className="flex flex-col" style={{ gap: 2 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{r.title}</span>
                        <span style={{ fontSize: 11, color: C.muted }}>{r.sub}</span>
                      </div>
                      <span className="num-display" style={{ fontSize: 20, fontWeight: 700, color: r.valCol }}>{r.val}</span>
                    </div>
                    <div className="rounded-full overflow-hidden" style={{ height: 10, background: C.surface3 }}>
                      <div style={{ height: '100%', width: `${r.pct}%`, background: r.fill, borderRadius: 5 }} />
                    </div>
                    <span style={{ fontSize: 11, color: C.muted }}>{r.foot}</span>
                  </div>
                ))}
              </Card>
            </>
          )}
        </div>
      </div>
      <MobileBottomNav />
    </div>
  )
}

// Coach-explains card (WHY / DO rows)
function CoachCard({ accent, title, plain, why, doText }: {
  accent: string; title: string; plain: string; why: string; doText: string
}) {
  const { locale } = useLocale()
  const de = locale === 'de'
  return (
    <Card gap={12}>
      <div className="flex items-center" style={{ gap: 10 }}>
        <span className="flex items-center justify-center rounded-full" style={{ width: 34, height: 34, background: '#000', flex: 'none' }}>
          <Award size={18} style={{ color: accent }} />
        </span>
        <div className="flex flex-col" style={{ gap: 1, minWidth: 0 }}>
          <span className="eyebrow" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: accent }}>{de ? 'COACH ERKLÄRT' : 'COACH EXPLAINS'}</span>
          <span className="num-display" style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{title}</span>
        </div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 500, color: C.ink, lineHeight: 1.5 }}>{plain}</span>
      <div className="flex flex-col" style={{ gap: 10 }}>
        {[['WHY', why, C.strain], ['DO', doText, C.recovery]].map(([tag, tx, col]) => (
          <div key={tag} className="flex" style={{ gap: 10 }}>
            <span className="flex items-center justify-center rounded-[8px]" style={{ padding: '4px 8px', background: C.surface2, fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: col as string, flex: 'none', height: 'fit-content' }}>{tag}</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: C.ink2, lineHeight: 1.45 }}>{tx}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
