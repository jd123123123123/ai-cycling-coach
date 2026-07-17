import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Footprints, Bike, Dumbbell, TrendingUp, ArrowUp, ArrowDown, Trophy, Flag,
  Check, Zap, Lock, Medal, Utensils, Moon, RotateCcw, Rocket, Plus, Gauge,
  BarChart3, Lightbulb, FlaskConical, Smile, CalendarCheck, Scale,
} from 'lucide-react'
import { subDays } from 'date-fns'
import { useLocale } from '../contexts/LocaleContext'
import { useActivitiesRange } from '../hooks/useActivitiesRange'
import { useDailyMetrics } from '../hooks/useDailyMetrics'
import { useAthleteProfile } from '../hooks/useAthleteProfile'
import { useSessions } from '../hooks/useStrength'
import {
  epley1RM, dots, strengthLevel, strengthPotential, linreg, forecast, confidence,
  granularityForDays, granularityLabel, pctChange, bucketByGranularity,
} from '../utils/progression'
import HoverBars from '../components/ui/HoverBars'
import MobileBottomNav from '../components/dashboard/MobileBottomNav'
import { RoutinesManager } from '../components/strength/RoutinesManager'

/**
 * Lift Progress — the standalone /progress/lift screen. A 1:1 rebuild of the
 * Pencil "Strength" design: header + range filter, DOTS hero, PROGRESS
 * (total e1RM / by-lift / recent PRs), PROJECTION (forecast / projected 1RM /
 * level trajectory), POTENTIAL (5 optimisation levers + summary), PRO LAB
 * (VBT / lifting readiness / volume landmarks / force & symmetry / body comp),
 * and AMATEUR MODE (Simple/Pro toggle → coach-explains + simple scorecard).
 *
 * DATA CEILING: the backend gym Activity carries no per-set weight/rep/exercise
 * data, so every e1RM / by-lift / DOTS / VBT / volume-landmark figure is an
 * honest "—" + unlock note rather than a fabricated number. What IS real:
 * gym-session frequency/streak (activities), lifting readiness (daily metrics),
 * bodyweight (profile). The optional set-logging path below feeds the real
 * strength-science library (epley1RM/dots/strengthLevel/linreg/forecast/
 * confidence); with no sets logged it resolves to null → the empty states.
 */

const DASH = '—'

// Token colours (source of truth: src/index.css :root).
const C_SQUAT = 'var(--color-strain)' // #38B6FF
const C_BENCH = 'var(--color-stand)' // #00E5D4
const C_DEAD = 'var(--color-accent)' // #FF5A3C
const C_GOOD = 'var(--color-recovery)' // #16E08A
const C_AMBER = 'var(--color-amber)' // #FFB020
const C_BAD = 'var(--color-move)' // #FA1E55

const SOFT_ACCENT = 'var(--color-accent-soft)' // #FF5A3C26
const SOFT_GOOD = 'rgba(22,224,138,0.15)'
const SOFT_AMBER = 'rgba(255,176,32,0.15)'

// ---------------------------------------------------------------------------
// Optional future set-logging path → real strength-science library.
// Empty now (backend exposes no sets) so computeStrength() returns null and
// every strength figure falls through to the honest empty state.
// ---------------------------------------------------------------------------
type LiftKind = 'squat' | 'bench' | 'deadlift'
interface LiftSet { lift: LiftKind; weightKg: number; reps: number; date: string }

// Map a logged exercise name (de/en, free-form) to one of the big-three lifts
// that the strength-science library scores. Anything else is ignored so the
// DOTS/e1RM figures only ever reflect real squat/bench/deadlift work.
function liftKindFromName(name: string): LiftKind | null {
  const n = name.toLowerCase()
  if (/(deadlift|kreuzheben|kreuzheb)/.test(n)) return 'deadlift'
  if (/(bench|bankdr|bankdrücken|bank)/.test(n)) return 'bench'
  if (/(squat|kniebeuge|kniebeug)/.test(n)) return 'squat'
  return null
}

function computeStrength(sets: LiftSet[], bodyweightKg: number | null) {
  if (!sets.length || !bodyweightKg) return null
  const best = (l: LiftKind) => {
    const s = sets.filter((x) => x.lift === l)
    return s.length ? Math.max(...s.map((x) => epley1RM(x.weightKg, x.reps))) : 0
  }
  const squat = best('squat')
  const bench = best('bench')
  const dead = best('deadlift')
  const total = squat + bench + dead
  const monthly = new Map<string, number>()
  for (const s of sets) {
    const k = s.date.slice(0, 7)
    monthly.set(k, Math.max(monthly.get(k) ?? 0, epley1RM(s.weightKg, s.reps)))
  }
  const series = [...monthly.entries()].sort().map(([, y], x) => ({ x, y }))
  const tr = linreg(series)
  const proj = tr ? forecast(total, tr.slope, 8) : []
  const squatRatio = squat / bodyweightKg
  return {
    squat, bench, dead, total,
    dotsScore: dots(total, bodyweightKg),
    level: strengthLevel(squatRatio),
    squatRatio,
    potential: strengthPotential(squatRatio),
    projected: proj.length ? proj[proj.length - 1] : total,
    conf: confidence(tr),
  }
}

// ---------------------------------------------------------------------------
// Presentational primitives
// ---------------------------------------------------------------------------
function Card({ children, soft = false, gap = 14, pad = 20 }: {
  children: React.ReactNode; soft?: boolean; gap?: number; pad?: number
}) {
  return (
    <div
      className="rounded-[24px]"
      style={{
        display: 'flex', flexDirection: 'column', gap, padding: pad,
        background: soft ? SOFT_ACCENT : 'var(--color-paper-2)',
        border: `1px solid ${soft ? 'var(--color-accent)' : 'var(--color-rule)'}`,
      }}
    >
      {children}
    </div>
  )
}

function SectionHeader({ color, title, sub }: { color: string; title: string; sub: string }) {
  return (
    <div className="flex items-center" style={{ gap: 11, padding: '4px 0 0 0' }}>
      <div style={{ width: 4, height: 30, borderRadius: 2, background: color }} />
      <div className="flex flex-col" style={{ gap: 1 }}>
        <span className="num-display" style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-ink)' }}>{title}</span>
        <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{sub}</span>
      </div>
    </div>
  )
}

function CardTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex flex-col" style={{ gap: 2 }}>
      <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{title}</span>
      {sub && <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{sub}</span>}
    </div>
  )
}

