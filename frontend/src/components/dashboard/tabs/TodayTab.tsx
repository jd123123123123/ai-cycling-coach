/**
 * TodayTab — rebuilt 1:1 from pencil-new.pen "Screen · Today" (OwSbv).
 * Card order matches the .pen exactly: Greeting header (+avatar) → Race chip →
 * Recovery card (ring + 3 sub-scores) → Workout card (coral, 3-stat + Start) →
 * Load card (CTL/ATL/TSB) → Activity card (rings + legend) → Metrics row
 * (Resting HR / HRV / Strain) → Streak card (weekday status dots).
 * Every value is real Garmin/backend data; no extra cards.
 */
import { useMemo, useState } from 'react'
import { subDays, format, startOfWeek, addDays } from 'date-fns'
import { Link } from 'react-router-dom'
import { Flag, Heart, Activity, Zap, Target, Play, ListChecks, ChevronRight, ChevronDown, TrendingUp, TrendingDown, Flame, Check, Moon, Sparkles, Trophy } from 'lucide-react'
import type { Adaptations, PostRideReview, CompliancePair, RideGrade } from '../../../api/coach'
import { useCoachBrief } from '../../../hooks/useCoachBrief'
import { useDailyMetrics } from '../../../hooks/useDailyMetrics'
import { useTodaySnapshot } from '../../../hooks/useTodaySnapshot'
import { usePMC } from '../../../hooks/usePMC'
import { useActivitiesRange } from '../../../hooks/useActivitiesRange'
import { useGoalTrajectory } from '../../../hooks/useGoalTrajectory'
import { computeReadiness, readinessTier } from '../../../utils/metrics'
import ScoreRing from '../../ui/ScoreRing'
import ActivityRings from '../../ui/ActivityRings'
import { useLocale } from '../../../contexts/LocaleContext'

const CARD = 'rounded-[24px] p-5'
const cardStyle = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const

function readinessColor(score: number | null): string {
  if (score == null) return 'var(--color-muted)'
  if (score >= 66) return 'var(--color-recovery)'
  if (score >= 34) return 'var(--color-amber)'
  return 'var(--color-move)'
}

function SubScore({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-1">
      <span className="num-display" style={{ fontSize: 20, color: color ?? 'var(--color-ink)' }}>{value}</span>
      <span className="eyebrow" style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-muted)' }}>{label}</span>
    </div>
  )
}

