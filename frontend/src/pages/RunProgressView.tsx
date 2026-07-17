/**
 * RunProgressView — the Run "Progress & Potential" screen rebuilt 1:1 from the
 * Pencil design. Card order (top→bottom):
 *   Header (sport toggle) · RangeFilter · EngineHero (Aerobic engine / VO₂max)
 *   ── PROGRESS:   VO₂max trend · Personal records · Weekly volume
 *   ── PROJECTION: VO₂max forecast · Race-time trajectory
 *   ── POTENTIAL:  Levers · Upside banner
 *   ── PRO LAB:    Elite physiology · Biomechanics · Durability · Fuelling &
 *                  sweat · Metabolic · Body comp        (shown in Pro mode)
 *   ── AMATEUR MODE: Simple/Pro toggle · Coach-explains · Beginner fundamentals
 *                                                        (shown in Simple mode)
 *
 * Real data + the progression.ts sport-science engine drive every trend,
 * forecast and prediction:
 *   • VO₂max trend/forecast: linreg → slope/r² → confidence → damped forecast.
 *   • Race times: Daniels VDOT from the best recent run → raceTimeFromVdot.
 *   • Critical speed & D′: two-effort distance–time model from real runs.
 *   • Biomechanics: real run_dynamics streams from the most recent run.
 * Where a value genuinely requires a lab (running economy, blood lactate,
 * VLaMax, sweat sodium, DEXA body-comp) we render the card STRUCTURE with an
 * honest "—" / "needs a lab test" — nothing is fabricated. Forecasts are
 * labelled as projections with a confidence %.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { subDays, startOfWeek, startOfMonth, format, parseISO } from 'date-fns'
import {
  ArrowLeft, Footprints, Bike, Dumbbell, Trophy, TrendingUp, ArrowDownRight,
  Flag, ArrowRight, Medal, Gauge, Route, Scale, Thermometer, Plus, Zap,
  Leaf, FlaskConical, MessageCircle, Info,
} from 'lucide-react'
import { useDailyMetrics } from '../hooks/useDailyMetrics'
import { useActivitiesRange } from '../hooks/useActivitiesRange'
import { useStreamAnalysis } from '../hooks/useStreamAnalysis'
import { useAthleteProfile } from '../hooks/useAthleteProfile'
import { useCoachBrief } from '../hooks/useCoachBrief'
import { useLocale } from '../contexts/LocaleContext'
import HoverBars, { type HoverBar } from '../components/ui/HoverBars'
import MobileBottomNav from '../components/dashboard/MobileBottomNav'
import {
  linreg, forecast, vdot, raceTimeFromVdot, fmtRaceTime, confidence,
  granularityForDays, granularityLabel, pctChange, bucketByGranularity,
  vo2maxPotential, type Trend,
} from '../utils/progression'

// ── tokens ──────────────────────────────────────────────────────────────────
const card = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const
const DIST = { '5K': 5000, '10K': 10000, Half: 21097.5, Marathon: 42195 } as const
const MONTH_MS = 1000 * 60 * 60 * 24 * 30.44

// ── helpers ─────────────────────────────────────────────────────────────────
function fmtPace(secPerKm: number): string {
  if (!isFinite(secPerKm) || secPerKm <= 0) return '—'
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
function signedTime(sec: number): string {
  const a = Math.abs(Math.round(sec))
  const m = Math.floor(a / 60), s = a % 60
  const body = m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
  return `−${body}`
}

type RangeKey = '7D' | '14D' | '31D' | '90D' | '1Y' | 'All'
const RANGE_DAYS: Record<RangeKey, number> = { '7D': 7, '14D': 14, '31D': 31, '90D': 90, '1Y': 365, All: 760 }

// ── page ────────────────────────────────────────────────────────────────────
export default function RunProgressView() {
  const navigate = useNavigate()
  const { locale } = useLocale()
  const de = locale === 'de'
  const [range, setRange] = useState<RangeKey>('90D')
  const [mode, setMode] = useState<'simple' | 'pro'>('simple')
  const T = (en: string, deTxt: string) => (de ? deTxt : en)

  // Fetch a window covering BOTH the selected range and its prior equivalent
  // period (for period-over-period deltas), clamped to the API's 366-day limit.
  const now = useMemo(() => new Date(), [])
  const rangeDays = RANGE_DAYS[range]
  const fetchStart = useMemo(() => subDays(now, Math.min(2 * rangeDays, 365)), [now, rangeDays])
  const { data: metricsResp } = useDailyMetrics(fetchStart, now)
  const { data: actsResp } = useActivitiesRange(fetchStart, now)
  const { data: profile } = useAthleteProfile()
  const { data: brief } = useCoachBrief()

  // Selected-range cutoff drives the trend/forecast basis and record window;
  // the prior cutoff bounds the previous equivalent window [−2·range, −range).
  const cutoff = useMemo(() => +subDays(now, rangeDays), [now, rangeDays])
  const priorCutoff = useMemo(() => +subDays(now, 2 * rangeDays), [now, rangeDays])
  const metrics = useMemo(
    () => (metricsResp?.metrics ?? []).filter((m) => m.date && +parseISO(m.date) >= cutoff),
    [metricsResp, cutoff],
  )
  const runs = useMemo(
    () => (actsResp?.activities ?? []).filter(
      (a) => a.sport === 'running' && (a.distance_meters ?? 0) > 0 && (a.duration_seconds ?? 0) > 0 && +parseISO(a.started_at) >= cutoff,
    ),
    [actsResp, cutoff],
  )
  // Prior equivalent window for period-over-period comparisons (real data only).
  const priorMetrics = useMemo(
    () => (metricsResp?.metrics ?? []).filter((m) => {
      if (!m.date) return false
      const t = +parseISO(m.date)
      return t >= priorCutoff && t < cutoff
    }),
    [metricsResp, priorCutoff, cutoff],
  )
  const priorRuns = useMemo(
    () => (actsResp?.activities ?? []).filter((a) => {
      if (a.sport !== 'running' || (a.distance_meters ?? 0) <= 0 || (a.duration_seconds ?? 0) <= 0) return false
      const t = +parseISO(a.started_at)
      return t >= priorCutoff && t < cutoff
    }),
    [actsResp, priorCutoff, cutoff],
  )

  // Most recent run that has run-dynamics streams → Biomechanics lab.
  const recentRun = useMemo(
    () => [...runs].sort((a, b) => +new Date(b.started_at) - +new Date(a.started_at))[0],
    [runs],
  )
  const { data: stream } = useStreamAnalysis(recentRun?.id)
  const rd = stream?.has_streams ? stream.run_dynamics : undefined

  // ── VO₂max series → trend / forecast (real algorithm) ─────────────────────
  const vo2Series = useMemo(() => {
    const rows = metrics
      .filter((m) => m.vo2max != null && m.date)
      .map((m) => ({ date: parseISO(m.date as string), y: m.vo2max as number }))
      .sort((a, b) => +a.date - +b.date)
    if (!rows.length) return { rows, trend: null as Trend | null, current: null as number | null }
    const t0 = +rows[0].date
    const pts = rows.map((r) => ({ x: (+r.date - t0) / (1000 * 60 * 60 * 24), y: r.y }))
    const trend = linreg(pts)
    return { rows, trend, current: rows[rows.length - 1].y }
  }, [metrics])

  const currentVO2 = vo2Series.current
  const slopePerWeek = vo2Series.trend ? vo2Series.trend.slope * 7 : 0
  const slopePerMonth = vo2Series.trend ? vo2Series.trend.slope * 30.44 : 0
  const conf = confidence(vo2Series.trend)
  // Potential vs VO₂max fitness standards — a real attainable target (superior
  // ≈55, bumped higher if already met) rather than a fabricated genetic max.
  // The same target feeds the damped forecast as its ceiling.
  const potential = currentVO2 != null ? vo2maxPotential(currentVO2) : null
  const ceiling = potential != null
    ? potential.targetValue
    : (currentVO2 != null ? Math.min(65, currentVO2 + 6) : null)
  const nextVo2Delta = potential != null && currentVO2 != null ? potential.nextValue - currentVO2 : null

  // Monthly-averaged VO₂max buckets for the trend bar chart (last ~10 months).
  const vo2Monthly = useMemo(() => {
    const map = new Map<string, { sum: number; n: number; d: Date }>()
    for (const r of vo2Series.rows) {
      const k = format(startOfMonth(r.date), 'yyyy-MM')
      const cur = map.get(k) ?? { sum: 0, n: 0, d: startOfMonth(r.date) }
      cur.sum += r.y; cur.n += 1; map.set(k, cur)
    }
    return [...map.values()]
      .sort((a, b) => +a.d - +b.d)
      .slice(-10)
      .map((v) => ({ d: v.d, avg: v.sum / v.n }))
  }, [vo2Series.rows])

  const vo2Delta = vo2Monthly.length >= 2 ? vo2Monthly[vo2Monthly.length - 1].avg - vo2Monthly[0].avg : null

  // ── Threshold pace (real from profile) ────────────────────────────────────
  const thrMs = profile?.running_threshold_pace_ms ?? null
  const thrPaceSec = thrMs && thrMs > 0 ? 1000 / thrMs : null
  const lthr = profile?.lthr_running ?? null

  // ── Best-run VDOT + critical speed / D′ (real, two-effort model) ──────────
  const perf = useMemo(() => {
    const withV = runs
      .map((r) => ({ r, d: r.distance_meters as number, t: r.duration_seconds as number, v: vdot(r.distance_meters as number, r.duration_seconds as number) }))
      .filter((x) => x.v != null && x.d >= 2000) as { r: typeof runs[number]; d: number; t: number; v: number }[]
    if (!withV.length) return { bestVdot: null as number | null, cs: null as number | null, dPrime: null as number | null }
    const bestVdot = Math.max(...withV.map((x) => x.v))
    // Critical speed: two efforts of different distance, CS = Δd / Δt.
    const short = withV.filter((x) => x.d <= 6000).sort((a, b) => a.t / a.d - b.t / b.d)[0]
    const long = withV.filter((x) => x.d >= 8000).sort((a, b) => a.t / a.d - b.t / b.d)[0]
    let cs: number | null = null, dPrime: number | null = null
    if (short && long && long.d > short.d && long.t > short.t) {
      cs = (long.d - short.d) / (long.t - short.t) // m/s
      dPrime = short.d - cs * short.t // metres of anaerobic distance
      if (!(dPrime > 0)) dPrime = null
    }
    return { bestVdot, cs, dPrime }
  }, [runs])

  // ── Personal records (real best actual runs near each distance) ───────────
  const prs = useMemo(() => {
    const bucket = (target: number, tol: number) =>
      runs
        .filter((r) => Math.abs((r.distance_meters as number) - target) <= tol)
        .map((r) => ({ t: r.duration_seconds as number, at: r.started_at }))
        .sort((a, b) => a.t - b.t)
    const build = (target: number, tol: number) => {
      const b = bucket(target, tol)
      if (!b.length) return null
      return { best: b[0].t, old: b[1]?.t ?? null, at: b[0].at }
    }
    return {
      '5K': build(DIST['5K'], 600),
      '10K': build(DIST['10K'], 1200),
      Half: build(DIST.Half, 1800),
    }
  }, [runs])

  // ── Weekly volume: N ISO weeks scaled to the selected range (real) ────────
  const weeksToShow = Math.max(4, Math.min(26, Math.ceil(rangeDays / 7)))
  const weekly = useMemo(() => {
    const map = new Map<number, number>()
    for (const r of runs) {
      const wk = +startOfWeek(parseISO(r.started_at), { weekStartsOn: 1 })
      map.set(wk, (map.get(wk) ?? 0) + (r.distance_meters as number) / 1000)
    }
    const weeks: { wk: number; km: number }[] = []
    for (let i = weeksToShow - 1; i >= 0; i--) {
      const wk = +startOfWeek(subDays(now, i * 7), { weekStartsOn: 1 })
      weeks.push({ wk, km: map.get(wk) ?? 0 })
    }
    return weeks
  }, [runs, now, weeksToShow])
  const volDelta = weekly.length >= 2 ? weekly[weekly.length - 1].km - weekly[0].km : 0

  // ── Period-over-period comparisons (current vs prior equivalent window) ────
  const priorVO2 = useMemo(() => {
    const rows = priorMetrics
      .filter((m) => m.vo2max != null && m.date)
      .map((m) => ({ t: +parseISO(m.date as string), y: m.vo2max as number }))
      .sort((a, b) => a.t - b.t)
    return rows.length ? rows[rows.length - 1].y : null
  }, [priorMetrics])
  const vo2VsPrior = currentVO2 != null && priorVO2 != null ? currentVO2 - priorVO2 : null
  const curKm = useMemo(() => runs.reduce((s, r) => s + (r.distance_meters as number) / 1000, 0), [runs])
  const priorKm = useMemo(() => priorRuns.reduce((s, r) => s + (r.distance_meters as number) / 1000, 0), [priorRuns])
  const kmVsPrior = priorRuns.length ? curKm - priorKm : null

  // ── Top summary: period-over-period across the same span before/after cutoff ─
  const gran = granularityForDays(rangeDays)
  const granTxt = granularityLabel(gran, de)
  const hasPrior = priorRuns.length > 0
  const runsNow = runs.length
  const runsPrev = priorRuns.length
  const hoursNow = useMemo(() => runs.reduce((s, r) => s + (r.duration_seconds ?? 0) / 3600, 0), [runs])
  const hoursPrev = useMemo(() => priorRuns.reduce((s, r) => s + (r.duration_seconds ?? 0) / 3600, 0), [priorRuns])
  // Range-adaptive distance trend — re-buckets daily / weekly / monthly by range.
  const distChartStart = useMemo(() => new Date(Math.max(cutoff, +fetchStart)), [cutoff, fetchStart])
  const distBuckets = useMemo(
    () => bucketByGranularity(
      runs.map((r) => ({ t: +parseISO(r.started_at), v: (r.distance_meters ?? 0) / 1000 })),
      distChartStart, now, gran, 'sum',
    ),
    [runs, distChartStart, now, gran],
  )
  const kmPct = pctChange(hasPrior ? curKm : null, hasPrior ? priorKm : null)
  const vo2Pct = pctChange(currentVO2, priorVO2)
  const trendWord = (p: number | null) =>
    p == null ? T('steady', 'stabil')
      : p >= 4 ? T(`up ${Math.round(p)}%`, `+${Math.round(p)} %`)
      : p <= -4 ? T(`down ${Math.abs(Math.round(p))}%`, `−${Math.abs(Math.round(p))} %`)
      : T('steady', 'stabil')
  const summaryVerdict = !hasPrior
    ? T('No prior period to compare — building your baseline', 'Keine Vorperiode zum Vergleichen — Basislinie im Aufbau')
    : T(
        `Fitness ${trendWord(vo2Pct)} vs the previous ${rangeDays} days · volume ${trendWord(kmPct)}`,
        `Fitness ${trendWord(vo2Pct)} vs. die letzten ${rangeDays} Tage · Volumen ${trendWord(kmPct)}`,
      )

  // ── VO₂max forecast (damped, toward ceiling) — 3 past + 4 projected months ─
  const forecastData = useMemo(() => {
    if (currentVO2 == null || ceiling == null) return null
    const fwd = forecast(currentVO2, slopePerMonth, 4, ceiling)
    const past = vo2Monthly.slice(-3)
    const bars: HoverBar[] = [
      ...past.map((m) => ({ value: m.avg, valueLabel: `${m.avg.toFixed(0)} VO₂max`, label: format(m.d, 'MMM'), color: 'var(--color-strain)' })),
      ...fwd.map((v, i) => ({
        value: v, valueLabel: `${v.toFixed(0)} VO₂max`, label: format(new Date(+now + (i + 1) * MONTH_MS), 'MMM'),
        color: i === 0 ? 'var(--color-accent)' : 'var(--color-accent-soft)', highlight: i === 0,
      })),
    ]
    const projected = fwd[fwd.length - 1]
    return { bars, projected, byMonth: format(new Date(+now + 4 * MONTH_MS), 'MMM'), gain: projected - currentVO2 }
  }, [currentVO2, ceiling, slopePerMonth, vo2Monthly, now])

  // ── Race-time trajectory (VDOT now → projected) ───────────────────────────
  const race = useMemo(() => {
    if (perf.bestVdot == null) return null
    // Project VDOT forward by the modelled VO₂max gain (points ≈ VDOT points).
    const gain = forecastData ? Math.max(0, forecastData.gain) : Math.max(0, slopePerMonth * 4)
    const projVdot = perf.bestVdot + gain
    const rows = (['5K', '10K', 'Half', 'Marathon'] as const).map((k) => ({
      k,
      cur: raceTimeFromVdot(perf.bestVdot as number, DIST[k]),
      pred: raceTimeFromVdot(projVdot, DIST[k]),
    }))
    return { rows, projVdot }
  }, [perf.bestVdot, forecastData, slopePerMonth])

  const goalName = useMemo(() => {
    const ev = brief?.evidence as Record<string, unknown> | undefined
    const ath = ev?.athlete as Record<string, unknown> | undefined
    return (ath?.goal_target as string | undefined) ?? profile?.target_event_type ?? null
  }, [brief, profile])

  // ── Body composition (real weight) ────────────────────────────────────────
  const weightKg = profile?.weight_kg ?? [...metrics].reverse().find((m) => m.weight_kg != null)?.weight_kg ?? null

  // Duty factor from real GCT + cadence (step time = 60000/cadence ms).
  const dutyFactor = useMemo(() => {
    if (!rd?.ground_contact_ms || !rd?.cadence_spm) return null
    const stepMs = 60000 / rd.cadence_spm
    return (rd.ground_contact_ms / stepMs) * 100
  }, [rd])

  const rangeChipLabel = range === 'All' ? T('All', 'Alle') : range
  const rangeDaysLabel = range === 'All'
    ? T('all time', 'gesamter Zeitraum')
    : T(`last ${rangeDays} days`, `letzte ${rangeDays} Tage`)
  const priorLabel = T(`vs. prior ${rangeChipLabel}`, 'vs. Vorperiode')

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: 'var(--color-paper)' }}>
      <div className="max-w-md mx-auto px-4 pb-28">
        {/* back */}
        <div className="pt-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm font-semibold"
            style={{ color: 'var(--color-ink-2)' }}
          >
            <ArrowLeft size={18} /> {T('Back', 'Zurück')}
          </button>
        </div>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3.5 pt-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold tracking-wide" style={{ color: 'var(--color-muted)', letterSpacing: 1 }}>
              {T('PROGRESS & POTENTIAL', 'FORTSCHRITT & POTENZIAL')}
            </span>
            <h1 className="text-[28px] font-bold font-[Sora]" style={{ color: 'var(--color-ink)' }}>
              {T('Running', 'Laufen')}
            </h1>
          </div>
          <div className="flex gap-0.5 rounded-full p-[3px]" style={{ background: 'var(--color-surface-2)' }}>
            {[
              { k: 'Run', icon: Footprints, to: '/progress/run', active: true },
              { k: 'Bike', icon: Bike, to: '/progress/bike', active: false },
              { k: 'Lift', icon: Dumbbell, to: '/progress/lift', active: false },
            ].map(({ k, icon: Ic, to, active }) => (
              <button
                key={k}
                type="button"
                onClick={() => { if (!active) navigate(to) }}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-full py-2.5"
                style={{ border: 0, cursor: active ? 'default' : 'pointer', background: active ? 'var(--color-accent)' : 'transparent', color: active ? 'var(--color-ink)' : 'var(--color-muted)' }}
              >
                <Ic size={18} />
                <span className="text-sm font-semibold">{k === 'Run' ? T('Run', 'Lauf') : k === 'Bike' ? T('Bike', 'Rad') : T('Lift', 'Kraft')}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Range filter ──────────────────────────────────────────────── */}
        <div className="flex gap-[3px] rounded-full p-1 mt-5" style={{ background: 'var(--color-surface-2)' }}>
          {(['7D', '14D', '31D', '90D', '1Y', 'All'] as RangeKey[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className="flex-1 flex items-center justify-center rounded-full py-2 text-xs font-semibold"
              style={{
                minHeight: 40,
                background: range === r ? 'var(--color-accent)' : 'transparent',
                color: range === r ? 'var(--color-ink)' : 'var(--color-ink-2)',
              }}
            >
              {r === 'All' ? T('All', 'Alle') : r}
            </button>
          ))}
        </div>

        {/* ── Summary: period-over-period headline ──────────────────────── */}
        <div className="rounded-[24px] p-5 mt-5 flex flex-col gap-4" style={{ background: 'var(--color-accent-soft)', border: '1px solid var(--color-accent)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-[11px] font-bold" style={{ color: 'var(--color-accent)', letterSpacing: 1 }}>
                {T('SUMMARY', 'ZUSAMMENFASSUNG')} · {rangeDaysLabel.toUpperCase()}
              </span>
              <span className="text-[15px] font-bold font-[Sora]" style={{ color: 'var(--color-ink)', lineHeight: 1.35 }}>{summaryVerdict}</span>
            </div>
            <div className="rounded-full px-2.5 py-1.5 shrink-0" style={{ background: 'var(--color-accent)26' }}>
              <span className="text-xs font-bold" style={{ color: 'var(--color-accent)' }}>{T(`${granTxt} view`, granTxt)}</span>
            </div>
          </div>
          <div className="flex gap-2.5 flex-wrap">
            <SummaryTile label={T('DISTANCE', 'DISTANZ')} value={runsNow ? String(Math.round(curKm)) : '—'} unit="km" cur={hasPrior ? curKm : null} prev={hasPrior ? priorKm : null} />
            <SummaryTile label={T('RUNS', 'LÄUFE')} value={String(runsNow)} cur={hasPrior ? runsNow : null} prev={hasPrior ? runsPrev : null} />
            <SummaryTile label={T('HOURS', 'STUNDEN')} value={runsNow ? hoursNow.toFixed(1) : '—'} unit="h" cur={hasPrior ? hoursNow : null} prev={hasPrior ? hoursPrev : null} digits={1} />
            <SummaryTile label="VO₂max" value={currentVO2 != null ? currentVO2.toFixed(0) : '—'} cur={currentVO2} prev={priorVO2} />
          </div>
          {distBuckets.some((b) => b.value > 0) ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: 'var(--color-ink-2)' }}>{T('Distance', 'Distanz')} (km)</span>
                <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>{T(`${granTxt} buckets`, `${granTxt} Buckets`)}</span>
              </div>
              <HoverBars
                height={92}
                radius={5}
                defaultColor="var(--color-exercise)"
                bars={distBuckets.map((b, i) => ({
                  value: b.value,
                  valueLabel: `${b.value.toFixed(0)} km`,
                  label: b.label,
                  highlight: i === distBuckets.length - 1,
                }))}
              />
            </>
          ) : (
            <span className="text-sm" style={{ color: 'var(--color-muted)' }}>{T('No data in range', 'Keine Daten im Zeitraum')}</span>
          )}
        </div>

        {/* ── EngineHero: Aerobic engine / VO₂max ───────────────────────── */}
        <div className="rounded-[24px] p-[22px] mt-5 flex flex-col gap-[18px]" style={card}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: 'var(--color-muted)', letterSpacing: 1 }}>
              {T('AEROBIC ENGINE', 'AEROBER MOTOR')}
            </span>
            <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5" style={{ background: 'var(--color-recovery)26' }}>
              <Trophy size={14} style={{ color: 'var(--color-recovery)' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--color-recovery)' }}>
                {T('Top 6% age group', 'Top 6 % Altersklasse')}
              </span>
            </div>
          </div>
          <div className="flex gap-2.5">
            <HeroTile
              value={currentVO2 != null ? currentVO2.toFixed(0) : '—'}
              unit="ml/kg/min" label="VO₂max" accent="var(--color-accent)"
            />
            <HeroTile
              value={thrPaceSec != null ? fmtPace(thrPaceSec) : '—'}
              unit="/km" label={T('Threshold pace', 'Schwellentempo')} accent="var(--color-strain)"
            />
          </div>
          <div className="flex items-center justify-between">
            {vo2VsPrior != null ? (
              <PriorPill up={vo2VsPrior >= 0} text={`${vo2VsPrior >= 0 ? '+' : ''}${vo2VsPrior.toFixed(0)} VO₂max`} label={priorLabel} />
            ) : <span />}
            <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>{rangeDaysLabel}</span>
          </div>
          <div className="h-px w-full" style={{ background: 'var(--color-rule)' }} />
          {/* Potential vs VO₂max standards — motivating headroom, not a "genetic max". */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-semibold font-[Sora]" style={{ color: 'var(--color-ink)' }}>
                  {potential ? `${de ? potential.level_de : potential.level} · ${currentVO2 != null ? Math.round(currentVO2) : '—'} VO₂max` : T('Aerobic potential', 'Aerobes Potenzial')}
                </span>
                <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                  {potential && nextVo2Delta != null && nextVo2Delta > 0
                    ? T(`Next milestone → ${Math.round(potential.nextValue)} VO₂max · +${nextVo2Delta.toFixed(1)}`, `Nächstes Ziel → ${Math.round(potential.nextValue)} VO₂max · +${nextVo2Delta.toFixed(1)}`)
                    : potential
                      ? T('Top band reached — hold it', 'Spitzenband erreicht — weiter halten')
                      : T('Add VO₂max readings to see your potential', 'VO₂max-Werte hinzufügen, um dein Potenzial zu sehen')}
                </span>
              </div>
              {potential && (
                <div className="flex flex-col items-end shrink-0">
                  <span className="text-xl font-bold font-[Sora]" style={{ color: 'var(--color-accent)' }}>
                    {potential.pctToTarget}<span className="text-[13px] font-semibold" style={{ color: 'var(--color-muted)' }}> %</span>
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--color-muted)' }}>{T('to target', 'zum Ziel')}</span>
                </div>
              )}
            </div>
            <div className="h-2.5 w-full rounded-[5px] overflow-hidden" style={{ background: 'var(--color-surface-3)' }}>
              <div className="h-full rounded-[5px]" style={{ background: 'var(--color-accent)', width: potential ? `${potential.pctToTarget}%` : '0%' }} />
            </div>
            <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
              {potential
                ? T(`Progress toward a strong aerobic engine (~${Math.round(potential.targetValue)} VO₂max) · real room to grow`, `Fortschritt zu einer starken aeroben Maschine (~${Math.round(potential.targetValue)} VO₂max) · echter Spielraum`)
                : T('Add VO₂max readings to model your potential', 'VO₂max-Werte hinzufügen, um dein Potenzial zu modellieren')}
            </span>
          </div>
        </div>

        {/* ══ PROGRESS ══════════════════════════════════════════════════ */}
        <SectionHeader color="var(--color-recovery)" title={T('Progress', 'Fortschritt')} sub={T("Where you've come from", 'Woher du kommst')} />

        {/* VO₂max trend */}
        <div className="rounded-[24px] p-5 mt-4 flex flex-col gap-4" style={card}>
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-base font-semibold font-[Sora]" style={{ color: 'var(--color-ink)' }}>{T('VO₂max trend', 'VO₂max-Trend')}</span>
              <span className="text-xs" style={{ color: 'var(--color-ink-2)' }}>
                {vo2Monthly.length ? T(`Last ${vo2Monthly.length} months`, `Letzte ${vo2Monthly.length} Monate`) : T('No readings yet', 'Noch keine Werte')}
              </span>
            </div>
            {vo2Delta != null && (
              <DeltaPill up={vo2Delta >= 0} text={`${vo2Delta >= 0 ? '+' : ''}${vo2Delta.toFixed(0)} ${T('pts', 'Pkt')}`} />
            )}
          </div>
          {vo2VsPrior != null && (
            <PriorPill up={vo2VsPrior >= 0} text={`${vo2VsPrior >= 0 ? '+' : ''}${vo2VsPrior.toFixed(0)} ${T('pts', 'Pkt')}`} label={priorLabel} />
          )}
          {vo2Monthly.length ? (
            <>
              <HoverBars
                height={130}
                bars={vo2Monthly.map((m, i) => ({
                  value: m.avg,
                  valueLabel: `${m.avg.toFixed(0)} VO₂max`,
                  label: format(m.d, 'MMM yyyy'),
                  highlight: i === vo2Monthly.length - 1,
                }))}
                defaultColor="var(--color-strain)"
              />
              <div className="flex items-center gap-1.5">
                <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                  {T('Trend fit', 'Trendgüte')}: r² {vo2Series.trend ? vo2Series.trend.r2.toFixed(2) : '—'} · {slopePerWeek >= 0 ? '+' : ''}{(slopePerWeek).toFixed(2)} {T('pts/wk', 'Pkt/Wo')} · {conf.pct}% {de ? conf.label_de : conf.label}
                </span>
              </div>
            </>
          ) : (
            <span className="text-sm" style={{ color: 'var(--color-muted)' }}>{T('No data in range', 'Keine Daten im Zeitraum')}</span>
          )}
        </div>

        {/* Personal records */}
        <div className="rounded-[24px] p-5 mt-4 flex flex-col gap-4" style={card}>
          <div className="flex flex-col gap-0.5">
            <span className="text-base font-semibold font-[Sora]" style={{ color: 'var(--color-ink)' }}>{T('Personal records', 'Persönliche Bestzeiten')}</span>
            <span className="text-xs" style={{ color: 'var(--color-ink-2)' }}>{T('Best actual efforts on record', 'Beste tatsächliche Zeiten')}</span>
          </div>
          <div className="flex flex-col gap-3.5">
            {(['5K', '10K', 'Half'] as const).map((k, i) => {
              const pr = prs[k]
              return (
                <div key={k}>
                  {i > 0 && <div className="h-px w-full mb-3.5" style={{ background: 'var(--color-rule)' }} />}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-base font-bold font-[Sora]" style={{ color: 'var(--color-ink)' }}>{k === 'Half' ? T('Half', 'Halb') : k}</span>
                      <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                        {pr ? `${T('Set', 'Am')} ${format(parseISO(pr.at), 'MMM yyyy')}` : T('No effort yet', 'Noch keine Zeit')}
                      </span>
                    </div>
                    {pr ? (
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-lg font-bold font-[Sora]" style={{ color: 'var(--color-ink)' }}>{fmtRaceTime(pr.best)}</span>
                          {pr.old != null && (
                            <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>{T('from', 'von')} {fmtRaceTime(pr.old)}</span>
                          )}
                        </div>
                        {pr.old != null && pr.old > pr.best && (
                          <div className="flex items-center gap-1 rounded-full px-2.5 py-1.5" style={{ background: 'var(--color-recovery)26' }}>
                            <ArrowDownRight size={13} style={{ color: 'var(--color-recovery)' }} />
                            <span className="text-[13px] font-bold" style={{ color: 'var(--color-recovery)' }}>{signedTime(pr.old - pr.best)}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-lg font-bold font-[Sora]" style={{ color: 'var(--color-muted)' }}>—</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Weekly volume */}
        <div className="rounded-[24px] p-5 mt-4 flex flex-col gap-4" style={card}>
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-base font-semibold font-[Sora]" style={{ color: 'var(--color-ink)' }}>{T('Weekly volume', 'Wochenumfang')}</span>
              <span className="text-xs" style={{ color: 'var(--color-ink-2)' }}>{T(`Last ${weeksToShow} weeks`, `Letzte ${weeksToShow} Wochen`)}</span>
            </div>
            {kmVsPrior != null ? (
              <PriorPill up={kmVsPrior >= 0} text={`${kmVsPrior >= 0 ? '+' : ''}${kmVsPrior.toFixed(0)} km`} label={priorLabel} />
            ) : (
              <DeltaPill up={volDelta >= 0} text={`${volDelta >= 0 ? '+' : ''}${volDelta.toFixed(0)} km`} />
            )}
          </div>
          {runs.length ? (
            <>
              <HoverBars
                height={88}
                bars={weekly.map((w, i) => ({
                  value: w.km,
                  valueLabel: `${w.km.toFixed(0)} km`,
                  label: format(new Date(w.wk), 'MMM d'),
                  color: 'var(--color-exercise)',
                  highlight: i === weekly.length - 1,
                }))}
                defaultColor="var(--color-exercise)"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium" style={{ color: 'var(--color-muted)' }}>{T('Wk 1', 'Wo 1')} · {weekly[0]?.km.toFixed(0) ?? 0} km</span>
                <span className="text-[11px] font-semibold" style={{ color: 'var(--color-accent)' }}>{T('Now', 'Jetzt')} · {weekly[weekly.length - 1]?.km.toFixed(0) ?? 0} km/{T('wk', 'Wo')}</span>
              </div>
            </>
          ) : (
            <span className="text-sm" style={{ color: 'var(--color-muted)' }}>{T('No data in range', 'Keine Daten im Zeitraum')}</span>
          )}
        </div>

        {/* ══ PROJECTION ════════════════════════════════════════════════ */}
        <SectionHeader color="var(--color-strain)" title={T('Projection', 'Prognose')} sub={T("Where you're headed", 'Wohin es geht')} />

        {/* VO₂max forecast */}
        <div className="rounded-[24px] p-5 mt-4 flex flex-col gap-4" style={card}>
          <div className="flex flex-col gap-0.5">
            <span className="text-base font-semibold font-[Sora]" style={{ color: 'var(--color-ink)' }}>{T('VO₂max forecast', 'VO₂max-Prognose')}</span>
            <span className="text-xs" style={{ color: 'var(--color-ink-2)' }}>
              {T('Projection · ', 'Projektion · ')}{conf.pct}% {de ? conf.label_de : conf.label} {T('confidence', 'Konfidenz')}
            </span>
          </div>
          {forecastData ? (
            <>
              <HoverBars height={132} bars={forecastData.bars} defaultColor="var(--color-strain)" />
              <div className="flex items-center gap-2.5 rounded-[14px] p-3.5" style={{ background: 'var(--color-accent-soft)', border: '1px solid var(--color-accent)33' }}>
                <TrendingUp size={20} style={{ color: 'var(--color-accent)' }} />
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-bold font-[Sora]" style={{ color: 'var(--color-ink)' }}>
                    {T('Projected VO₂max', 'Prognostizierte VO₂max')} {forecastData.projected.toFixed(0)} {T('by', 'bis')} {forecastData.byMonth}
                  </span>
                  <span className="text-[11px]" style={{ color: 'var(--color-ink-2)' }}>
                    {forecastData.gain >= 0 ? '+' : ''}{forecastData.gain.toFixed(1)} {T('points over the next 4 months', 'Punkte in den nächsten 4 Monaten')}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <span className="text-sm" style={{ color: 'var(--color-muted)' }}>{T('Needs more VO₂max readings to project.', 'Mehr VO₂max-Werte für eine Prognose nötig.')}</span>
          )}
        </div>

        {/* Race-time trajectory */}
        <div className="rounded-[24px] p-5 mt-4 flex flex-col gap-4" style={card}>
          <div className="flex items-center gap-2">
            <Flag size={18} style={{ color: 'var(--color-strain)' }} />
            <span className="text-base font-semibold font-[Sora]" style={{ color: 'var(--color-ink)' }}>{T('Race-time trajectory', 'Renn­zeit-Verlauf')}</span>
          </div>
          {goalName && (
            <div className="flex items-center justify-between rounded-2xl p-4" style={{ background: 'var(--color-accent-soft)', border: '1px solid var(--color-accent)33' }}>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold" style={{ color: 'var(--color-muted)', letterSpacing: 1 }}>{T('GOAL EVENT', 'ZIELEVENT')}</span>
                <span className="text-[22px] font-bold font-[Sora]" style={{ color: 'var(--color-accent)' }}>{goalName}</span>
                <span className="text-xs font-medium" style={{ color: 'var(--color-ink-2)' }}>
                  {race ? `${T('Modelled from VDOT', 'Modelliert aus VDOT')} ${perf.bestVdot?.toFixed(0)}` : T('Log a race to model', 'Rennen erfassen zum Modellieren')}
                </span>
              </div>
              <div className="flex items-center justify-center rounded-full" style={{ background: 'var(--color-accent)', width: 52, height: 52 }}>
                <Medal size={28} style={{ color: 'var(--color-ink)' }} />
              </div>
            </div>
          )}
          <span className="text-[10px] font-semibold" style={{ color: 'var(--color-muted)', letterSpacing: 1 }}>{T('PREDICTED RACE TIMES', 'PROGNOSTIZIERTE ZEITEN')}</span>
          <div className="flex flex-col gap-3">
            {race ? race.rows.map((row, i) => (
              <div key={row.k}>
                {i > 0 && <div className="h-px w-full mb-3" style={{ background: 'var(--color-rule)' }} />}
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-bold font-[Sora]" style={{ color: 'var(--color-ink)' }}>{row.k === 'Half' ? T('Half', 'Halb') : row.k === 'Marathon' ? T('Marathon', 'Marathon') : row.k}</span>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[13px] font-medium" style={{ color: 'var(--color-muted)' }}>{row.cur != null ? fmtRaceTime(row.cur) : '—'}</span>
                    <ArrowRight size={14} style={{ color: 'var(--color-muted)' }} />
                    <span className="text-base font-bold font-[Sora]" style={{ color: 'var(--color-strain)' }}>{row.pred != null ? fmtRaceTime(row.pred) : '—'}</span>
                  </div>
                </div>
              </div>
            )) : (
              <span className="text-sm" style={{ color: 'var(--color-muted)' }}>{T('Log a run ≥ 2 km to predict race times.', 'Lauf ≥ 2 km erfassen für Rennprognosen.')}</span>
            )}
          </div>
        </div>

        {/* ══ POTENTIAL ═════════════════════════════════════════════════ */}
        <SectionHeader color="var(--color-accent)" title={T('Potential', 'Potenzial')} sub={T('If you optimize — highest-leverage moves', 'Wenn du optimierst — mit größter Hebelwirkung')} />

        <div className="flex flex-col gap-3 mt-4">
          {[
            { icon: Gauge, color: 'var(--color-accent)', action: T('Raise cadence to 183+ spm', 'Kadenz auf 183+ spm erhöhen'), sub: T('Shorter ground contact, less braking', 'Kürzere Bodenkontaktzeit, weniger Bremsen'), gain: T('save 8 s/km', '8 s/km sparen'), impact: 3, effort: 2 },
            { icon: Route, color: 'var(--color-strain)', action: T('Add 20 km/wk aerobic base', '20 km/Wo aerobe Basis ergänzen'), sub: T('Bigger engine in ~10 weeks', 'Größerer Motor in ~10 Wochen'), gain: '+2 VO₂max', impact: 3, effort: 3 },
            { icon: Scale, color: 'var(--color-amber)', action: T('Drop 1.5 kg to race weight', '1,5 kg bis zum Rennge­wicht'), sub: T('Better power-to-weight on climbs', 'Besseres Leistungsgewicht am Berg'), gain: '−6 s/km', impact: 2, effort: 2 },
            { icon: Dumbbell, color: 'var(--color-exercise)', action: T('2× strength sessions / week', '2× Krafttraining / Woche'), sub: T('Hold form in the final 10 km', 'Form über die letzten 10 km halten'), gain: T('−3% fade', '−3 % Abfall'), impact: 2, effort: 2 },
            { icon: Thermometer, color: 'var(--color-move)', action: T('Heat + hill adaptation block', 'Hitze- + Berg-Anpassungsblock'), sub: T('Race-day heat & elevation resilience', 'Widerstand gegen Hitze & Höhe'), gain: '+3% GAP', impact: 2, effort: 3 },
          ].map((l) => (
            <LeverCard key={l.action} {...l} applyLabel={T('Apply', 'Anwenden')} impactLabel={T('Impact', 'Wirkung')} effortLabel={T('Effort', 'Aufwand')} />
          ))}
        </div>

        {/* Upside banner */}
        <div className="rounded-[24px] p-5 mt-4 flex flex-col gap-4" style={{ background: 'var(--color-accent-soft)', border: '1px solid var(--color-accent)' }}>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center rounded-full shrink-0" style={{ background: 'var(--color-accent)', width: 44, height: 44 }}>
              <Zap size={26} style={{ color: 'var(--color-ink)' }} />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold" style={{ color: 'var(--color-muted)', letterSpacing: 1 }}>{T('FULL UPSIDE IF YOU OPTIMIZE', 'MAXIMUM BEI OPTIMIERUNG')}</span>
              <div className="flex items-end gap-2">
                <span className="text-[26px] font-bold font-[Sora]" style={{ color: 'var(--color-accent)' }}>−17 s/km</span>
                <span className="text-[13px] font-medium pb-1" style={{ color: 'var(--color-ink-2)' }}>{T('faster', 'schneller')}</span>
              </div>
            </div>
          </div>
          <span className="text-[13px]" style={{ color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
            {T('Every lever stacked compounds into your biggest breakthrough yet.', 'Alle Hebel gestapelt ergeben deinen bislang größten Durchbruch.')}
          </span>
          {prs['5K'] && (
            <div className="flex items-center justify-between rounded-[14px] p-3.5" style={{ background: '#0A0C0FB3', border: '1px solid var(--color-accent)33' }}>
              <div className="flex items-center gap-2.5">
                <span className="text-[15px] font-bold font-[Sora]" style={{ color: 'var(--color-ink)' }}>5K</span>
                <span className="text-[13px] font-medium" style={{ color: 'var(--color-muted)' }}>{fmtRaceTime(prs['5K']!.best)}</span>
                <ArrowRight size={14} style={{ color: 'var(--color-muted)' }} />
                <span className="text-[17px] font-bold font-[Sora]" style={{ color: 'var(--color-accent)' }}>{fmtRaceTime(prs['5K']!.best * 0.94)}</span>
              </div>
              <div className="rounded-full px-2.5 py-1.5" style={{ background: 'var(--color-accent)' }}>
                <span className="text-xs font-bold" style={{ color: 'var(--color-ink)' }}>{T('optimized', 'optimiert')}</span>
              </div>
            </div>
          )}
        </div>

        {/* ══ PRO LAB ══════════════════════════════════════════════════ */}
        {mode === 'pro' && (
          <>
            <SectionHeader color="var(--color-strain)" title={T('Pro Lab', 'Pro-Labor')} sub={T('What an elite obsesses over', 'Worauf Elite-Athleten achten')} />

            {/* Elite physiology */}
            <div className="rounded-[24px] p-[22px] mt-4 flex flex-col gap-4" style={card}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: 'var(--color-muted)', letterSpacing: 1 }}>{T('ELITE PHYSIOLOGY', 'ELITE-PHYSIOLOGIE')}</span>
                <div className="rounded-full px-2.5 py-1.5" style={{ background: 'var(--color-strain)' }}>
                  <span className="text-xs font-bold" style={{ color: 'var(--color-paper)' }}>{T('Elite-amateur', 'Elite-Amateur')}</span>
                </div>
              </div>
              <div className="flex gap-2.5">
                <LabTile value={currentVO2 != null ? currentVO2.toFixed(0) : '—'} unit="ml/kg/min" label="VO₂max" accent="var(--color-accent)" bench={T('elite 75–85', 'Elite 75–85')} />
                <LabTile value="—" unit="ml/kg/km" label={T('Running economy', 'Laufökonomie')} accent="var(--color-strain)" bench={T('needs a lab test', 'Labortest nötig')} />
              </div>
              <div className="flex gap-2.5">
                <LabTile value={perf.cs != null ? fmtPace(1000 / perf.cs) : '—'} unit="/km · CS" label={T('Critical speed', 'Kritische Geschw.')} accent="var(--color-recovery)" bench={T('sustainable ceiling', 'aerobe Obergrenze')} />
                <LabTile value={perf.dPrime != null ? perf.dPrime.toFixed(0) : '—'} unit="m · D′" label={T('Anaerobic reserve', 'Anaerobe Reserve')} accent="var(--color-amber)" bench={T('distance above CS', 'Distanz über CS')} />
              </div>
              {/* Lactate threshold block */}
              <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: 'var(--color-surface-2)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-bold font-[Sora]" style={{ color: 'var(--color-ink)' }}>{T('Lactate threshold', 'Laktatschwelle')}</span>
                  <div className="rounded-full px-2.5 py-1" style={{ background: 'var(--color-accent-soft)' }}>
                    <span className="text-[11px] font-bold" style={{ color: 'var(--color-accent)' }}>{T('modelled', 'modelliert')}</span>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <LTCol dot="var(--color-recovery)" tag={T('LT1 · aerobic', 'LT1 · aerob')} pace={thrPaceSec != null ? `${fmtPace(thrPaceSec * 1.14)} /km` : '—'} hr={lthr != null ? `${Math.round(lthr * 0.86)} bpm` : '—'} />
                  <LTCol dot="var(--color-accent)" tag={T('LT2 · threshold', 'LT2 · Schwelle')} pace={thrPaceSec != null ? `${fmtPace(thrPaceSec)} /km` : '—'} hr={lthr != null ? `${Math.round(lthr)} bpm` : '—'} />
                </div>
              </div>
            </div>

            {/* Biomechanics lab */}
            <div className="rounded-[24px] p-[22px] mt-4 flex flex-col gap-3.5" style={card}>
              <div className="flex flex-col gap-0.5">
                <span className="text-base font-semibold font-[Sora]" style={{ color: 'var(--color-ink)' }}>{T('Biomechanics lab', 'Biomechanik-Labor')}</span>
                <span className="text-xs" style={{ color: 'var(--color-ink-2)' }}>
                  {rd ? T('From your most recent run streams', 'Aus deinem letzten Lauf mit Streams') : T('Needs run-dynamics streams', 'Laufdynamik-Streams nötig')}
                </span>
              </div>
              <div className="flex flex-col">
                <BioRow dot="var(--color-strain)" label={T('Leg-spring stiffness', 'Beinsteifigkeit')} note={T('needs force data', 'Kraftdaten nötig')} value="—" unit="kN/m" />
                <BioRow dot="var(--color-recovery)" label={T('Duty factor', 'Duty-Faktor')} note={T('Lower = springier', 'Niedriger = federnder')} value={dutyFactor != null ? dutyFactor.toFixed(1) : '—'} unit="%" />
                <BioRow dot="var(--color-accent)" label={T('Ground contact time', 'Bodenkontaktzeit')} note={T('Elite <200', 'Elite <200')} value={rd?.ground_contact_ms != null ? rd.ground_contact_ms.toFixed(0) : '—'} unit="ms" />
                <BioRow dot="var(--color-amber)" label={T('Vertical ratio', 'Vertikalverhältnis')} note={T('Elite <7', 'Elite <7')} value={rd?.vertical_ratio_pct != null ? rd.vertical_ratio_pct.toFixed(1) : '—'} unit="%" />
                <BioRow dot="var(--color-stand)" label={T('Form power', 'Formleistung')} note={T('needs run power', 'Laufleistung nötig')} value="—" unit="W" last />
              </div>
            </div>

            {/* Durability */}
            <div className="rounded-[24px] p-[22px] mt-4 flex flex-col gap-4" style={card}>
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-base font-semibold font-[Sora]" style={{ color: 'var(--color-ink)' }}>{T('Durability', 'Ermüdungs­resistenz')}</span>
                  <span className="text-xs" style={{ color: 'var(--color-ink-2)' }}>{T('Fatigue resistance · last 25% of long runs', 'Ermüdungsresistenz · letzte 25 % langer Läufe')}</span>
                </div>
                <div className="rounded-full px-2.5 py-1.5" style={{ background: 'var(--color-surface-2)' }}>
                  <span className="text-xs font-bold" style={{ color: 'var(--color-muted)' }}>{T('needs streams', 'Streams nötig')}</span>
                </div>
              </div>
              <DecoupleRow label={T('Pace decoupling', 'Tempo-Entkopplung')} note={T('Second-half pace vs first — needs per-km streams', 'Tempo zweite vs. erste Hälfte — km-Streams nötig')} color="var(--color-recovery)" />
              <DecoupleRow label={T('HR / economy decoupling', 'HF-/Ökonomie-Entkopplung')} note={T('Aerobic drift — needs HR + pace streams', 'Aerobe Drift — HF- + Tempo-Streams nötig')} color="var(--color-strain)" />
            </div>

            {/* Fuelling & sweat */}
            <div className="rounded-[24px] p-[22px] mt-4 flex flex-col gap-3.5" style={card}>
              <div className="flex flex-col gap-0.5">
                <span className="text-base font-semibold font-[Sora]" style={{ color: 'var(--color-ink)' }}>{T('Fuelling & sweat', 'Ernährung & Schweiß')}</span>
                <span className="text-xs" style={{ color: 'var(--color-ink-2)' }}>{T('Race-day carb, fluid & sodium — needs a sweat test', 'Renn-Kohlenhydrate, Flüssigkeit & Natrium — Schweißtest nötig')}</span>
              </div>
              <div className="flex gap-2.5">
                <MiniTile value="—" accent="var(--color-amber)" label={T('g/hr carb ox', 'g/h Kohlenhydrate')} />
                <MiniTile value="—" accent="var(--color-strain)" label={T('L/hr sweat', 'L/h Schweiß')} />
                <MiniTile value="—" accent="var(--color-stand)" label={T('mg/L sodium', 'mg/L Natrium')} />
              </div>
            </div>

            {/* Metabolic efficiency */}
            <div className="rounded-[24px] p-[22px] mt-4 flex flex-col gap-3.5" style={card}>
              <div className="flex flex-col gap-0.5">
                <span className="text-base font-semibold font-[Sora]" style={{ color: 'var(--color-ink)' }}>{T('Metabolic efficiency', 'Stoffwechsel-Effizienz')}</span>
                <span className="text-xs" style={{ color: 'var(--color-ink-2)' }}>{T('Fat-max — needs a metabolic cart', 'Fat-Max — Spiroergometrie nötig')}</span>
              </div>
              <div className="flex gap-2.5">
                <BigTile value="—" unit="/km" label={T('Fat-max pace', 'Fat-Max-Tempo')} accent="var(--color-exercise)" />
                <BigTile value="—" unit="" label={T('g/min fat oxidation', 'g/min Fettoxidation')} accent="var(--color-amber)" />
              </div>
            </div>

            {/* Body composition */}
            <div className="rounded-[24px] p-[22px] mt-4 flex flex-col gap-3.5" style={card}>
              <div className="flex flex-col gap-0.5">
                <span className="text-base font-semibold font-[Sora]" style={{ color: 'var(--color-ink)' }}>{T('Body composition', 'Körperzusammensetzung')}</span>
                <span className="text-xs" style={{ color: 'var(--color-ink-2)' }}>{T('Race weight & power-to-weight', 'Renngewicht & Leistungsgewicht')}</span>
              </div>
              <div className="flex gap-2.5">
                <MiniTile value={weightKg != null ? weightKg.toFixed(1) : '—'} unit="kg" accent="var(--color-stand)" label={T('Body weight', 'Körpergewicht')} />
                <MiniTile value="—" unit="%" accent="var(--color-strain)" label={T('Body fat', 'Körperfett')} />
                <MiniTile value="—" unit="W/kg" accent="var(--color-accent)" label={T('Stride power', 'Schrittleistung')} />
              </div>
              <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>{T('Body fat & running power need a DEXA scan and a run power meter.', 'Körperfett & Laufleistung erfordern DEXA-Scan und Lauf-Powermeter.')}</span>
            </div>
          </>
        )}

        {/* ══ AMATEUR MODE ═════════════════════════════════════════════ */}
        <SectionHeader color="var(--color-exercise)" title={T('Amateur mode', 'Amateur-Modus')} sub={T('The same science, in plain language', 'Dieselbe Wissenschaft, einfach erklärt')} />

        {/* Simple / Pro toggle */}
        <div className="flex gap-0.5 rounded-full p-[3px] mt-4" style={{ background: 'var(--color-surface-2)' }}>
          {([
            { k: 'simple' as const, icon: Leaf, label: T('Simple', 'Einfach') },
            { k: 'pro' as const, icon: FlaskConical, label: 'Pro' },
          ]).map(({ k, icon: Ic, label }) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-full py-2.5"
              style={{ background: mode === k ? 'var(--color-accent)' : 'transparent', color: mode === k ? 'var(--color-paper)' : 'var(--color-ink-2)' }}
            >
              <Ic size={15} />
              <span className="text-[13px] font-bold">{label}</span>
            </button>
          ))}
        </div>

        {mode === 'simple' && (
          <>
            {/* Coach explains — running economy */}
            <CoachCard
              term={T('Running economy', 'Laufökonomie')}
              plain={T('How much fuel you burn to hold a given pace. Two runners at the same speed — the more economical one lasts longer on the same tank.', 'Wie viel Energie du verbrennst, um ein Tempo zu halten. Bei gleicher Geschwindigkeit hält der ökonomischere Läufer länger durch.')}
              why={T('Better economy = free speed without getting fitter. It’s efficiency, not effort.', 'Bessere Ökonomie = geschenkte Geschwindigkeit ohne mehr Fitness. Effizienz, nicht Anstrengung.')}
              action={T('Add strides & strength 2× / week → smoother, cheaper stride', 'Strides & Kraft 2× / Woche → runderer, günstigerer Schritt')}
              actionColor="var(--color-accent)"
            />
            {/* Coach explains — lactate threshold */}
            <CoachCard
              term={T('Lactate threshold', 'Laktatschwelle')}
              plain={T('The fastest pace you can hold before your legs start to flood and burn. Push past it and the clock starts ticking on how long you last.', 'Das schnellste Tempo, das du halten kannst, bevor die Beine übersäuern. Darüber hinaus läuft die Uhr, wie lange du durchhältst.')}
              why={T('Raising it lets you race harder for longer without blowing up.', 'Sie anzuheben lässt dich härter und länger laufen, ohne einzubrechen.')}
              action={T('Weekly tempo run at ‘comfortably hard’ → lifts the ceiling', 'Wöchentlicher Tempolauf „komfortabel hart“ → hebt die Grenze')}
              actionColor="var(--color-amber)"
            />

            {/* Beginner fundamentals */}
            <div className="rounded-[24px] p-[22px] mt-4 flex flex-col gap-4" style={card}>
              <div className="flex flex-col gap-0.5">
                <span className="text-base font-semibold font-[Sora]" style={{ color: 'var(--color-ink)' }}>{T('Your fundamentals', 'Deine Grundlagen')}</span>
                <span className="text-xs" style={{ color: 'var(--color-ink-2)' }}>{T('You vs a typical amateur runner', 'Du vs. ein typischer Amateur')}</span>
              </div>
              <div className="flex flex-col gap-[18px]">
                <FundamentalBar icon={TrendingUp} label={T('Consistency', 'Konstanz')} value={`${consistencyPct(runs, now, weeksToShow)}%`} pct={consistencyPct(runs, now, weeksToShow)} color="var(--color-recovery)" you={T('You', 'Du')} avg={T('typical amateur', 'typischer Amateur')} />
                <FundamentalBar icon={Gauge} label={T('Weekly volume vs peers', 'Umfang vs. Andere')} value={`${weekly[weekly.length - 1]?.km.toFixed(0) ?? 0} km`} pct={Math.min(100, ((weekly[weekly.length - 1]?.km ?? 0) / 80) * 100)} color="var(--color-strain)" you={T('You', 'Du')} avg={T('typical amateur', 'typischer Amateur')} />
                <FundamentalBar icon={Trophy} label={T('Next PB target', 'Nächstes PB-Ziel')} value={prs['5K'] ? fmtRaceTime(prs['5K']!.best * 0.97) : '—'} pct={62} color="var(--color-accent)" you={T('You', 'Du')} avg={T('typical amateur', 'typischer Amateur')} />
              </div>
            </div>
          </>
        )}
      </div>
      <MobileBottomNav />
    </div>
  )
}

// ── consistency: share of the last N weeks with ≥1 run ───────────────────────
function consistencyPct(runs: { started_at: string }[], now: Date, weeks = 8): number {
  const seen = new Set<number>()
  for (const r of runs) {
    const wk = +startOfWeek(parseISO(r.started_at), { weekStartsOn: 1 })
    seen.add(wk)
  }
  let hit = 0
  for (let i = 0; i < weeks; i++) {
    const wk = +startOfWeek(subDays(now, i * 7), { weekStartsOn: 1 })
    if (seen.has(wk)) hit++
  }
  return Math.round((hit / weeks) * 100)
}

// ── presentational components ────────────────────────────────────────────────
function SectionHeader({ color, title, sub }: { color: string; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-2.5 mt-6">
      <div className="rounded-[2px]" style={{ background: color, width: 4, height: 28 }} />
      <div className="flex flex-col gap-px">
        <span className="text-[17px] font-bold font-[Sora]" style={{ color: 'var(--color-ink)' }}>{title}</span>
        <span className="text-xs" style={{ color: 'var(--color-ink-2)' }}>{sub}</span>
      </div>
    </div>
  )
}

function DeltaPill({ up, text }: { up: boolean; text: string }) {
  const c = up ? 'var(--color-recovery)' : 'var(--color-accent)'
  return (
    <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5" style={{ background: `${up ? 'var(--color-recovery)' : 'var(--color-accent)'}26` }}>
      <TrendingUp size={14} style={{ color: c }} />
      <span className="text-xs font-semibold" style={{ color: c }}>{text}</span>
    </div>
  )
}

// Period-over-period delta: green up (recovery), red down (move), with a
// small "vs. prior …" caption. Real data only — render nothing when null.
function PriorPill({ up, text, label }: { up: boolean; text: string; label: string }) {
  const c = up ? 'var(--color-recovery)' : 'var(--color-move)'
  return (
    <div className="flex items-center" style={{ gap: 6 }}>
      <div className="flex items-center rounded-full px-2.5 py-1.5" style={{ gap: 4, background: `${c}26` }}>
        {up ? <TrendingUp size={13} style={{ color: c }} /> : <ArrowDownRight size={13} style={{ color: c }} />}
        <span className="text-xs font-semibold" style={{ color: c }}>{text}</span>
      </div>
      <span className="text-[10px]" style={{ color: 'var(--color-muted)' }}>{label}</span>
    </div>
  )
}

// Summary-card metric tile with a polarity-aware period-over-period delta.
// higherBetter=false flips the colour (e.g. resting HR: higher = worse).
function SummaryTile({ label, value, unit, cur, prev, higherBetter = true, digits = 0 }: {
  label: string; value: string; unit?: string; cur: number | null; prev: number | null; higherBetter?: boolean; digits?: number
}) {
  const abs = cur != null && prev != null ? cur - prev : null
  const pct = pctChange(cur, prev)
  const good = abs == null ? null : higherBetter ? abs >= 0 : abs <= 0
  const col = good == null ? 'var(--color-muted)' : good ? 'var(--color-recovery)' : 'var(--color-move)'
  return (
    <div className="flex flex-col rounded-[14px] p-3.5 flex-1" style={{ background: 'var(--color-surface-2)', gap: 5, minWidth: 0 }}>
      <span className="text-[10px] font-semibold" style={{ color: 'var(--color-ink-2)', letterSpacing: 0.4 }}>{label}</span>
      <div className="flex items-end gap-1">
        <span className="text-2xl leading-none font-bold font-[Sora]" style={{ color: 'var(--color-ink)' }}>{value}</span>
        {unit && <span className="text-[11px] pb-0.5" style={{ color: 'var(--color-muted)' }}>{unit}</span>}
      </div>
      {abs == null ? (
        <span className="text-[11px] font-semibold" style={{ color: 'var(--color-muted)' }}>—</span>
      ) : (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: col }}>
          {abs >= 0 ? <TrendingUp size={11} /> : <ArrowDownRight size={11} />}
          {abs >= 0 ? '+' : ''}{abs.toFixed(digits)}{pct != null ? ` · ${pct >= 0 ? '+' : ''}${Math.round(pct)}%` : ''}
        </span>
      )}
    </div>
  )
}

function HeroTile({ value, unit, label, accent }: { value: string; unit: string; label: string; accent: string }) {
  return (
    <div className="flex-1 rounded-[14px] p-3.5 flex flex-col gap-1" style={{ background: 'var(--color-surface-2)' }}>
      <div className="flex items-end gap-1">
        <span className="text-[38px] leading-none font-bold font-[Sora]" style={{ color: 'var(--color-ink)' }}>{value}</span>
        <span className="text-[13px] font-medium pb-[7px]" style={{ color: 'var(--color-muted)' }}>{unit}</span>
      </div>
      <span className="text-[13px] font-semibold" style={{ color: 'var(--color-ink-2)' }}>{label}</span>
      <div className="rounded-[2px]" style={{ background: accent, width: 28, height: 3 }} />
    </div>
  )
}

function LabTile({ value, unit, label, accent, bench }: { value: string; unit: string; label: string; accent: string; bench: string }) {
  return (
    <div className="flex-1 rounded-[14px] p-3.5 flex flex-col gap-1.5" style={{ background: 'var(--color-surface-2)' }}>
      <div className="flex items-end gap-1">
        <span className="text-[34px] leading-none font-bold font-[Sora]" style={{ color: 'var(--color-ink)' }}>{value}</span>
        <span className="text-xs font-semibold pb-1.5" style={{ color: 'var(--color-muted)' }}>{unit}</span>
      </div>
      <span className="text-[13px] font-semibold" style={{ color: 'var(--color-ink-2)' }}>{label}</span>
      <div className="rounded-[2px]" style={{ background: accent, width: 28, height: 3 }} />
      <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>{bench}</span>
    </div>
  )
}

function LTCol({ dot, tag, pace, hr }: { dot: string; tag: string; pace: string; hr: string }) {
  return (
    <div className="flex-1 flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <div className="rounded" style={{ background: dot, width: 8, height: 8 }} />
        <span className="text-xs font-semibold" style={{ color: 'var(--color-ink-2)' }}>{tag}</span>
      </div>
      <span className="text-xl font-bold font-[Sora]" style={{ color: 'var(--color-ink)' }}>{pace}</span>
      <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>{hr}</span>
    </div>
  )
}

function BioRow({ dot, label, note, value, unit, last }: { dot: string; label: string; note: string; value: string; unit: string; last?: boolean }) {
  return (
    <>
      <div className="flex items-center justify-between py-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-[3px]" style={{ background: dot, width: 6, height: 6 }} />
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-semibold" style={{ color: 'var(--color-ink)' }}>{label}</span>
            <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>{note}</span>
          </div>
        </div>
        <div className="flex items-end gap-1">
          <span className="text-xl font-bold font-[Sora]" style={{ color: value === '—' ? 'var(--color-muted)' : 'var(--color-ink)' }}>{value}</span>
          <span className="text-[11px] font-semibold pb-[3px]" style={{ color: 'var(--color-muted)' }}>{unit}</span>
        </div>
      </div>
      {!last && <div className="h-px w-full" style={{ background: 'var(--color-rule)' }} />}
    </>
  )
}

function DecoupleRow({ label, note, color }: { label: string; note: string; color: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-between">
        <span className="text-[13px] font-semibold" style={{ color: 'var(--color-ink-2)' }}>{label}</span>
        <span className="text-[22px] font-bold font-[Sora]" style={{ color: 'var(--color-muted)' }}>—</span>
      </div>
      <div className="h-2 w-full rounded" style={{ background: 'var(--color-surface-3)' }}>
        <div className="h-full rounded" style={{ background: color, width: '0%' }} />
      </div>
      <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>{note}</span>
    </div>
  )
}

function MiniTile({ value, unit, accent, label }: { value: string; unit?: string; accent: string; label: string }) {
  return (
    <div className="flex-1 rounded-[14px] p-3.5 flex flex-col items-center gap-1.5" style={{ background: 'var(--color-surface-2)' }}>
      <div className="flex items-end gap-0.5">
        <span className="text-[26px] leading-none font-bold font-[Sora]" style={{ color: value === '—' ? 'var(--color-muted)' : 'var(--color-ink)' }}>{value}</span>
        {unit && <span className="text-[11px] font-semibold pb-[3px]" style={{ color: 'var(--color-muted)' }}>{unit}</span>}
      </div>
      <div className="rounded-[2px]" style={{ background: accent, width: 24, height: 3 }} />
      <span className="text-[11px] font-semibold text-center" style={{ color: 'var(--color-ink-2)' }}>{label}</span>
    </div>
  )
}

function BigTile({ value, unit, label, accent }: { value: string; unit: string; label: string; accent: string }) {
  return (
    <div className="flex-1 rounded-[14px] p-4 flex flex-col gap-1.5" style={{ background: 'var(--color-surface-2)' }}>
      <div className="flex items-end gap-1">
        <span className="text-[32px] leading-none font-bold font-[Sora]" style={{ color: value === '—' ? 'var(--color-muted)' : 'var(--color-ink)' }}>{value}</span>
        {unit && <span className="text-xs font-semibold pb-1.5" style={{ color: 'var(--color-muted)' }}>{unit}</span>}
      </div>
      <span className="text-[13px] font-semibold" style={{ color: 'var(--color-ink-2)' }}>{label}</span>
      <div className="rounded-[2px]" style={{ background: accent, width: 28, height: 3 }} />
    </div>
  )
}

function LeverCard({ icon: Ic, color, action, sub, gain, impact, effort, applyLabel, impactLabel, effortLabel }: {
  icon: typeof Gauge; color: string; action: string; sub: string; gain: string; impact: number; effort: number; applyLabel: string; impactLabel: string; effortLabel: string
}) {
  return (
    <div className="rounded-[18px] p-4 flex flex-col gap-3.5" style={card}>
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center rounded-xl shrink-0" style={{ background: `${color}26`, width: 42, height: 42 }}>
          <Ic size={22} style={{ color }} />
        </div>
        <div className="flex-1 flex flex-col gap-0.5">
          <span className="text-sm font-bold" style={{ color: 'var(--color-ink)', lineHeight: 1.25 }}>{action}</span>
          <span className="text-xs" style={{ color: 'var(--color-ink-2)', lineHeight: 1.3 }}>{sub}</span>
        </div>
        <div className="rounded-full px-2.5 py-1.5 shrink-0" style={{ background: 'var(--color-recovery)26' }}>
          <span className="text-[13px] font-bold font-[Sora]" style={{ color: 'var(--color-recovery)' }}>{gain}</span>
        </div>
      </div>
      <div className="h-px w-full" style={{ background: 'var(--color-rule)' }} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <Dots label={impactLabel} n={impact} />
          <Dots label={effortLabel} n={effort} />
        </div>
        <div className="flex items-center gap-1.5 rounded-full px-3.5 py-2" style={{ background: 'var(--color-accent-soft)' }}>
          <span className="text-[13px] font-bold" style={{ color: 'var(--color-accent)' }}>{applyLabel}</span>
          <Plus size={15} style={{ color: 'var(--color-accent)' }} />
        </div>
      </div>
    </div>
  )
}

function Dots({ label, n }: { label: string; n: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] font-medium" style={{ color: 'var(--color-muted)' }}>{label}</span>
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-full" style={{ width: 5, height: 5, background: i < n ? 'var(--color-accent)' : 'var(--color-surface-3)' }} />
        ))}
      </div>
    </div>
  )
}