// Skeleton chart placeholder that keeps the card's structure while being honest.
function EmptyChart({ note, height = 120 }: { note: string; height?: number }) {
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ height, gap: 6, borderRadius: 12, background: 'var(--color-surface-2)' }}
    >
      <span className="num-display" style={{ fontSize: 30, fontWeight: 700, color: 'var(--color-muted)' }}>{DASH}</span>
      <span style={{ fontSize: 11, color: 'var(--color-muted)', textAlign: 'center', padding: '0 16px' }}>{note}</span>
    </div>
  )
}

// Period-over-period delta chip — green up / red down. REAL data only; the
// caller renders it only when the prior window has comparable data.
function DeltaChip({ delta, unit = '', sub }: { delta: number; unit?: string; sub: string }) {
  const up = delta >= 0
  const color = up ? C_GOOD : C_BAD
  const soft = up ? SOFT_GOOD : 'rgba(250,30,85,0.15)'
  return (
    <div className="flex items-center rounded-full self-start" style={{ gap: 5, padding: '4px 9px', background: soft }}>
      {up ? <ArrowUp size={12} color={color} /> : <ArrowDown size={12} color={color} />}
      <span className="num-display" style={{ fontSize: 11, fontWeight: 700, color }}>
        {up ? '+' : ''}{delta}{unit}
      </span>
      <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{sub}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
export default function LiftProgressView() {
  const navigate = useNavigate()
  const { locale } = useLocale()
  const de = locale === 'de'
  const unlock = de ? 'Krafteinheiten mit Sätzen & Gewichten protokollieren' : 'Log sets & weights to unlock'

  const [mode, setMode] = useState<'simple' | 'pro'>('simple')
  const RANGES = [
    { k: '7D', d: 7 }, { k: '14D', d: 14 }, { k: '31D', d: 31 },
    { k: '90D', d: 90 }, { k: '1Y', d: 365 }, { k: 'All', d: 1460 },
  ] as const
  const [range, setRange] = useState<string>('90D')
  const days = RANGES.find((r) => r.k === range)?.d ?? 90
  // The API rejects windows > 366 days, so clamp every fetch. `fetchDays` is the
  // honest current-window span; `fetchSpan` widens the fetch to also cover the
  // immediately-prior window for period-over-period deltas (still clamped).
  const fetchDays = Math.min(days, 365)
  const fetchSpan = Math.min(days * 2, 365)
  const hasPriorWindow = fetchSpan > fetchDays

  const now = useMemo(() => new Date(), [])
  const start = useMemo(() => subDays(now, fetchSpan), [now, fetchSpan])
  const cutoff = useMemo(() => subDays(now, fetchDays), [now, fetchDays]) // prior ↔ current boundary
  const cutoff2 = useMemo(() => subDays(now, fetchDays * 2), [now, fetchDays]) // start of prior window

  const { data: actData } = useActivitiesRange(start, now)
  const { data: metricData } = useDailyMetrics(start, now)
  const { data: profile } = useAthleteProfile()

  const windowLabel = de ? `letzte ${fetchDays} Tage` : `last ${fetchDays} days`
  const priorSub = de ? 'vs. Vorperiode' : `vs. prior ${fetchDays}d`

  // ---- REAL gym-derived figures --------------------------------------------
  // `gym` = every fetched session (feeds the streak walk-back); current/prior
  // windows drive the range-aware frequency and its period-over-period delta.
  const gym = useMemo(() => (actData?.activities ?? []).filter((a) => a.sport === 'gym'), [actData])
  const gymCurrent = useMemo(() => gym.filter((a) => new Date(a.started_at) >= cutoff), [gym, cutoff])
  const gymPrior = useMemo(
    () => gym.filter((a) => new Date(a.started_at) >= cutoff2 && new Date(a.started_at) < cutoff),
    [gym, cutoff, cutoff2],
  )
  const sessionCount = gymCurrent.length
  const perWeek = fetchDays > 0 ? Math.round((sessionCount / (fetchDays / 7)) * 10) / 10 : 0
  const priorPerWeek = fetchDays > 0 ? Math.round((gymPrior.length / (fetchDays / 7)) * 10) / 10 : 0
  // Only a delta when the prior window was actually fetched AND holds data.
  const perWeekDelta = hasPriorWindow && gymPrior.length > 0
    ? Math.round((perWeek - priorPerWeek) * 10) / 10
    : null

  const streak = useMemo(() => {
    const weekKey = (iso: string) => {
      const d = new Date(iso)
      const day = (d.getDay() + 6) % 7
      d.setDate(d.getDate() - day)
      return d.toISOString().slice(0, 10)
    }
    const weeks = new Set(gym.map((a) => weekKey(a.started_at)))
    let s = 0
    const cur = new Date(now)
    // walk back from the current week while each week has ≥1 gym session
    for (;;) {
      const day = (cur.getDay() + 6) % 7
      const monday = new Date(cur)
      monday.setDate(cur.getDate() - day)
      if (weeks.has(monday.toISOString().slice(0, 10))) {
        s += 1
        cur.setDate(cur.getDate() - 7)
      } else break
    }
    return s
  }, [gym, now])

  const latestMetric = useMemo(() => {
    const m = (metricData?.metrics ?? []).filter((x) => x.training_readiness != null)
    return m.length ? m[m.length - 1] : null
  }, [metricData])
  const readiness = latestMetric?.training_readiness ?? null
  const hrv = latestMetric?.hrv_status ?? null
  const weightKg = profile?.weight_kg ?? (metricData?.metrics ?? []).find((m) => m.weight_kg != null)?.weight_kg ?? null

  // Period-over-period lifting-readiness delta (mean training_readiness,
  // current window vs the immediately-prior window). REAL data only.
  const readinessDelta = useMemo(() => {
    const all = metricData?.metrics ?? []
    const mean = (from: Date, to: Date | null) => {
      const xs = all
        .filter((m) => {
          if (m.training_readiness == null) return false
          const t = new Date(m.recorded_at)
          return t >= from && (to == null || t < to)
        })
        .map((m) => m.training_readiness as number)
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
    }
    if (!hasPriorWindow) return null
    const cur = mean(cutoff, null)
    const prev = mean(cutoff2, cutoff)
    if (cur == null || prev == null) return null
    return Math.round(cur - prev)
  }, [metricData, cutoff, cutoff2, hasPriorWindow])

  // Real logged sets → strength-science library. Every session's sets whose
  // exercise name resolves to squat/bench/deadlift become a LiftSet; the library
  // then lights up DOTS / e1RM / by-lift / projection. Still null (→ honest
  // empty states) when the user hasn't logged any of the big-three lifts yet.
  const { data: liftSessions } = useSessions(undefined, 200)
  const loggedLiftSets = useMemo<LiftSet[]>(() => {
    const out: LiftSet[] = []
    for (const s of liftSessions ?? []) {
      const date = s.performed_at.slice(0, 10)
      for (const set of s.sets) {
        const lift = liftKindFromName(set.exercise_name)
        if (lift && set.weight_kg > 0 && set.reps > 0) {
          out.push({ lift, weightKg: set.weight_kg, reps: set.reps, date })
        }
      }
    }
    return out
  }, [liftSessions])
  const strength = useMemo(() => computeStrength(loggedLiftSets, weightKg), [loggedLiftSets, weightKg])

  // ── Top summary: period-over-period + range-adaptive session bucketing ─────
  const gran = granularityForDays(days)
  const granTxt = granularityLabel(gran, de)
  const hasPrior = hasPriorWindow && gymPrior.length > 0
  const sessionChartStart = useMemo(() => new Date(Math.max(+cutoff, +start)), [cutoff, start])
  const sessionBuckets = useMemo(
    () => bucketByGranularity(gymCurrent.map((a) => ({ t: +new Date(a.started_at), v: 1 })), sessionChartStart, now, gran, 'sum'),
    [gymCurrent, sessionChartStart, now, gran],
  )
  const freqPct = pctChange(hasPrior ? perWeek : null, hasPrior ? priorPerWeek : null)
  const trendWord = (p: number | null) =>
    p == null ? (de ? 'stabil' : 'steady')
      : p >= 4 ? (de ? `+${Math.round(p)} %` : `up ${Math.round(p)}%`)
      : p <= -4 ? (de ? `−${Math.abs(Math.round(p))} %` : `down ${Math.abs(Math.round(p))}%`)
      : (de ? 'stabil' : 'steady')
  const summaryVerdict = !hasPrior
    ? (de ? 'Keine Vorperiode zum Vergleichen — Basislinie im Aufbau' : 'No prior period to compare — building your baseline')
    : de
      ? `Frequenz ${trendWord(freqPct)} vs. die letzten ${fetchDays} Tage${readinessDelta != null ? ` · Bereitschaft ${readinessDelta >= 0 ? '+' : ''}${readinessDelta}` : ''}`
      : `Frequency ${trendWord(freqPct)} vs the previous ${fetchDays} days${readinessDelta != null ? ` · readiness ${readinessDelta >= 0 ? '+' : ''}${readinessDelta}` : ''}`

  const readinessLabel = readiness == null
    ? { txt: DASH, color: 'var(--color-muted)', soft: 'var(--color-surface-2)' }
    : readiness >= 80
      ? { txt: de ? 'Bereit' : 'Primed', color: C_GOOD, soft: SOFT_GOOD }
      : readiness >= 50
        ? { txt: de ? 'Moderat' : 'Moderate', color: C_AMBER, soft: SOFT_AMBER }
        : { txt: de ? 'Erschöpft' : 'Depleted', color: C_BAD, soft: 'rgba(250,30,85,0.15)' }

  // ---- static coaching content (rendered 1:1) ------------------------------
  const levers = [
    {
      icon: Dumbbell, color: C_DEAD, dots: 3, dotColor: C_DEAD,
      title: de ? 'Posteriore-Kette-Volumen ergänzen' : 'Add posterior-chain volume',
      sub: de ? 'RDLs + Good Mornings, 2×/Woche' : 'RDLs + good mornings, 2×/week',
      gain: de ? '+12 kg Kreuzheben' : '+12 kg deadlift', gainColor: C_DEAD,
      time: de ? '10 Wo' : '10 wk', impact: de ? 'Hoher Impact' : 'High impact',
    },
    {
      icon: TrendingUp, color: C_BENCH, dots: 2, dotColor: C_BENCH,
      title: de ? 'Bank-Sticking-Point angehen' : 'Attack the bench sticking point',
      sub: de ? 'Pausenwiederholungen mittig, 6-Wochen-Block' : 'Pause reps at mid-range, 6 wk block',
      gain: de ? '+7,5 kg Bankdrücken' : '+7.5 kg bench', gainColor: C_BENCH,
      time: de ? '8 Wo' : '8 wk', impact: de ? 'Mittlerer Impact' : 'Medium impact',
    },
    {
      icon: Utensils, color: C_GOOD, dots: 3, dotColor: C_GOOD,
      title: de ? 'Protein auf 1,8 g/kg erhöhen' : 'Raise protein to 1.8 g/kg',
      sub: de ? '+30 g/Tag für Erholung & Volumen' : '+30 g/day for recovery & volume',
      gain: de ? '+ Erholung' : '+ recovery', gainColor: C_GOOD,
      time: de ? 'laufend' : 'ongoing', impact: de ? 'Hoher Impact' : 'High impact',
    },
    {
      icon: Moon, color: C_SQUAT, dots: 3, dotColor: C_SQUAT,
      title: de ? 'Konstant 8 Std schlafen' : 'Sleep 8h consistently',
      sub: de ? 'Größter kostenloser Kraft-Multiplikator' : 'Biggest free strength multiplier',
      gain: de ? '+5–8% Leistung' : '+5–8% output', gainColor: C_SQUAT,
      time: de ? '2 Wo' : '2 wk', impact: de ? 'Hoher Impact' : 'High impact',
    },
    {
      icon: RotateCcw, color: C_AMBER, dots: 2, dotColor: C_AMBER,
      title: de ? 'Deload alle 5 Wochen einplanen' : 'Program a deload every 5th wk',
      sub: de ? 'Durchbricht das Kniebeuge-Plateau' : 'Breaks the squat plateau',
      gain: de ? 'Plateau brechen' : 'break plateau', gainColor: C_AMBER,
      time: de ? 'jetzt' : 'now', impact: de ? 'Mittlerer Impact' : 'Medium impact',
    },
  ]

  const volumeMuscles = [
    { name: de ? 'Quads' : 'Quads' },
    { name: de ? 'Rücken' : 'Back' },
    { name: de ? 'Brust' : 'Chest' },
    { name: de ? 'Posteriore Kette' : 'Posterior chain' },
  ]

  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: 'var(--color-paper)' }}>
      <div className="mx-auto w-full max-w-md px-4 pt-3 pb-28 flex flex-col" style={{ gap: 20 }}>
        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5"
          style={{ fontSize: 12.5, color: 'var(--color-ink-2)', border: '1px solid var(--color-rule)', background: 'transparent' }}
        >
          <ArrowLeft size={15} /> {de ? 'Zurück' : 'Back'}
        </button>

        {/* ===================== HEADER ===================== */}
        <div className="flex flex-col" style={{ gap: 14 }}>
          <div className="flex flex-col" style={{ gap: 2 }}>
            <span className="eyebrow" style={{ fontSize: 12, letterSpacing: 1, color: 'var(--color-muted)' }}>
              {de ? 'FORTSCHRITT · PROGNOSE · POTENZIAL' : 'PROGRESS · PROJECTION · POTENTIAL'}
            </span>
            <span className="num-display" style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-ink)' }}>
              {de ? 'Kraft' : 'Strength'}
            </span>
          </div>
          {/* sport toggle */}
          <div className="flex rounded-full" style={{ background: 'var(--color-surface-2)', padding: 4, gap: 3 }}>
            {[
              { icon: Footprints, label: de ? 'Laufen' : 'Run', to: '/progress/run', active: false },
              { icon: Bike, label: de ? 'Rad' : 'Bike', to: '/progress/bike', active: false },
              { icon: Dumbbell, label: de ? 'Kraft' : 'Lift', to: '/progress/lift', active: true },
            ].map((s) => (
              <button
                key={s.label}
                onClick={() => !s.active && navigate(s.to)}
                className="flex flex-1 items-center justify-center rounded-full"
                style={{
                  gap: 6, padding: '9px 6px',
                  background: s.active ? 'var(--color-accent)' : 'transparent',
                  color: s.active ? 'var(--color-ink)' : 'var(--color-ink-2)',
                }}
              >
                <s.icon size={16} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ===================== RANGE FILTER ===================== */}
        <div className="flex rounded-full" style={{ background: 'var(--color-surface-2)', padding: 4, gap: 3 }}>
          {RANGES.map((r) => (
            <button
              key={r.k}
              onClick={() => setRange(r.k)}
              className="flex flex-1 items-center justify-center rounded-full"
              style={{
                minHeight: 40, padding: '8px 4px', fontSize: 12, fontWeight: 600,
                background: range === r.k ? 'var(--color-accent)' : 'transparent',
                color: range === r.k ? 'var(--color-ink)' : 'var(--color-ink-2)',
              }}
            >
              {r.k}
            </button>
          ))}
        </div>

        {/* ===================== SUMMARY — period-over-period ===================== */}
        <Card soft gap={14}>
          <div className="flex items-start justify-between" style={{ gap: 12 }}>
            <div className="flex flex-col" style={{ gap: 2, minWidth: 0 }}>
              <span className="eyebrow" style={{ fontSize: 11, letterSpacing: 1, color: 'var(--color-accent)' }}>
                {(de ? 'ZUSAMMENFASSUNG' : 'SUMMARY')} · {windowLabel.toUpperCase()}
              </span>
              <span className="num-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1.35 }}>{summaryVerdict}</span>
            </div>
            <div className="rounded-full" style={{ padding: '6px 11px', background: SOFT_ACCENT, flex: 'none' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent)' }}>{de ? granTxt : `${granTxt} view`}</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {[
              { l: de ? 'EINHEITEN' : 'SESSIONS', v: sessionCount > 0 ? String(sessionCount) : DASH, delta: hasPrior ? sessionCount - gymPrior.length : null, unit: '' },
              { l: de ? 'PRO WOCHE' : 'PER WEEK', v: sessionCount > 0 ? `${perWeek}×` : DASH, delta: perWeekDelta, unit: '×' },
              { l: de ? 'BEREITSCHAFT' : 'READINESS', v: readiness != null ? String(Math.round(readiness)) : DASH, delta: readinessDelta, unit: '' },
            ].map((s) => (
              <div key={s.l} className="flex flex-col rounded-[14px]" style={{ gap: 5, padding: 13, background: 'var(--color-surface-2)', minWidth: 0 }}>
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, color: 'var(--color-ink-2)' }}>{s.l}</span>
                <span className="num-display" style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.v}</span>
                {s.delta != null ? (
                  <span className="inline-flex items-center" style={{ gap: 3, fontSize: 11, fontWeight: 700, color: s.delta >= 0 ? C_GOOD : C_BAD, flexWrap: 'wrap', fontVariantNumeric: 'tabular-nums' }}>
                    {s.delta >= 0 ? <ArrowUp size={11} color={C_GOOD} /> : <ArrowDown size={11} color={C_BAD} />}
                    {s.delta >= 0 ? '+' : ''}{s.delta}{s.unit}
                  </span>
                ) : <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{DASH}</span>}
              </div>
            ))}
          </div>
          {sessionBuckets.some((b) => b.value > 0) ? (
            <>
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}>{de ? 'Einheiten' : 'Sessions'}</span>
                <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{de ? `${granTxt} Buckets` : `${granTxt} buckets`}</span>
              </div>
              <HoverBars
                height={84}
                radius={5}
                defaultColor="var(--color-accent)"
                bars={sessionBuckets.map((b, i) => ({
                  value: b.value,
                  valueLabel: `${Math.round(b.value)} ${de ? 'Einh.' : 'sess.'}`,
                  label: b.label,
                  highlight: i === sessionBuckets.length - 1,
                }))}
              />
            </>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{de ? 'Keine Daten im Zeitraum' : 'No data in range'}</span>
          )}
        </Card>

        {/* ===================== HERO — STRENGTH SCORE · DOTS ===================== */}
        <div
          className="rounded-[24px] flex flex-col"
          style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', padding: 22, gap: 18 }}
        >
          <div className="flex items-start justify-between">
            <div className="flex flex-col" style={{ gap: 4 }}>
              <span className="eyebrow" style={{ fontSize: 11, letterSpacing: 1, color: 'var(--color-muted)' }}>
                {de ? 'KRAFTWERT · DOTS' : 'STRENGTH SCORE · DOTS'}
              </span>
              <span className="num-display" style={{ fontSize: 52, fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1 }}>
                {strength ? Math.round(strength.dotsScore) : DASH}
              </span>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)' }}>{unlock}</span>
            </div>
            <div
              className="flex items-center rounded-full"
              style={{ gap: 6, padding: '7px 12px', background: SOFT_ACCENT }}
            >
              <TrendingUp size={15} color="var(--color-accent)" />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-accent)' }}>
                {strength ? (de ? strength.level.label_de : strength.level.label) : DASH}
              </span>
            </div>
          </div>

          {/* Potential vs strength standards — motivating headroom (real when sets logged). */}
          <div className="flex flex-col" style={{ gap: 8 }}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col" style={{ gap: 2, minWidth: 0 }}>
                <span className="num-display" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink)' }}>
                  {strength?.potential
                    ? `${de ? strength.potential.level_de : strength.potential.level} · ${strength.squatRatio.toFixed(2)}× ${de ? 'KG-Kniebeuge' : 'BW squat'}`
                    : (de ? 'Kraftpotenzial' : 'Strength potential')}
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                  {strength?.potential
                    ? (de
                        ? `Nächstes Ziel → ${strength.potential.nextValue.toFixed(2)}× Körpergewicht`
                        : `Next milestone → ${strength.potential.nextValue.toFixed(2)}× bodyweight`)
                    : unlock}
                </span>
              </div>
              {strength?.potential && (
                <span className="num-display" style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-accent)', flex: 'none' }}>
                  {strength.potential.pctToTarget}%
                </span>
              )}
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--color-surface-3)', overflow: 'hidden' }}>
              {strength?.potential && (
                <div style={{ height: '100%', width: `${strength.potential.pctToTarget}%`, borderRadius: 4, background: 'var(--color-accent)' }} />
              )}
            </div>
            <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
              {strength?.potential
                ? (de
                    ? `Fortschritt zu fortgeschrittener Kraft (~${strength.potential.targetValue.toFixed(2)}×) · echter Spielraum`
                    : `Progress toward advanced strength (~${strength.potential.targetValue.toFixed(2)}×) · real room to grow`)
                : unlock}
            </span>
          </div>

          <div style={{ height: 1, background: 'var(--color-rule)' }} />

          {/* breakdown */}
          <div className="flex items-end justify-between">
            {[
              { l: de ? 'KNIEBEUGE' : 'SQUAT', v: strength ? Math.round(strength.squat) : DASH, c: C_SQUAT, big: 20 },
              { l: de ? 'BANK' : 'BENCH', v: strength ? Math.round(strength.bench) : DASH, c: C_BENCH, big: 20 },
              { l: de ? 'KREUZHEBEN' : 'DEADLIFT', v: strength ? Math.round(strength.dead) : DASH, c: C_DEAD, big: 20 },
              { l: de ? 'GESAMT' : 'TOTAL', v: strength ? Math.round(strength.total) : DASH, c: 'var(--color-ink)', big: 22 },
            ].map((b) => (
              <div key={b.l} className="flex flex-col" style={{ gap: 3 }}>
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.5, color: 'var(--color-muted)' }}>{b.l}</span>
                <div className="flex items-end" style={{ gap: 2 }}>
                  <span className="num-display" style={{ fontSize: b.big, fontWeight: 700, color: b.c }}>{b.v}</span>
                  <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)', paddingBottom: 2 }}>kg</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ===================== SECTION: MY ROUTINES (strength builder) ===================== */}
        <RoutinesManager de={de} />

        {/* ===================== SECTION: PROGRESS ===================== */}
        <SectionHeader color={C_GOOD} title={de ? 'Fortschritt' : 'Progress'} sub={de ? 'Wie weit du gekommen bist' : "How far you've come"} />

        {/* Total e1RM */}
        <Card gap={16}>
          <div className="flex items-center justify-between">
            <CardTitle title={de ? 'Gesamt-e1RM' : 'Total e1RM'} sub={de ? 'Kniebeuge + Bank + Kreuzheben' : 'Squat + Bench + Deadlift'} />
            <div className="flex items-center rounded-full" style={{ gap: 5, padding: '5px 10px', background: SOFT_GOOD }}>
              <TrendingUp size={14} color={C_GOOD} />
              <span style={{ fontSize: 12, fontWeight: 700, color: C_GOOD }}>{DASH}</span>
            </div>
          </div>
          <EmptyChart note={unlock} />
        </Card>

        {/* By Lift */}
        <Card gap={14}>
          <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Nach Übung' : 'By Lift'}</span>
          {[
            { name: de ? 'Kniebeuge' : 'Squat', c: C_SQUAT },
            { name: de ? 'Bank' : 'Bench', c: C_BENCH },
            { name: de ? 'Kreuzheben' : 'Deadlift', c: C_DEAD },
          ].map((row) => (
            <div key={row.name} className="flex items-center" style={{ gap: 12 }}>
              <div className="flex flex-col" style={{ gap: 2, width: 96 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>{row.name}</span>
                <div className="flex items-center" style={{ gap: 2 }}>
                  <ArrowUp size={11} color="var(--color-muted)" />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{DASH}</span>
                </div>
              </div>
              <div className="flex-1" style={{ height: 4, borderRadius: 2, background: 'var(--color-surface-3)' }} />
              <div className="flex items-end justify-end" style={{ gap: 2, width: 64 }}>
                <span className="num-display" style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-ink)' }}>{DASH}</span>
                <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)', paddingBottom: 2 }}>kg</span>
              </div>
            </div>
          ))}
        </Card>

        {/* Recent PRs */}
        <Card gap={14}>
          <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Neueste PRs' : 'Recent PRs'}</span>
          <div className="flex items-center" style={{ gap: 12 }}>
            <div className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 10, background: '#000000' }}>
              <Trophy size={18} color="var(--color-muted)" />
            </div>
            <div className="flex flex-col flex-1" style={{ gap: 1 }}>
              <span className="num-display" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink-2)' }}>{de ? 'Noch keine PRs' : 'No PRs yet'}</span>
              <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{unlock}</span>
            </div>
          </div>
        </Card>

        {/* ===================== SECTION: PROJECTION ===================== */}
        <SectionHeader color={C_SQUAT} title={de ? 'Prognose' : 'Projection'} sub={de ? 'Wohin dich dein Tempo führt' : "Where you're headed at this rate"} />

        {/* Total Projection */}
        <Card gap={16}>
          <div className="flex items-center justify-between">
            <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Gesamt-Prognose' : 'Total Projection'}</span>
            <div className="flex items-center" style={{ gap: 10 }}>
              <div className="flex items-center" style={{ gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-surface-3)' }} />
                <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'ist' : 'actual'}</span>
              </div>
              <div className="flex items-center" style={{ gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-accent)' }} />
                <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'prognose' : 'projected'}</span>
              </div>
            </div>
          </div>
          <EmptyChart note={unlock} />
          <div className="flex items-center rounded-[14px]" style={{ gap: 10, padding: 13, background: SOFT_ACCENT }}>
            <Flag size={18} color="var(--color-accent)" />
            <span className="flex-1" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink-2)' }}>{unlock}</span>
            <span className="num-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-accent)' }}>{DASH}</span>
          </div>
        </Card>

        {/* Projected 1RM */}
        <Card gap={12}>
          <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Prognostiziertes 1RM' : 'Projected 1RM'}</span>
          <div className="flex" style={{ gap: 10 }}>
            {[
              { l: de ? 'KNIEBEUGE' : 'SQUAT', c: C_SQUAT },
              { l: de ? 'BANK' : 'BENCH', c: C_BENCH },
              { l: de ? 'KREUZHEBEN' : 'DEADLIFT', c: C_DEAD },
            ].map((b) => (
              <div key={b.l} className="flex flex-col flex-1 rounded-[14px]" style={{ gap: 5, padding: 13, background: 'var(--color-surface-2)' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{b.l}</span>
                <div className="flex items-end" style={{ gap: 3 }}>
                  <span className="num-display" style={{ fontSize: 22, fontWeight: 700, color: b.c }}>{DASH}</span>
                  <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)', paddingBottom: 2 }}>kg</span>
                </div>
                <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'jetzt —' : 'now —'}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Strength Level Trajectory */}
        <Card gap={14}>
          <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Kraftniveau-Verlauf' : 'Strength Level Trajectory'}</span>
          <div className="flex items-start justify-between">
            {[
              { icon: Check, name: de ? 'Anfänger' : 'Novice' },
              { icon: Zap, name: de ? 'Fortgeschr.' : 'Intermediate' },
              { icon: Lock, name: de ? 'Weit fortg.' : 'Advanced' },
              { icon: Medal, name: de ? 'Elite' : 'Elite' },
            ].map((st) => (
              <div key={st.name} className="flex flex-col flex-1 items-center" style={{ gap: 6 }}>
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{ width: 36, height: 36, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}
                >
                  <st.icon size={18} color="var(--color-muted)" />
                </div>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-ink-2)', textAlign: 'center' }}>{st.name}</span>
                <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--color-muted)', textAlign: 'center' }}>{DASH}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* ===================== SECTION: POTENTIAL ===================== */}
        <SectionHeader color={C_DEAD} title={de ? 'Potenzial' : 'Potential'} sub={de ? 'Ungenutztes Aufwärtspotenzial — wenn du optimierst' : 'Untapped upside — if you optimize'} />

        {levers.map((lv) => (
          <Card key={lv.title} gap={12} pad={16}>
            <div className="flex items-center" style={{ gap: 12 }}>
              <div className="flex items-center justify-center" style={{ width: 40, height: 40, borderRadius: 12, background: '#000000' }}>
                <lv.icon size={20} color={lv.color} />
              </div>
              <div className="flex flex-col flex-1" style={{ gap: 2 }}>
                <span className="num-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{lv.title}</span>
                <span style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>{lv.sub}</span>
              </div>
              <div className="flex flex-col items-end" style={{ gap: 2 }}>
                <div className="rounded-full" style={{ padding: '5px 10px', background: '#000000' }}>
                  <span className="num-display" style={{ fontSize: 13, fontWeight: 700, color: lv.gainColor }}>{lv.gain}</span>
                </div>
                <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{lv.time}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center" style={{ gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{lv.impact}</span>
                <div className="flex items-center" style={{ gap: 3 }}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i < lv.dots ? lv.dotColor : 'var(--color-surface-3)' }} />
                  ))}
                </div>
              </div>
              <button
                className="flex items-center rounded-full"
                style={{ gap: 5, padding: '7px 14px', border: `1px solid ${lv.color}`, background: 'transparent' }}
              >
                <Plus size={14} color={lv.color} />
                <span className="num-display" style={{ fontSize: 12, fontWeight: 700, color: lv.color }}>{de ? 'Anwenden' : 'Apply'}</span>
              </button>
            </div>
          </Card>
        ))}

        {/* Potential summary */}
        <Card soft gap={14}>
          <div className="flex items-center" style={{ gap: 12 }}>
            <div className="flex items-center justify-center rounded-full" style={{ width: 40, height: 40, background: 'var(--color-accent)' }}>
              <Rocket size={22} color="var(--color-ink)" />
            </div>
            <div className="flex flex-col flex-1" style={{ gap: 1 }}>
              <span className="num-display" style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Volles Potenzial freigeschaltet' : 'Full potential unlocked'}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-accent)' }}>{de ? 'Alle Hebel oben kombinieren' : 'Stack every lever above'}</span>
            </div>
          </div>
          <div className="flex items-center justify-between" style={{ paddingTop: 4 }}>
            {[
              { v: DASH, l: de ? 'prognost. Gesamt' : 'projected total' },
              { v: DASH, l: de ? 'DOTS-Wert' : 'DOTS score' },
              { v: DASH, l: de ? 'Kraftniveau' : 'strength level' },
            ].map((s) => (
              <div key={s.l} className="flex flex-col" style={{ gap: 2 }}>
                <span className="num-display" style={{ fontSize: 19, fontWeight: 700, color: 'var(--color-ink)' }}>{s.v}</span>
                <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{s.l}</span>
              </div>
            ))}
          </div>
          <button className="flex items-center justify-center rounded-full" style={{ gap: 8, padding: 14, background: 'var(--color-accent)' }}>
            <Zap size={18} color="var(--color-ink)" />
            <span className="num-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Optimierungsplan erstellen' : 'Build my optimization plan'}</span>
          </button>
        </Card>

        {/* ===================== SECTION: PRO LAB (pro mode only) ===================== */}
        {mode === 'pro' && (
          <>
            <SectionHeader color={C_BENCH} title={de ? 'Pro-Labor' : 'Pro Lab'} sub={de ? 'Die Metriken, die Elite-Lifter besessen verfolgen' : 'The metrics elite lifters obsess over'} />

            {/* Bar Speed · VBT */}
            <Card gap={16}>
              <div className="flex items-center justify-between">
                <CardTitle title={de ? 'Balkengeschw. · VBT' : 'Bar Speed · VBT'} sub={de ? 'Geschwindigkeitsbasierte Autoregulation' : 'Velocity-based autoregulation'} />
                <div className="rounded-full" style={{ padding: '5px 10px', background: '#000000' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C_BENCH }}>{de ? 'e1RM live' : 'e1RM live'}</span>
                </div>
              </div>
              {[
                { name: de ? 'Kniebeuge' : 'Squat' },
                { name: de ? 'Bank' : 'Bench' },
                { name: de ? 'Kreuzheben' : 'Deadlift' },
              ].map((row) => (
                <div key={row.name} className="flex items-center" style={{ gap: 12 }}>
                  <div className="flex flex-col" style={{ gap: 1, width: 78 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>{row.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>@ {DASH}</span>
                  </div>
                  <div className="flex-1" style={{ height: 8, borderRadius: 4, background: 'var(--color-surface-3)' }} />
                  <div className="flex items-end justify-end" style={{ gap: 3, width: 78 }}>
                    <span className="num-display" style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-ink)' }}>{DASH}</span>
                    <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)', paddingBottom: 2 }}>m/s</span>
                  </div>
                </div>
              ))}
              <div style={{ height: 1, background: 'var(--color-rule)' }} />
              <span style={{ fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.4 }}>
                {de
                  ? 'Geschwindigkeitsverlust-Cap 20% → Satz beenden. e1RM automatisch aus dem Last-Geschwindigkeits-Profil geschätzt.'
                  : 'Velocity-loss cap 20% → end the set. e1RM auto-estimated from the load–velocity profile.'}
              </span>
            </Card>

            {/* Lifting Readiness — REAL (training readiness) */}
            <Card gap={14}>
              <div className="flex items-start justify-between">
                <div className="flex flex-col" style={{ gap: 3 }}>
                  <div className="flex items-center" style={{ gap: 8 }}>
                    <span className="eyebrow" style={{ fontSize: 11, letterSpacing: 0.5, color: 'var(--color-muted)' }}>{de ? 'HEBE-BEREITSCHAFT' : 'LIFTING READINESS'}</span>
                    <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>· {windowLabel}</span>
                  </div>
                  <div className="flex items-end" style={{ gap: 6 }}>
                    <span className="num-display" style={{ fontSize: 38, fontWeight: 700, color: readinessLabel.color, lineHeight: 1 }}>
                      {readiness != null ? Math.round(readiness) : DASH}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-muted)', paddingBottom: 6 }}>%</span>
                  </div>
                  {readinessDelta != null && (
                    <DeltaChip delta={readinessDelta} sub={priorSub} />
                  )}
                </div>
                <div className="flex items-center rounded-full" style={{ gap: 5, padding: '6px 11px', background: readinessLabel.soft }}>
                  <Zap size={14} color={readinessLabel.color} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: readinessLabel.color }}>{readinessLabel.txt}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                {[
                  { v: DASH, l: de ? 'Balkengeschw. vs Basis' : 'bar speed vs base', c: C_GOOD },
                  { v: DASH, l: de ? 'Griffkraft' : 'grip strength', c: 'var(--color-ink)' },
                  { v: hrv != null ? String(Math.round(hrv)) : DASH, l: 'HRV', c: C_SQUAT },
                ].map((s) => (
                  <div key={s.l} className="flex flex-col" style={{ gap: 2 }}>
                    <span className="num-display" style={{ fontSize: 16, fontWeight: 700, color: s.c }}>{s.v}</span>
                    <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{s.l}</span>
                  </div>
                ))}
              </div>
              <span style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
                {readiness == null
                  ? unlock
                  : readiness >= 80
                    ? (de ? 'Bereitschaft hoch — grünes Licht für schwere Top-Sätze heute.' : 'Readiness is high — green light to push top sets today.')
                    : readiness >= 50
                      ? (de ? 'Moderate Bereitschaft — halte das geplante Volumen, vermeide neue PRs.' : 'Moderate readiness — hold planned volume, skip new PR attempts.')
                      : (de ? 'Niedrige Bereitschaft — reduziere Last oder mach einen leichten Tag.' : 'Low readiness — pull back load or take a light day.')}
              </span>
            </Card>

            {/* Volume Landmarks */}
            <Card gap={14}>
              <CardTitle title={de ? 'Volumen-Landmarken' : 'Volume Landmarks'} sub={de ? 'Wochensätze vs MEV · MAV · MRV' : 'Weekly sets vs MEV · MAV · MRV'} />
              {volumeMuscles.map((m) => (
                <div key={m.name} className="flex items-center" style={{ gap: 10 }}>
                  <div className="flex flex-col" style={{ gap: 2, width: 84 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink)' }}>{m.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)' }}>{DASH}</span>
                  </div>
                  {/* reference track with MEV–MRV green band (science reference; no user marker without set data) */}
                  <div className="relative flex-1" style={{ height: 16 }}>
                    <div style={{ position: 'absolute', top: 6, left: 0, right: 0, height: 4, borderRadius: 2, background: 'var(--color-surface-3)' }} />
                    <div style={{ position: 'absolute', top: 5, left: '50%', width: '25%', height: 6, borderRadius: 3, background: SOFT_GOOD }} />
                  </div>
                  <div className="flex items-end justify-end" style={{ gap: 2, width: 44 }}>
                    <span className="num-display" style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-ink)' }}>{DASH}</span>
                    <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--color-muted)', paddingBottom: 2 }}>{de ? 'Sätze' : 'sets'}</span>
                  </div>
                </div>
              ))}
              <div className="flex items-center rounded-[12px]" style={{ gap: 8, padding: 12, background: SOFT_ACCENT }}>
                <Lightbulb size={15} color="var(--color-accent)" />
                <span className="flex-1" style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink)', lineHeight: 1.35 }}>{unlock}</span>
              </div>
            </Card>

            {/* Force & Symmetry */}
            <Card gap={14}>
              <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Kraft & Symmetrie' : 'Force & Symmetry'}</span>
              <div className="flex" style={{ gap: 10 }}>
                {[
                  { unit: '%', l: de ? 'L/R-Balance' : 'L/R balance', c: C_AMBER },
                  { unit: 'kN/s', l: de ? 'Kraftentw. (RFD)' : 'force dev (RFD)', c: C_SQUAT },
                  { unit: 'kN', l: de ? 'Spitzenkraft' : 'peak force', c: 'var(--color-ink)' },
                ].map((s) => (
                  <div key={s.l} className="flex flex-col flex-1 rounded-[14px]" style={{ gap: 4, padding: 13, background: 'var(--color-surface-2)' }}>
                    <div className="flex items-end" style={{ gap: 2 }}>
                      <span className="num-display" style={{ fontSize: 20, fontWeight: 700, color: s.c }}>{DASH}</span>
                      <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--color-muted)', paddingBottom: 2 }}>{s.unit}</span>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{s.l}</span>
                  </div>
                ))}
              </div>
              <span style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>{unlock}</span>
            </Card>

            {/* Body Composition */}
            <Card gap={14}>
              <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Körperzusammensetzung' : 'Body Composition'}</span>
              <div className="flex" style={{ gap: 10 }}>
                {[
                  { unit: 'kg', l: de ? 'Magermasse' : 'lean mass', c: 'var(--color-ink)' },
                  { unit: '%', l: de ? 'Körperfett' : 'body fat', c: C_BENCH },
                  { unit: '', l: de ? 'gesamt / mager' : 'total / lean', c: C_DEAD },
                  { unit: '', l: 'DOTS', c: C_GOOD },
                ].map((s) => (
                  <div key={s.l} className="flex flex-col flex-1 items-center rounded-[14px]" style={{ gap: 4, padding: '13px 8px', background: 'var(--color-surface-2)' }}>
                    <div className="flex items-end" style={{ gap: 2 }}>
                      <span className="num-display" style={{ fontSize: 19, fontWeight: 700, color: s.c }}>{DASH}</span>
                      {s.unit && <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--color-muted)', paddingBottom: 2 }}>{s.unit}</span>}
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--color-muted)', textAlign: 'center' }}>{s.l}</span>
                  </div>
                ))}
              </div>
              <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                {weightKg != null
                  ? (de ? `Körpergewicht ${Math.round(weightKg)} kg — Zusammensetzung & DOTS erfordern protokollierte Sätze.` : `Bodyweight ${Math.round(weightKg)} kg — composition & DOTS need logged sets.`)
                  : unlock}
              </span>
            </Card>
          </>
        )}

        {/* ===================== SECTION: AMATEUR MODE ===================== */}
        <SectionHeader color={C_GOOD} title={de ? 'Amateur-Modus' : 'Amateur mode'} sub={de ? 'Die Zahlen verständlich machen' : 'Make the numbers make sense'} />

        {/* Simple / Pro view toggle */}
        <div className="flex rounded-full" style={{ background: 'var(--color-surface-2)', padding: 4, gap: 3 }}>
          {[
            { k: 'simple' as const, icon: Smile, label: de ? 'Einfach' : 'Simple' },
            { k: 'pro' as const, icon: FlaskConical, label: de ? 'Pro' : 'Pro' },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => setMode(t.k)}
              className="flex flex-1 items-center justify-center rounded-full"
              style={{
                gap: 6, padding: '10px 6px',
                background: mode === t.k ? 'var(--color-accent)' : 'transparent',
                color: mode === t.k ? 'var(--color-ink)' : 'var(--color-ink-2)',
              }}
            >
              <t.icon size={16} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Simple-mode content: coach-explains + simple scorecard */}
        {mode === 'simple' && (
          <>
            {/* Coach explains — Bar speed (VBT) */}
            <Card gap={10} pad={16}>
              <div className="flex items-center" style={{ gap: 11 }}>
                <div className="flex items-center justify-center" style={{ width: 38, height: 38, borderRadius: 11, background: SOFT_GOOD }}>
                  <Gauge size={20} color={C_GOOD} />
                </div>
                <div className="flex flex-col flex-1" style={{ gap: 1 }}>
                  <span className="eyebrow" style={{ fontSize: 10, letterSpacing: 1, color: C_GOOD }}>{de ? 'COACH ERKLÄRT' : 'COACH EXPLAINS'}</span>
                  <span className="num-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Balkengeschwindigkeit (VBT)' : 'Bar speed (VBT)'}</span>
                </div>
              </div>
              <span style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>
                {de
                  ? 'Bewegt sich die Stange langsamer als sonst, bist du müde — geh leichter. Schneller als normal? Leg Gewicht drauf. Die App entscheidet für dich, kein Rätselraten.'
                  : "If the bar moves slower than usual, you're tired — go lighter. Faster than normal? Add weight. The app decides for you, no guesswork."}
              </span>
            </Card>

            {/* Coach explains — Volume landmarks */}
            <Card gap={10} pad={16}>
              <div className="flex items-center" style={{ gap: 11 }}>
                <div className="flex items-center justify-center" style={{ width: 38, height: 38, borderRadius: 11, background: SOFT_GOOD }}>
                  <BarChart3 size={20} color={C_GOOD} />
                </div>
                <div className="flex flex-col flex-1" style={{ gap: 1 }}>
                  <span className="eyebrow" style={{ fontSize: 10, letterSpacing: 1, color: C_GOOD }}>{de ? 'COACH ERKLÄRT' : 'COACH EXPLAINS'}</span>
                  <span className="num-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Volumen-Landmarken' : 'Volume landmarks'}</span>
                </div>
              </div>
              <span style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>
                {de
                  ? 'MEV / MAV / MRV = das Minimum, der Sweet-Spot und die meisten Wochensätze bevor du übertrainierst. Bleib einfach im grünen Band.'
                  : 'MEV / MAV / MRV = the minimum, the sweet-spot, and the most weekly sets before you overtrain. Just stay in the green band.'}
              </span>
            </Card>

            {/* Simple scorecard */}
            <Card gap={14}>
              <CardTitle title={de ? 'Deine einfache Scorecard' : 'Your simple scorecard'} sub={`${de ? 'Die 3 Dinge, die gerade am meisten zählen' : 'The 3 things that matter most right now'} · ${windowLabel}`} />

              {/* Consistency — REAL (gym frequency + streak) */}
              <div className="flex items-center" style={{ gap: 12 }}>
                <div className="flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 10, background: '#000000' }}>
                  <CalendarCheck size={18} color={C_GOOD} />
                </div>
                <div className="flex flex-col flex-1" style={{ gap: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Konstanz' : 'Consistency'}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-ink-2)' }}>
                    {sessionCount === 0
                      ? (de ? 'Keine Daten im Zeitraum' : 'No data in range')
                      : streak > 0 ? `${streak}${de ? '-Wochen-Serie' : '-week streak'} 🔥` : (de ? 'Serie starten' : 'Start a streak')}
                  </span>
                </div>
                <div className="flex flex-col items-end" style={{ gap: 3 }}>
                  <span className="num-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>
                    {sessionCount > 0 ? `${perWeek}× / ${de ? 'Woche' : 'week'}` : DASH}
                  </span>
                  {perWeekDelta != null && (
                    <DeltaChip delta={perWeekDelta} unit="×" sub={priorSub} />
                  )}
                </div>
              </div>

              {/* Effort balance — needs load data */}
              <div className="flex items-center" style={{ gap: 12 }}>
                <div className="flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 10, background: '#000000' }}>
                  <Scale size={18} color={C_SQUAT} />
                </div>
                <div className="flex flex-col flex-1" style={{ gap: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Belastungs-Balance' : 'Effort balance'}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-ink-2)' }}>{de ? 'schwer vs leicht' : 'heavy vs light'}</span>
                </div>
                <span className="num-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{DASH}</span>
              </div>

              {/* Next PB — needs lift data */}
              <div className="flex items-center" style={{ gap: 12 }}>
                <div className="flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 10, background: '#000000' }}>
                  <Flag size={18} color={C_DEAD} />
                </div>
                <div className="flex flex-col flex-1" style={{ gap: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Nächster PB' : 'Next PB'}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-ink-2)' }}>{unlock}</span>
                </div>
                <span className="num-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{DASH}</span>
              </div>

              <div style={{ height: 1, background: 'var(--color-rule)' }} />

              {/* Peer percentile — needs DOTS */}
              <div className="flex flex-col" style={{ gap: 8 }}>
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)' }}>{de ? 'Stärker als die meisten deiner Größe' : 'Stronger than most lifters your size'}</span>
                  <span className="num-display" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-accent)' }}>{DASH}</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: 'var(--color-surface-3)' }} />
              </div>
            </Card>
          </>
        )}
      </div>
      <MobileBottomNav />
    </div>
  )
}