export default function TodayTab() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const today = useMemo(() => new Date(), [])
  const { data: brief } = useCoachBrief()
  const { data: metricsResp } = useDailyMetrics(useMemo(() => subDays(today, 30), [today]), today)
  const { data: snapshot } = useTodaySnapshot()
  const { data: pmc } = usePMC(90)
  const { data: acts } = useActivitiesRange(useMemo(() => subDays(today, 8), [today]), today)
  const { data: trajectory } = useGoalTrajectory()

  const metrics = metricsResp?.metrics ?? []
  const latest = [...metrics].reverse().find((m) => m.hrv_status != null || m.resting_hr != null || m.sleep_score != null) ?? null
  const evidence = (brief?.evidence as Record<string, unknown> | undefined) ?? {}
  const readiness = evidence.readiness as Record<string, unknown> | undefined
  const score = (readiness?.score as number | null | undefined)
    ?? computeReadiness(latest?.hrv_status ?? null, latest?.body_battery ?? null, latest?.sleep_score ?? null)
  const rColor = readinessColor(score ?? null)
  const tier = readinessTier(score ?? null)

  const athlete = evidence.athlete as Record<string, unknown> | undefined
  const goalName = athlete?.goal_target as string | undefined
  const daysToGoal = athlete?.days_to_goal as number | undefined
  const athleteName = (athlete?.name as string | undefined)?.split(' ')[0]

  const pmcBio = evidence.biometrics as Record<string, unknown> | undefined
  const hrv = pmcBio?.hrv as Record<string, unknown> | undefined
  const hrvDelta = hrv?.delta_pct as number | null | undefined
  const pmcEv = evidence.pmc as Record<string, unknown> | undefined
  const tsb = (pmcEv?.tsb as number | null | undefined) ?? pmc?.entries?.at(-1)?.tsb ?? null
  const sleepScore = latest?.sleep_score ?? null
  const restingHr = latest?.resting_hr ?? null
  const hrvNow = snapshot?.hrv_overnight_avg ?? latest?.hrv_status ?? null

  const pmcLatest = pmc?.entries?.at(-1)
  const pmcWeek = pmc?.entries && pmc.entries.length >= 8 ? pmc.entries[pmc.entries.length - 8] : pmc?.entries?.[0]
  const ctl = pmcLatest?.ctl ?? null
  const atl = pmcLatest?.atl ?? null
  const dCtl = pmcLatest && pmcWeek ? Math.round(pmcLatest.ctl - pmcWeek.ctl) : null

  // Mini-PMC trend for the Training Load card: CTL (fitness) area + ATL (fatigue)
  // line over the last ~6 weeks, so the numbers get a shape underneath them.
  const loadTrend = useMemo(() => {
    const rows = (pmc?.entries ?? []).slice(-42)
    if (rows.length < 2) return null
    const W = 300, H = 60, pad = 4
    const max = Math.max(1, ...rows.map((r) => Math.max(r.ctl, r.atl)))
    const x = (i: number) => pad + (i / (rows.length - 1)) * (W - 2 * pad)
    const y = (v: number) => H - pad - (v / max) * (H - 2 * pad)
    const line = (key: 'ctl' | 'atl') =>
      rows.map((r, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(r[key]).toFixed(1)}`).join(' ')
    const ctlLine = line('ctl')
    const ctlArea = `${ctlLine} L${x(rows.length - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`
    return { W, H, ctlLine, ctlArea, atlLine: line('atl') }
  }, [pmc])

  const workout = brief?.prescribed_workout
  const review = brief?.post_ride_review ?? null
  const adaptations = (brief as { adaptations?: Adaptations | null } | undefined)?.adaptations ?? null
  const [whyOpen, setWhyOpen] = useState(false)
  const wBlocks = workout?.blocks ?? []
  const wBlockSummary = wBlocks.length > 0
    ? wBlocks.slice(0, 5).map((b) => b.name).filter(Boolean).join(' → ')
    : null

  // Workout intensity zone, derived from real prescribed TSS + duration (IF).
  const wIntensity = useMemo(() => {
    if (!workout) return null
    const durHr = (workout.duration_minutes ?? 0) / 60
    if (durHr <= 0 || workout.predicted_tss == null) return null
    const iff = Math.sqrt(workout.predicted_tss / (durHr * 100))
    if (iff < 0.75) return { z: 'Z2', t: de ? 'Grundlage' : 'Endurance' }
    if (iff < 0.85) return { z: 'Z3', t: 'Tempo' }
    if (iff < 0.95) return { z: 'Z4', t: de ? 'Schwelle' : 'Threshold' }
    return { z: 'Z5', t: 'VO₂' }
  }, [workout, de])

  // Today's training snapshot — real activity channels only (no steps).
  const todayKey = format(today, 'yyyy-MM-dd')
  const todayActs = (acts?.activities ?? []).filter((a) => (a.started_at ?? a.date ?? '').slice(0, 10) === todayKey)
  const moveLoad = Math.round(todayActs.reduce((s, a) => s + (a.tss ?? 0), 0))
  const exMin = Math.round(todayActs.reduce((s, a) => s + (a.duration_seconds ?? 0) / 60, 0))
  const kcalToday = Math.round(todayActs.reduce((s, a) => s + (a.calories ?? 0), 0))
  const hasTss = todayActs.some((a) => a.tss != null)
  // Duration-weighted average power across today's power-equipped sessions.
  const powerActs = todayActs.filter((a) => a.average_power != null && a.duration_seconds)
  const avgPower = powerActs.length
    ? Math.round(
        powerActs.reduce((s, a) => s + a.average_power! * a.duration_seconds!, 0) /
          powerActs.reduce((s, a) => s + a.duration_seconds!, 0),
      )
    : null

  // Daily training-load target: meso plan (weekly/7) → today's prescribed TSS → default.
  const dailyTssTarget = Math.max(
    60,
    Math.round(
      trajectory?.weekly_tss_required && trajectory.weekly_tss_required > 0
        ? trajectory.weekly_tss_required / 7
        : workout?.predicted_tss ?? 120,
    ),
  )

  // Ring 1 — Training Load, or Sessions on a pure-strength day (TSS null).
  const ring1 = hasTss || moveLoad > 0
    ? { value: moveLoad, goal: dailyTssTarget, color: 'var(--color-move)', name: de ? 'Last' : 'Load', unit: 'TSS', display: `${moveLoad}` }
    : { value: todayActs.length, goal: 1, color: 'var(--color-move)', name: de ? 'Einheiten' : 'Sessions', unit: '', display: `${todayActs.length}` }
  // Ring 2 — Active moving time vs a solid ~90 min day.
  const ring2 = { value: exMin, goal: 90, color: 'var(--color-exercise)', name: de ? 'Aktiv' : 'Active', unit: 'min', display: `${exMin}` }
  // Ring 3 — Energy burned (real kcal); fall back to avg power when calories are absent.
  const ring3 = kcalToday > 0
    ? { value: kcalToday, goal: 800, color: 'var(--color-stand)', name: de ? 'Energie' : 'Energy', unit: 'kcal', display: kcalToday.toLocaleString(de ? 'de' : 'en') }
    : avgPower != null
      ? { value: avgPower, goal: 250, color: 'var(--color-stand)', name: de ? 'Ø Leistung' : 'Avg power', unit: 'W', display: `${avgPower}` }
      : { value: 0, goal: 800, color: 'var(--color-stand)', name: de ? 'Energie' : 'Energy', unit: 'kcal', display: '—' }

  const activityRings = [ring1, ring2, ring3]
  const hasSessionToday = todayActs.length > 0
  const loadPct = Math.min(100, Math.round((moveLoad / dailyTssTarget) * 100))

  // Strain (0–21), derived from today's real training load.
  const strain = moveLoad > 0 ? Math.min(21, moveLoad / 8) : null
  const strainState = strain == null ? '—' : strain >= 8 && strain <= 16 ? (de ? 'Optimal' : 'Optimal') : strain > 16 ? (de ? 'Hoch' : 'High') : (de ? 'Leicht' : 'Light')

  const greeting = (() => {
    const h = today.getHours()
    const base = de ? (h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend') : (h < 11 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening')
    return athleteName ? `${base}, ${athleteName}` : base
  })()

  // Week streak — current week Mon→Sun, real activity presence + status.
  const trainedSet = useMemo(() => new Set((acts?.activities ?? []).map((a) => (a.started_at ?? a.date ?? '').slice(0, 10))), [acts])
  const weekDays = useMemo(() => {
    const monday = startOfWeek(today, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(monday, i)
      const key = format(d, 'yyyy-MM-dd')
      const isToday = key === todayKey
      const isPast = d < today && !isToday
      const done = trainedSet.has(key)
      const state: 'done' | 'today' | 'rest' | 'upcoming' = done ? 'done' : isToday ? 'today' : isPast ? 'rest' : 'upcoming'
      return { key, label: format(d, 'EEEEE'), state }
    })
  }, [today, todayKey, trainedSet])
  const streak = useMemo(() => {
    let n = 0
    for (let i = 0; i < 30; i++) {
      const key = format(subDays(today, i), 'yyyy-MM-dd')
      if (i === 0 && !trainedSet.has(key)) continue // today may be unlogged
      if (trainedSet.has(key)) n++
      else break
    }
    return n
  }, [today, trainedSet])

  const stateText = tier === 'peak' || tier === 'ready' ? (de ? 'Bereit für harte Belastung' : 'Primed to train')
    : tier === 'caution' ? (de ? 'Solide — moderat belasten' : 'Solid — train moderate')
    : tier === 'rest' ? (de ? 'Erholung priorisieren' : 'Prioritize recovery')
    : (de ? 'Lade…' : 'Loading…')

  return (
    <div className="flex flex-col gap-6 pb-4">
      {/* Greeting header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <h1 className="num-display" style={{ fontSize: 24, color: 'var(--color-ink)' }}>{greeting}</h1>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink-2)' }}>{format(today, de ? 'EEEE, d. MMMM' : 'EEEE, MMMM d')}</span>
        </div>
        <div className="shrink-0 grid place-items-center rounded-full" style={{ width: 46, height: 46, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}>
          <span className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)' }}>{(athleteName ?? 'A').charAt(0).toUpperCase()}</span>
        </div>
      </div>

      {/* Race chip → Plan tab */}
      {goalName && (
        <Link to="/dashboard?tab=plan" className={`${CARD} hover-card flex items-center gap-3.5`} style={cardStyle}>
          <div className="shrink-0 grid place-items-center rounded-full" style={{ width: 40, height: 40, background: 'var(--color-surface-2)' }}>
            <Flag size={20} strokeWidth={2} style={{ color: 'var(--color-ink-2)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="eyebrow" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-ink-2)' }}>{de ? 'Nächstes Ziel' : 'Next goal'}</div>
            <div className="num-display truncate" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{goalName}</div>
          </div>
          {daysToGoal != null && daysToGoal > 0 && (
            <div className="flex flex-col items-end">
              <span className="num-display" style={{ fontSize: 24, color: 'var(--color-ink)' }}>{Math.abs(daysToGoal)}</span>
              <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{de ? 'Tage' : 'days'}</span>
            </div>
          )}
          <span className="hover-arrow"><ChevronRight size={18} style={{ color: 'var(--color-muted)' }} /></span>
        </Link>
      )}

      {/* Recovery card → Recovery tab */}
      <Link to="/dashboard?tab=recovery" className={`${CARD} hover-card flex flex-col gap-[18px]`} style={cardStyle}>
        <div className="flex items-center gap-5">
          <ScoreRing score={score ?? 0} color={rColor} size={112}>
            <div className="flex flex-col items-center">
              <span className="num-display" style={{ fontSize: 34, color: rColor, lineHeight: 1 }}>{score != null ? Math.round(score) : '—'}</span>
            </div>
          </ScoreRing>
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-ink-2)' }}>{de ? 'Bereitschaft' : 'Readiness'}</span>
            <span className="inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1" style={{ background: `color-mix(in srgb, ${rColor} 15%, transparent)` }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: rColor }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: rColor }}>{stateText}</span>
            </span>
            <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>
              {brief?.verdict || (de ? 'HRV und Ruhepuls im gesunden Bereich.' : 'HRV and resting heart rate are in a healthy range.')}
            </p>
          </div>
        </div>
        <div style={{ height: 1, background: 'var(--color-rule)' }} />
        <div className="flex">
          <SubScore label={de ? 'Erholung' : 'Recovery'} value={score != null ? `${Math.round(score)}%` : '—'} color="var(--color-recovery)" />
          <div style={{ width: 1, background: 'var(--color-rule)' }} />
          <SubScore label="Form" value={typeof tsb === 'number' ? `${tsb >= 0 ? '+' : ''}${Math.round(tsb)}` : '—'} color="var(--color-strain)" />
          <div style={{ width: 1, background: 'var(--color-rule)' }} />
          <SubScore label={de ? 'Schlaf' : 'Sleep'} value={sleepScore != null ? `${Math.round(sleepScore)}` : '—'} color="var(--color-stand)" />
        </div>
      </Link>

      {/* Session Review — recommendation vs. what the athlete actually did */}
      {review && <SessionReview review={review} de={de} />}

      {/* Workout card (coral) */}
      {workout && (
        <div
          className="rounded-[24px] p-5 hover-card flex flex-col gap-[18px]"
          style={{ background: 'linear-gradient(125deg, color-mix(in srgb, var(--color-accent) 16%, var(--color-paper-2)) 0%, var(--color-paper-2) 72%)', border: '1px solid var(--color-accent)' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Zap size={16} strokeWidth={2.4} style={{ color: 'var(--color-accent)' }} />
              <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-accent)' }}>{de ? 'Heutiger Plan' : "Today's plan"}</span>
            </div>
            <span className="num-mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>{(workout.category ?? '').toLowerCase().includes('run') ? (de ? 'Laufen' : 'Run') : (de ? 'Rad' : 'Bike')}</span>
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)' }}>{workout.title}</h2>
            {workout.why_this_workout && <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>{workout.why_this_workout}</p>}
          </div>

          {/* What changed & why — transparent, data-driven adaptation */}
          {adaptations && (adaptations.summary || adaptations.changes.length > 0) && (
            <div className="rounded-2xl p-3.5 flex flex-col gap-2.5" style={{ background: 'color-mix(in srgb, var(--color-paper) 55%, transparent)', border: '1px solid var(--color-rule)' }}>
              <button type="button" onClick={() => setWhyOpen((o) => !o)} className="flex items-center gap-2 text-left">
                <Sparkles size={15} strokeWidth={2.2} style={{ color: 'var(--color-accent)' }} />
                <span className="flex-1 min-w-0" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink)', lineHeight: 1.35 }}>{adaptations.summary}</span>
                {adaptations.changes.length > 0 && <ChevronDown size={16} style={{ color: 'var(--color-muted)', transform: whyOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s ease' }} />}
              </button>
              {whyOpen && adaptations.changes.length > 0 && (
                <div className="flex flex-col gap-2.5" style={{ borderTop: '1px solid var(--color-rule)', paddingTop: 10 }}>
                  {adaptations.changes.map((c, i) => {
                    const col = c.severity === 'boost' ? 'var(--color-recovery)' : c.severity === 'ease' ? 'var(--color-amber)' : 'var(--color-strain)'
                    return (
                      <div key={i} className="flex gap-2.5">
                        <span className="shrink-0 mt-1" style={{ width: 7, height: 7, borderRadius: 999, background: col }} />
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-ink)' }}>
                            {c.signal}{c.direction === 'up' ? ' ↑' : c.direction === 'down' ? ' ↓' : ''} · <span style={{ color: col, fontWeight: 600 }}>{c.action}</span>
                          </span>
                          <span style={{ fontSize: 11.5, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>{c.detail}</span>
                          <span style={{ fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.35, fontStyle: 'italic' }}>{c.principle}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          <div className="flex gap-5">
            {([
              { l: de ? 'ZIEL-TSS' : 'TARGET TSS', v: workout.predicted_tss != null ? `${Math.round(workout.predicted_tss)}` : '—' },
              { l: de ? 'DAUER' : 'DURATION', v: workout.duration_minutes != null ? `${workout.duration_minutes} min` : '—' },
              { l: de ? 'INTENSITÄT' : 'INTENSITY', v: wIntensity ? `${wIntensity.z} · ${wIntensity.t}` : '—' },
            ]).map((s, i) => (
              <div key={i} className="flex flex-col gap-1">
                <span className="eyebrow" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--color-muted)' }}>{s.l}</span>
                <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{s.v}</span>
              </div>
            ))}
          </div>
          <div className="hover-reveal">
            <div className="flex flex-col gap-1" style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
              <span className="truncate">{wBlockSummary ?? (wIntensity ? `${wIntensity.z} · ${wIntensity.t}` : (de ? 'Intervallprofil' : 'Interval profile'))}</span>
              <span style={{ fontWeight: 700, color: 'var(--color-accent)' }}>{de ? 'Komplettes Workout →' : 'Full workout →'}</span>
            </div>
          </div>
          <Link to="/workout/today" className="inline-flex items-center justify-center gap-1.5 rounded-full py-2.5 min-h-[44px]" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)', fontSize: 14, fontWeight: 700 }}>
            <ListChecks size={16} strokeWidth={2} style={{ color: 'var(--color-ink-2)' }} /> {de ? 'Workout ansehen' : 'View full workout'} <ChevronRight size={16} style={{ color: 'var(--color-muted)' }} />
          </Link>
          <Link to="/workout/today" className="inline-flex items-center justify-center gap-2 rounded-full py-3.5 min-h-[48px]" style={{ background: 'var(--color-accent)', color: '#0A0C0F', fontSize: 15, fontWeight: 700, boxShadow: '0 6px 18px -4px color-mix(in srgb, var(--color-accent) 55%, transparent)' }}>
            <Play size={18} strokeWidth={2.6} fill="#0A0C0F" /> {de ? 'Einheit starten' : 'Start Workout'}
          </Link>
        </div>
      )}

      {/* Training load → Load & Form drill-down */}
      <Link to="/load-form" className={`${CARD} hover-card flex flex-col gap-4`} style={cardStyle}>
        <div className="flex items-center justify-between">
          <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-ink-2)' }}>{de ? 'Trainingslast' : 'Training Load'}</span>
          {dCtl != null && (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1" style={{ background: 'color-mix(in srgb, var(--color-recovery) 15%, transparent)' }}>
              {dCtl >= 0 ? <TrendingUp size={13} style={{ color: 'var(--color-recovery)' }} /> : <TrendingDown size={13} style={{ color: 'var(--color-recovery)' }} />}
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-recovery)' }}>{de ? 'Optimaler Aufbau' : 'Optimal ramp'}</span>
            </span>
          )}
        </div>
        <div className="flex">
          {([
            { v: ctl != null ? `${Math.round(ctl)}` : '—', n: de ? 'Fitness' : 'Fitness', c: 'CTL', color: 'var(--color-strain)' },
            { v: atl != null ? `${Math.round(atl)}` : '—', n: de ? 'Ermüdung' : 'Fatigue', c: 'ATL', color: 'var(--color-amber)' },
            { v: typeof tsb === 'number' ? `${tsb >= 0 ? '+' : ''}${Math.round(tsb)}` : '—', n: 'Form', c: 'TSB', color: 'var(--color-recovery)' },
          ]).map((x, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5" style={i > 0 ? { borderLeft: '1px solid var(--color-rule)' } : undefined}>
              <span className="num-display" style={{ fontSize: 26, color: x.color }}>{x.v}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}>{x.n}</span>
              <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.05em', color: 'var(--color-muted)' }}>{x.c}</span>
            </div>
          ))}
        </div>
        {loadTrend && (
          <div className="flex flex-col gap-1.5">
            <svg viewBox={`0 0 ${loadTrend.W} ${loadTrend.H}`} preserveAspectRatio="none" style={{ width: '100%', height: 60, display: 'block', overflow: 'visible' }}>
              <defs>
                <linearGradient id="ctlFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-strain)" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="var(--color-strain)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={loadTrend.ctlArea} fill="url(#ctlFill)" />
              <path d={loadTrend.ctlLine} fill="none" stroke="var(--color-strain)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              <path d={loadTrend.atlLine} fill="none" stroke="var(--color-amber)" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5" style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)' }}>
                <span style={{ width: 10, height: 2.5, borderRadius: 2, background: 'var(--color-strain)' }} />{de ? 'Fitness (CTL)' : 'Fitness (CTL)'}
              </span>
              <span className="inline-flex items-center gap-1.5" style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)' }}>
                <span style={{ width: 10, height: 2.5, borderRadius: 2, background: 'var(--color-amber)' }} />{de ? 'Ermüdung (ATL)' : 'Fatigue (ATL)'}
              </span>
              <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)', marginLeft: 'auto' }}>{de ? '6 Wochen' : '6 weeks'}</span>
            </div>
          </div>
        )}
        <div className="hover-reveal">
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink-2)' }}>
            CTL {ctl != null ? Math.round(ctl) : '—'} · ATL {atl != null ? Math.round(atl) : '—'} · TSB {typeof tsb === 'number' ? `${tsb >= 0 ? '+' : ''}${Math.round(tsb)}` : '—'} — <span style={{ color: 'var(--color-accent)', fontWeight: 700 }}>{de ? 'Last & Form öffnen →' : 'Full load & form →'}</span>
          </span>
        </div>
      </Link>

      {/* Today's training snapshot — TSS / active time / energy (real activity data) → History */}
      <Link to="/dashboard?tab=history" className={`${CARD} hover-card flex flex-col gap-4`} style={cardStyle}>
        <div className="flex items-center justify-between">
          <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-ink-2)' }}>{de ? 'Heutige Belastung' : "Today's Training"}</span>
          <span className="flex items-center gap-1">
            {hasSessionToday && (hasTss || moveLoad > 0) && (
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Ziel' : 'Goal'} {loadPct}%</span>
            )}
            <span className="hover-arrow"><ChevronRight size={16} style={{ color: 'var(--color-muted)' }} /></span>
          </span>
        </div>
        {hasSessionToday ? (
          <div className="flex items-center gap-6">
            <ActivityRings
              size={104}
              rings={activityRings.map((r) => ({ value: r.value, goal: r.goal, color: r.color }))}
            />
            <div className="flex-1 flex flex-col gap-3">
              {activityRings.map((r, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><span style={{ width: 9, height: 9, borderRadius: 999, background: r.color }} /><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink-2)' }}>{r.name}</span></div>
                  <span className="flex items-baseline gap-1"><span className="num-display" style={{ fontSize: 17, color: 'var(--color-ink)' }}>{r.display}</span>{r.unit && <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{r.unit}</span>}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3.5 py-1">
            <div className="shrink-0 grid place-items-center rounded-full" style={{ width: 46, height: 46, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}>
              <Moon size={20} strokeWidth={2} style={{ color: 'var(--color-muted)' }} />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Noch keine Einheit heute' : 'No session yet today'}</span>
              <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>
                {de ? `Tagesziel ${dailyTssTarget} TSS · deine Zahlen erscheinen nach dem Training.` : `Daily target ${dailyTssTarget} TSS · your numbers land here after you train.`}
              </span>
            </div>
          </div>
        )}
      </Link>

      {/* Metrics row — Resting HR / HRV / Strain (real Garmin) */}
      <div className="grid grid-cols-3 gap-3">
        <MetricTile to="/dashboard?tab=recovery" icon={Heart} iconColor="var(--color-move)" label={de ? 'Ruhepuls' : 'Resting HR'} value={restingHr != null ? `${Math.round(restingHr)}` : '—'} unit="bpm"
          trend={restingHr != null && latest?.resting_hr != null ? { icon: TrendingDown, text: de ? 'ausgeruht' : 'rested', color: 'var(--color-recovery)' } : undefined} />
        <MetricTile to="/dashboard?tab=recovery" icon={Activity} iconColor="var(--color-recovery)" label="HRV" value={hrvNow != null ? `${Math.round(hrvNow)}` : '—'} unit="ms"
          trend={typeof hrvDelta === 'number' ? { icon: hrvDelta >= 0 ? TrendingUp : TrendingDown, text: `${hrvDelta >= 0 ? '+' : ''}${hrvDelta.toFixed(0)}%`, color: hrvDelta >= 0 ? 'var(--color-recovery)' : 'var(--color-amber)' } : undefined} />
        <MetricTile to="/dashboard?tab=recovery" icon={Zap} iconColor="var(--color-strain)" label="Strain" value={strain != null ? strain.toFixed(1) : '—'} unit=""
          trend={strain != null ? { icon: Target, text: strainState, color: 'var(--color-strain)' } : undefined} />
      </div>

      {/* Streak card — weekday status dots → History */}
      <Link to="/dashboard?tab=history" className={`${CARD} hover-card flex flex-col gap-4`} style={cardStyle}>
        <div className="flex items-center justify-between">
          <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-ink-2)' }}>{de ? 'Diese Woche' : 'This Week'}</span>
          <span className="flex items-center gap-1">
            {streak > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: 'var(--color-surface-2)' }}>
                <Flame size={14} style={{ color: 'var(--color-amber)' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-amber)' }}>{streak} {de ? 'Tage Serie' : 'day streak'}</span>
              </span>
            )}
            <span className="hover-arrow"><ChevronRight size={16} style={{ color: 'var(--color-muted)' }} /></span>
          </span>
        </div>
        <div className="flex gap-2">
          {weekDays.map((d, i) => {
            const bg = d.state === 'done' ? 'color-mix(in srgb, var(--color-recovery) 18%, transparent)'
              : d.state === 'today' ? 'var(--color-accent)' : 'var(--color-surface-2)'
            const border = d.state === 'upcoming' ? '1px solid var(--color-rule)' : 'none'
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div className="grid place-items-center rounded-full" style={{ width: 34, height: 34, background: bg, border }}>
                  {d.state === 'done' && <Check size={17} strokeWidth={3} style={{ color: 'var(--color-recovery)' }} />}
                  {d.state === 'today' && <Zap size={17} strokeWidth={2.6} fill="#0A0C0F" style={{ color: '#0A0C0F' }} />}
                  {d.state === 'rest' && <Moon size={14} style={{ color: 'var(--color-muted)' }} />}
                </div>
                <span className="eyebrow" style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{d.label}</span>
              </div>
            )
          })}
        </div>
      </Link>
    </div>
  )
}

// ── Session Review helpers ──────────────────────────────────────────────────
function gradeMeta(grade: RideGrade | null, de: boolean): { color: string; label: string } {
  switch (grade) {
    case 'perfect': return { color: 'var(--color-recovery)', label: de ? 'Perfekt' : 'Perfect' }
    case 'strong': return { color: 'var(--color-recovery)', label: de ? 'Stark' : 'Strong' }
    case 'okay': return { color: 'var(--color-amber)', label: de ? 'Solide' : 'Okay' }
    case 'overcooked': return { color: 'var(--color-move)', label: de ? 'Überzogen' : 'Overcooked' }
    case 'undercooked': return { color: 'var(--color-amber)', label: de ? 'Zu locker' : 'Undercooked' }
    default: return { color: 'var(--color-muted)', label: '—' }
  }
}
const bandColor = (band: CompliancePair['band']) =>
  band === 'match' ? 'var(--color-recovery)' : band === 'over' ? 'var(--color-move)' : 'var(--color-amber)'

function CompRow({ label, pair, fmt }: { label: string; pair: CompliancePair; fmt: (v: number) => string }) {
  const col = bandColor(pair.band)
  const sign = pair.delta_pct >= 0 ? '+' : ''
  return (
    <div className="flex items-center justify-between gap-3">
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink-2)' }}>{label}</span>
      <div className="flex items-center gap-2">
        <span className="num-mono" style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>{fmt(pair.target)}</span>
        <ChevronRight size={13} style={{ color: 'var(--color-muted)' }} />
        <span className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{fmt(pair.actual)}</span>
        <span className="inline-flex items-center rounded-full" style={{ padding: '2px 8px', background: `color-mix(in srgb, ${col} 15%, transparent)`, color: col, fontSize: 11, fontWeight: 700 }}>{sign}{Math.round(pair.delta_pct)}%</span>
      </div>
    </div>
  )
}

function SessionReview({ review, de }: { review: PostRideReview; de: boolean }) {
  const gm = gradeMeta(review.grade, de)
  const multi = review.grade == null && (review.activities?.length ?? 0) >= 2
  const fmtMin = (v: number) => `${Math.round(v)} min`
  const fmtTss = (v: number) => `${Math.round(v)}`
  const fmtIf = (v: number) => v.toFixed(2)

  const insights: { icon: typeof Activity; color: string; label: string; text: string }[] = []
  if (review.physiological_read) insights.push({ icon: Activity, color: 'var(--color-recovery)', label: de ? 'Körper' : 'Body', text: review.physiological_read })
  if (review.goal_trajectory) insights.push({ icon: Target, color: 'var(--color-strain)', label: de ? 'Zielverlauf' : 'Goal', text: review.goal_trajectory })
  if (review.next_session_nudge) insights.push({ icon: TrendingUp, color: 'var(--color-accent)', label: de ? 'Nächste Einheit' : 'Next up', text: review.next_session_nudge })

  const totals = multi ? review.totals : undefined

  return (
    <div
      className="rounded-[24px] p-5 flex flex-col gap-[18px]"
      style={{ background: `linear-gradient(125deg, color-mix(in srgb, ${gm.color} 14%, var(--color-paper-2)) 0%, var(--color-paper-2) 72%)`, border: `1px solid color-mix(in srgb, ${gm.color} 55%, var(--color-rule))` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Trophy size={16} strokeWidth={2.4} style={{ color: gm.color }} />
          <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: gm.color }}>{de ? 'Einheit im Rückblick' : 'Session Review'}</span>
        </div>
        {review.grade && (
          <span className="inline-flex items-center gap-1.5 rounded-full" style={{ padding: '4px 12px', background: `color-mix(in srgb, ${gm.color} 18%, transparent)` }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: gm.color }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: gm.color }}>{gm.label}</span>
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="num-display" style={{ fontSize: 20, color: 'var(--color-ink)', lineHeight: 1.2 }}>{review.headline}</h2>
        {review.target_template_title && (
          <p style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>{de ? 'Vorgabe' : 'Prescribed'}: {review.target_template_title}</p>
        )}
      </div>

      {/* Recommendation vs. actual */}
      <div className="rounded-2xl p-3.5 flex flex-col gap-2.5" style={{ background: 'color-mix(in srgb, var(--color-paper) 55%, transparent)', border: '1px solid var(--color-rule)' }}>
        <span className="eyebrow" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-muted)' }}>{de ? 'Vorgabe → Ist' : 'Target → actual'}</span>
        <CompRow label={de ? 'Dauer' : 'Duration'} pair={review.duration} fmt={fmtMin} />
        <CompRow label="TSS" pair={review.tss} fmt={fmtTss} />
        {review.intensity_factor && <CompRow label={de ? 'Intensität (IF)' : 'Intensity (IF)'} pair={review.intensity_factor} fmt={fmtIf} />}
      </div>

      {/* Multi-activity wrap-up — totals + per-ride compliance chips */}
      {multi && (
        <div className="flex flex-col gap-2.5">
          {totals && (
            <div className="flex gap-5">
              {([
                { l: de ? 'EINHEITEN' : 'SESSIONS', v: `${totals.count}` },
                { l: 'TSS', v: `${Math.round(totals.tss)}` },
                { l: de ? 'DAUER' : 'DURATION', v: `${Math.round(totals.duration_minutes)} min` },
                { l: de ? 'DISTANZ' : 'DISTANCE', v: totals.distance_km ? `${totals.distance_km.toFixed(1)} km` : '—' },
              ]).map((s, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <span className="eyebrow" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--color-muted)' }}>{s.l}</span>
                  <span className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{s.v}</span>
                </div>
              ))}
            </div>
          )}
          {(review.activities ?? []).map((a, i) => {
            const am = gradeMeta(a.compliance_grade ?? null, de)
            return (
              <div key={i} className="flex items-center justify-between gap-2 rounded-xl" style={{ padding: '8px 12px', background: 'color-mix(in srgb, var(--color-paper) 55%, transparent)', border: '1px solid var(--color-rule)' }}>
                <span className="truncate" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>{a.title}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {a.tss != null && <span className="num-mono" style={{ fontSize: 12, color: 'var(--color-muted)' }}>{Math.round(a.tss)} TSS</span>}
                  {a.compliance_grade && (
                    <span className="rounded-full" style={{ padding: '2px 8px', background: `color-mix(in srgb, ${am.color} 15%, transparent)`, color: am.color, fontSize: 11, fontWeight: 700 }}>{am.label}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Coach feedback */}
      {insights.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {insights.map((it, i) => (
            <div key={i} className="flex gap-2.5">
              <span className="shrink-0 grid place-items-center rounded-full mt-0.5" style={{ width: 22, height: 22, background: `color-mix(in srgb, ${it.color} 15%, transparent)` }}>
                <it.icon size={13} style={{ color: it.color }} />
              </span>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="eyebrow" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-muted)' }}>{it.label}</span>
                <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>{it.text}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MetricTile({ to, icon: Icon, iconColor, label, value, unit, trend }: {
  to: string; icon: typeof Heart; iconColor: string; label: string; value: string; unit: string
  trend?: { icon: typeof Heart; text: string; color: string }
}) {
  return (
    <Link to={to} className="rounded-[20px] p-4 hover-card flex flex-col gap-3" style={cardStyle}>
      <div className="flex items-center gap-2">
        <Icon size={17} style={{ color: iconColor }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}>{label}</span>
      </div>
      <div className="flex items-end gap-1">
        <span className="num-display" style={{ fontSize: 26, color: 'var(--color-ink)', lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: 13, color: 'var(--color-muted)', paddingBottom: 3 }}>{unit}</span>}
      </div>
      {trend && (
        <div className="hover-reveal">
          <div className="flex items-center gap-1">
            <trend.icon size={15} style={{ color: trend.color }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: trend.color }}>{trend.text}</span>
          </div>
        </div>
      )}
    </Link>
  )
}
