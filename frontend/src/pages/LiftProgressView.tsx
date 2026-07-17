import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Footprints, Bike, Dumbbell, TrendingUp, ArrowUp, ArrowDown, Trophy, Flag,
  Check, Zap, Lock, Medal,
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
 * (total e1RM / by-lift / recent PRs), and PROJECTION (forecast / projected
 * 1RM / level trajectory).
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
const C_BAD = 'var(--color-move)' // #FA1E55

const SOFT_ACCENT = 'var(--color-accent-soft)' // #FF5A3C26
const SOFT_GOOD = 'rgba(22,224,138,0.15)'

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

// ---------------------------------------------------------------------------
export default function LiftProgressView() {
  const navigate = useNavigate()
  const { locale } = useLocale()
  const de = locale === 'de'
  const unlock = de ? 'Krafteinheiten mit Sätzen & Gewichten protokollieren' : 'Log sets & weights to unlock'

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

  const latestMetric = useMemo(() => {
    const m = (metricData?.metrics ?? []).filter((x) => x.training_readiness != null)
    return m.length ? m[m.length - 1] : null
  }, [metricData])
  const readiness = latestMetric?.training_readiness ?? null
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
              {de ? 'FORTSCHRITT · PROGNOSE' : 'PROGRESS · PROJECTION'}
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

      </div>
      <MobileBottomNav />
    </div>
  )
}