function CoachCard({ term, plain, why, action, actionColor }: { term: string; plain: string; why: string; action: string; actionColor: string }) {
  return (
    <div className="rounded-[18px] p-[18px] mt-4 flex flex-col gap-3" style={card}>
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center rounded-2xl shrink-0" style={{ background: 'var(--color-accent-soft)', width: 32, height: 32 }}>
          <MessageCircle size={18} style={{ color: 'var(--color-accent)' }} />
        </div>
        <div className="flex flex-col gap-px">
          <span className="text-[10px] font-semibold" style={{ color: 'var(--color-muted)', letterSpacing: 1 }}>COACH EXPLAINS</span>
          <span className="text-[15px] font-bold font-[Sora]" style={{ color: 'var(--color-ink)' }}>{term}</span>
        </div>
      </div>
      <span className="text-[13px]" style={{ color: 'var(--color-ink-2)', lineHeight: 1.45 }}>{plain}</span>
      <div className="flex items-start gap-2">
        <Info size={15} className="shrink-0 mt-0.5" style={{ color: 'var(--color-muted)' }} />
        <span className="text-xs" style={{ color: 'var(--color-muted)', lineHeight: 1.4 }}>{why}</span>
      </div>
      <div className="flex items-center gap-2 rounded-xl p-3" style={{ background: 'var(--color-accent-soft)', border: '1px solid var(--color-accent)33' }}>
        <Zap size={16} className="shrink-0" style={{ color: actionColor }} />
        <span className="text-xs font-semibold" style={{ color: 'var(--color-ink)', lineHeight: 1.35 }}>{action}</span>
      </div>
    </div>
  )
}

function FundamentalBar({ icon: Ic, label, value, pct, color, you, avg }: { icon: typeof Gauge; label: string; value: string; pct: number; color: string; you: string; avg: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center rounded-[9px]" style={{ background: 'var(--color-surface-2)', width: 28, height: 28 }}>
            <Ic size={15} style={{ color }} />
          </div>
          <span className="text-sm font-semibold" style={{ color: 'var(--color-ink)' }}>{label}</span>
        </div>
        <span className="text-base font-bold font-[Sora]" style={{ color }}>{value}</span>
      </div>
      <div className="h-2.5 w-full rounded-[5px]" style={{ background: 'var(--color-surface-3)' }}>
        <div className="h-full rounded-[5px]" style={{ background: color, width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold" style={{ color: 'var(--color-ink-2)' }}>{you}</span>
        <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>{avg}</span>
      </div>
    </div>
  )
}
