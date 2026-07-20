import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, TrendingUp, TrendingDown, Zap, Check, Bike, Footprints,
  Dumbbell, Calendar, CalendarOff, Shield, ArrowRight, Moon,
} from 'lucide-react'
import { subDays, addDays, parseISO, format } from 'date-fns'
import { useLocale } from '../contexts/LocaleContext'
import HoverBars from '../components/ui/HoverBars'
import { usePMC } from '../hooks/usePMC'
import { useActivitiesRange } from '../hooks/useActivitiesRange'
import { usePeriodReport } from '../hooks/usePeriodReport'
import { usePowerProfile } from '../hooks/usePowerProfile'
import { useAthleteProfile } from '../hooks/useAthleteProfile'
import { useAdaptive } from '../hooks/useAdaptive'
import { useCurrentWeek } from '../hooks/useCurrentWeek'

/**
 * Load & Form — the standalone /load-form analytics screen. A 1:1 rebuild of the
 * Pencil "Load & Form" design: header + TSB gauge, weekly load, injury-risk ACWR,
 * intensity split, sport split, fitness signals, monotony & strain, this-week
 * compliance, trajectory, and today's recommendation. Every figure is derived
 * from real hooks (PMC entries + activities + period report + power/athlete +
 * adaptive directive); where the backend can't supply a figure we render the
 * structure with a graceful "—" rather than fabricate.
 */

const DASH = '—'

function fmtDur(sec: number): string {
  const m = Math.round(sec / 60)
  const h = Math.floor(m / 60)
  const mm = m % 60
  return h > 0 ? `${h}h ${String(mm).padStart(2, '0')}m` : `${mm}m`
}

// Monday-anchored ISO-week key (reused from WeeklyLoadCard).
function isoWeekKey(d: Date): string {
  const day = (d.getDay() + 6) % 7
  const monday = new Date(d)
  monday.setDate(d.getDate() - day)
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
}

// ---- shared card shell ----------------------------------------------------

function Card({ children, gap = 16, accent = false }: { children: React.ReactNode; gap?: number; accent?: boolean }) {
  return (
    <div
      className="rounded-[24px] p-5"
      style={{
        display: 'flex', flexDirection: 'column', gap,
        background: accent ? 'var(--color-accent-soft)' : 'var(--color-paper-2)',
        border: `1px solid ${accent ? 'var(--color-accent)' : 'var(--color-rule)'}`,
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
        <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{title}</span>
        {sub && <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{sub}</span>}
      </div>
      {right}
    </div>
  )
}

function Pill({ children, color, soft }: { children: React.ReactNode; color: string; soft?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full"
      style={{ padding: '5px 10px', fontSize: 12, fontWeight: 700, color, background: soft ?? 'transparent' }}
    >
      {children}
    </span>
  )
}

// ===========================================================================

export default function LoadFormView() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const navigate = useNavigate()
  const today = useMemo(() => new Date(), [])

  const { data: pmc } = usePMC(90)
  const { data: actData } = useActivitiesRange(subDays(today, 56), today)
  const { data: report } = usePeriodReport(90)
  const { data: power } = usePowerProfile()
  const { data: athlete } = useAthleteProfile()
  const { data: adaptive } = useAdaptive()
  const { data: weekPlan } = useCurrentWeek()

  const series = pmc?.entries ?? []
  const activities = actData?.activities ?? []

  // ---- Hero: TSB / CTL / ATL (from PMC) -----------------------------------
  const latest = series.length ? series[series.length - 1] : null
  const prevWeek = series.length >= 8 ? series[series.length - 8] : series[0] ?? null
  const tsb = latest ? Math.round(latest.tsb) : null
  const ctl = latest ? Math.round(latest.ctl) : null
  const atl = latest ? Math.round(latest.atl) : null
  const dCtl7 = latest && prevWeek ? Math.round(latest.ctl - prevWeek.ctl) : null
  const dAtl7 = latest && prevWeek ? Math.round(latest.atl - prevWeek.atl) : null

  const TSB_MIN = -30, TSB_MAX = 25
  const posTsb = (v: number) => Math.max(0, Math.min(1, (v - TSB_MIN) / (TSB_MAX - TSB_MIN)))
  const tsbState = (() => {
    if (tsb == null) return { label: DASH, color: 'var(--color-muted)', Icon: TrendingUp }
    if (tsb <= -15) return { label: de ? 'Überlastet' : 'Overreached', color: 'var(--color-move)', Icon: TrendingDown }
    if (tsb <= -5) return { label: de ? 'Aufbauend' : 'Building', color: 'var(--color-amber)', Icon: Zap }
    if (tsb <= 10) return { label: de ? 'Wettkampfbereit' : 'Race-ready', color: 'var(--color-recovery)', Icon: Check }
    return { label: de ? 'Frisch' : 'Race-fresh', color: 'var(--color-recovery)', Icon: TrendingUp }
  })()
  const TSB_SEGS = [
    { color: 'var(--color-move)', to: -15 },
    { color: 'var(--color-amber)', to: -5 },
    { color: 'var(--color-recovery)', to: 10 },
    { color: 'var(--color-strain)', to: TSB_MAX },
  ]

  // ---- Weekly load bars (8 weeks, summed activity TSS) ---------------------
  const weeks = useMemo(() => {
    const buckets = new Map<string, number>()
    for (let i = 7; i >= 0; i--) buckets.set(isoWeekKey(subDays(today, i * 7)), 0)
    for (const a of activities) {
      const iso = a.started_at ?? a.date
      if (!iso) continue
      const key = isoWeekKey(new Date(iso))
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + (a.tss ?? 0))
    }
    return [...buckets.entries()].sort((x, y) => x[0].localeCompare(y[0])).slice(-8).map(([key, tss]) => ({ key, tss: Math.round(tss) }))
  }, [activities, today])
  const lastComplete = weeks.length >= 2 ? weeks[weeks.length - 2] : null
  const priorComplete = weeks.length >= 3 ? weeks[weeks.length - 3] : null
  const rampPct = lastComplete && priorComplete && priorComplete.tss > 0
    ? Math.round(((lastComplete.tss - priorComplete.tss) / priorComplete.tss) * 100) : null
  const rampSafe = rampPct == null || Math.abs(rampPct) <= 15

  // ---- Injury risk / ACWR (7d acute : 28d chronic weekly avg) -------------
  const acwr = useMemo(() => {
    const win = activities.filter((a) => new Date(a.started_at ?? a.date ?? 0) >= subDays(today, 28))
    if (win.length === 0) return null
    const d7 = subDays(today, 7)
    let acute = 0, last28 = 0
    for (const a of win) {
      const t = a.tss ?? 0
      last28 += t
      if (new Date(a.started_at ?? a.date ?? 0) >= d7) acute += t
    }
    const chronic = last28 / 4
    return { acute: Math.round(acute), chronic: Math.round(chronic), ratio: chronic > 0 ? acute / chronic : 0 }
  }, [activities, today])
  const R_MAX = 2
  const posR = (r: number) => Math.max(0, Math.min(1, r / R_MAX))
  const acwrState = (() => {
    if (!acwr) return { label: DASH, color: 'var(--color-muted)' }
    if (acwr.ratio < 0.8) return { label: de ? 'Untertraining' : 'Undertraining', color: 'var(--color-muted)' }
    if (acwr.ratio <= 1.3) return { label: de ? 'Optimalbereich' : 'Sweet spot', color: 'var(--color-recovery)' }
    if (acwr.ratio <= 1.5) return { label: de ? 'Vorsicht' : 'Caution', color: 'var(--color-amber)' }
    return { label: de ? 'Gefahr' : 'Danger', color: 'var(--color-move)' }
  })()
  const ramp = report?.load_dynamics?.ramp_per_week

  // ---- Load by intensity (3-zone model from period report) ----------------
  const mix = report?.intensity ?? null
  const intensitySegs = mix ? [
    { key: 'easy', label: de ? 'Leicht' : 'Easy', pct: mix.z1_pct, color: 'var(--color-recovery)' },
    { key: 'mod', label: de ? 'Moderat' : 'Moderate', pct: mix.z2_pct, color: 'var(--color-amber)' },
    { key: 'hard', label: de ? 'Hart' : 'Hard', pct: mix.z3_pct, color: 'var(--color-move)' },
  ] : []

  // ---- Load by sport (28d activity TSS + duration) ------------------------
  const sport = useMemo(() => {
    const acc = { ride: { tss: 0, sec: 0 }, run: { tss: 0, sec: 0 }, strength: { tss: 0, sec: 0 } }
    for (const a of activities) {
      if (new Date(a.started_at ?? a.date ?? 0) < subDays(today, 28)) continue
      const bucket = a.sport === 'cycling' ? acc.ride : a.sport === 'running' ? acc.run : acc.strength
      bucket.tss += a.tss ?? 0
      bucket.sec += a.duration_seconds ?? 0
    }
    return acc
  }, [activities, today])
  const sportGrand = sport.ride.tss + sport.run.tss + sport.strength.tss
  const sportSecs = sport.ride.sec + sport.run.sec + sport.strength.sec
  const sportRows = [
    { key: 'ride', label: de ? 'Rad' : 'Ride', Icon: Bike, color: 'var(--color-strain)', ...sport.ride },
    { key: 'run', label: de ? 'Lauf' : 'Run', Icon: Footprints, color: 'var(--color-accent)', ...sport.run },
    { key: 'strength', label: de ? 'Kraft' : 'Strength', Icon: Dumbbell, color: 'var(--color-stand)', ...sport.strength },
  ].map((s) => ({ ...s, pct: sportGrand > 0 ? (s.tss / sportGrand) * 100 : 0 }))

  // ---- Fitness signals (power profile + athlete) --------------------------
  const threshold = power?.cp_watts ?? power?.eftp_watts ?? athlete?.ftp_watts ?? null
  const thrLabel = power?.cp_watts ? 'CP' : 'FTP'
  const weight = athlete?.weight_kg ?? null
  const wkg = threshold != null && weight != null && weight > 0 ? threshold / weight : null
  const lthr = athlete?.lthr_cycling ?? null
  const fitnessTiles = [
    { label: 'W/kg', value: wkg != null ? wkg.toFixed(1) : DASH, unit: 'W/kg', color: 'var(--color-strain)' },
    { label: 'LTHR', value: lthr != null ? `${Math.round(lthr)}` : DASH, unit: 'bpm', color: 'var(--color-move)' },
    { label: de ? 'Gewicht' : 'Weight', value: weight != null ? weight.toFixed(1) : DASH, unit: 'kg', color: 'var(--color-recovery)' },
  ]

  // ---- Monotony & strain (Foster, derived from daily activity TSS) --------
  const foster = useMemo(() => {
    const days: number[] = []
    for (let i = 6; i >= 0; i--) {
      const dayStart = subDays(today, i)
      const key = `${dayStart.getFullYear()}-${dayStart.getMonth()}-${dayStart.getDate()}`
      days.push(activities.filter((a) => {
        const d = new Date(a.started_at ?? a.date ?? 0)
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === key
      }).reduce((s, a) => s + (a.tss ?? 0), 0))
    }
    const load = days.reduce((s, v) => s + v, 0)
    if (load <= 0) return null
    const mean = load / 7
    const variance = days.reduce((s, v) => s + (v - mean) ** 2, 0) / 7
    const sd = Math.sqrt(variance)
    const monotony = sd > 0 ? mean / sd : 0
    return { monotony, strain: load * monotony, load: Math.round(load) }
  }, [activities, today])
  const monoOk = foster != null && foster.monotony < 2

  // ---- This week (real done; planned target unavailable) ------------------
  const thisWeek = useMemo(() => {
    const key = isoWeekKey(today)
    const inWeek = activities.filter((a) => isoWeekKey(new Date(a.started_at ?? a.date ?? 0)) === key)
    const tss = Math.round(inWeek.reduce((s, a) => s + (a.tss ?? 0), 0))
    const dayHas = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(today, ((today.getDay() + 6) % 7) - i)
      return inWeek.some((a) => {
        const ad = new Date(a.started_at ?? a.date ?? 0)
        return ad.getFullYear() === d.getFullYear() && ad.getMonth() === d.getMonth() && ad.getDate() === d.getDate()
      })
    })
    return { tss, sessions: inWeek.length, dayHas }
  }, [activities, today])
  const weekdayLetters = de ? ['M', 'D', 'M', 'D', 'F', 'S', 'S'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const todayIdx = (today.getDay() + 6) % 7

  // Planned weekly TSS from the week plan (backend: planned_tss_total on
  // GET /weeks/current). Tolerant read — the field may lag in the API type;
  // absent → honest empty state, never a fake 0% bar.
  const plannedWeekTss = (weekPlan as { planned_tss_total?: number | null } | undefined)?.planned_tss_total ?? null
  const compliancePct = plannedWeekTss != null && plannedWeekTss > 0
    ? Math.round((thisWeek.tss / plannedWeekTss) * 100)
    : null

  // ---- Trajectory (period report) -----------------------------------------
  // Audit P0-5: the "Fitness 6wk" chip was removed — its 6-week CTL %change was
  // seed-contaminated (read a different window of the same series and claimed
  // "+69% rising" beside a negative CTL/wk tile). Do not re-add until it reads
  // the same canonical CTL series as every other surface.
  const traj = report?.trajectory ?? null

  // ---- Recommendation (adaptive directive) --------------------------------
  const recHeadline = adaptive?.headline ?? (de ? 'Empfehlung' : 'Recommendation')
  const recBody = adaptive?.signals?.[0]?.text ?? adaptive?.intensity_ceiling ?? null

  const showTrend = (v: number | null, unit = '') =>
    v == null ? DASH : `${v >= 0 ? '+' : ''}${v}${unit}`

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-paper)' }}>
      <div className="mx-auto w-full max-w-md px-4 pt-3 pb-28 flex flex-col gap-5">
        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5"
          style={{ fontSize: 12.5, color: 'var(--color-ink-2)', border: '1px solid var(--color-rule)', background: 'transparent' }}
        >
          <ArrowLeft size={15} /> {de ? 'Zurück' : 'Back'}
        </button>

        {/* Header: LAST 42 DAYS / Training Load + range toggle */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="eyebrow" style={{ fontSize: 12, letterSpacing: 1, color: 'var(--color-muted)' }}>
              {de ? 'LETZTE 42 TAGE' : 'LAST 42 DAYS'}
            </span>
            <span className="num-display" style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-ink)' }}>
              {de ? 'Trainingslast' : 'Training Load'}
            </span>
          </div>
          <div className="flex rounded-full p-[3px]" style={{ background: 'var(--color-surface-2)', gap: 2 }}>
            {['6W', '3M', '1Y'].map((r) => (
              <span
                key={r}
                className="rounded-full"
                style={{
                  padding: '6px 12px', fontSize: 12, fontWeight: 600,
                  color: r === '3M' ? 'var(--color-ink)' : 'var(--color-ink-2)',
                  background: r === '3M' ? 'var(--color-accent)' : 'transparent',
                }}
              >
                {r}
              </span>
            ))}
          </div>
        </div>

        {/* 1. Form Hero — TSB gauge + CTL/ATL */}
        <div
          className="rounded-[24px] p-[22px] flex flex-col"
          style={{ gap: 20, background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="eyebrow" style={{ fontSize: 12, letterSpacing: 1, color: 'var(--color-muted)' }}>{de ? 'FORM · TSB' : 'FORM · TSB'}</span>
              <span className="num-display" style={{ fontSize: 52, fontWeight: 700, lineHeight: 1, color: tsbState.color }}>
                {tsb == null ? DASH : showTrend(tsb)}
              </span>
            </div>
            <Pill color={tsbState.color} soft="var(--color-recovery-soft, rgba(22,224,138,0.15))">
              <tsbState.Icon size={16} /> {tsbState.label}
            </Pill>
          </div>

          {/* Gauge */}
          <div>
            <div className="relative" style={{ height: 28 }}>
              <div className="absolute flex overflow-hidden" style={{ top: 9, left: 0, right: 0, height: 12, borderRadius: 6 }}>
                {TSB_SEGS.map((s, i) => {
                  const from = i === 0 ? TSB_MIN : TSB_SEGS[i - 1].to
                  const w = (posTsb(s.to) - posTsb(from)) * 100
                  return <div key={i} style={{ width: `${w}%`, height: '100%', background: s.color }} />
                })}
              </div>
              {tsb != null && (
                <div
                  className="absolute"
                  style={{ top: 0, left: `calc(${posTsb(tsb) * 100}% - 3px)`, width: 6, height: 28, borderRadius: 3, background: 'var(--color-ink)', border: '2px solid var(--color-paper-2)' }}
                />
              )}
            </div>
            <div className="flex justify-between" style={{ marginTop: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{de ? 'Überlastet' : 'Overreached'}</span>
              <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{de ? 'Optimal' : 'Optimal'}</span>
              <span style={{ fontSize: 11, color: 'var(--color-strain)' }}>{de ? 'Frisch' : 'Fresh'}</span>
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--color-rule)' }} />

          {/* CTL / ATL */}
          <div className="flex justify-between">
            <div className="flex flex-col gap-1">
              <span className="eyebrow" style={{ fontSize: 11, letterSpacing: 1, color: 'var(--color-muted)' }}>{de ? 'FITNESS · CTL' : 'FITNESS · CTL'}</span>
              <div className="flex items-center gap-2">
                <span className="num-display" style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-ink)' }}>{ctl ?? DASH}</span>
                {/* Icon + tone follow the sign — a quiet week is not a failure,
                    so a falling CTL reads muted/neutral, never red. */}
                <span className="inline-flex items-center gap-1 rounded-full" style={{ padding: '3px 7px', background: 'var(--color-surface-2)', fontSize: 11, fontWeight: 600, color: dCtl7 != null && dCtl7 < 0 ? 'var(--color-muted)' : 'var(--color-strain)' }}>
                  {dCtl7 != null && dCtl7 < 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />} {showTrend(dCtl7)} {de ? 'Woche' : 'wk'}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="eyebrow" style={{ fontSize: 11, letterSpacing: 1, color: 'var(--color-muted)' }}>{de ? 'ERMÜDUNG · ATL' : 'FATIGUE · ATL'}</span>
              <div className="flex items-center gap-2">
                <span className="num-display" style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-ink)' }}>{atl ?? DASH}</span>
                <span className="inline-flex items-center gap-1 rounded-full" style={{ padding: '3px 7px', background: 'var(--color-surface-2)', fontSize: 11, fontWeight: 600, color: 'var(--color-amber)' }}>
                  <Zap size={12} /> {showTrend(dAtl7)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Weekly Load */}
        <Card>
          <CardHead
            title={de ? 'Wöchentliche Last' : 'Weekly Load'}
            sub={de ? 'Trainingsstress pro Woche' : 'Training Stress Score per week'}
            right={rampPct != null ? (
              <Pill color={rampSafe ? 'var(--color-recovery)' : 'var(--color-amber)'} soft={rampSafe ? 'rgba(22,224,138,0.15)' : 'rgba(255,176,32,0.15)'}>
                <Check size={14} /> {showTrend(rampPct, '%')}
              </Pill>
            ) : undefined}
          />
          <HoverBars
            height={118}
            gap={8}
            radius={6}
            defaultColor="var(--color-strain)"
            bars={weeks.map((w, i) => {
              const monday = parseISO(w.key)
              const sunday = addDays(monday, 6)
              return {
                value: w.tss,
                valueLabel: `${w.tss} TSS`,
                label: `${format(monday, de ? 'd. MMM' : 'MMM d')} – ${format(sunday, de ? 'd. MMM' : 'MMM d')}`,
                highlight: i === weeks.length - 1,
              }
            })}
          />
          <div className="flex" style={{ gap: 8 }}>
            {weeks.map((w, i) => {
              const isNow = i === weeks.length - 1
              return (
                <span key={w.key} className="flex-1 text-center" style={{ fontSize: 11, fontWeight: isNow ? 700 : 500, color: isNow ? 'var(--color-accent)' : 'var(--color-muted)' }}>
                  {isNow ? (de ? 'Jetzt' : 'Now') : `W${i + 1}`}
                </span>
              )
            })}
          </div>
        </Card>

        {/* 3. Injury Risk — ACWR */}
        <Card>
          <CardHead
            title={de ? 'Verletzungsrisiko' : 'Injury Risk'}
            sub={de ? 'Akut : Chronisch Lastverhältnis' : 'Acute : Chronic workload ratio'}
            right={
              <div className="flex items-center gap-2">
                <span className="num-display" style={{ fontSize: 26, fontWeight: 700, color: acwrState.color }}>{acwr ? acwr.ratio.toFixed(2) : DASH}</span>
                <Pill color={acwrState.color} soft="rgba(22,224,138,0.12)">{acwrState.label}</Pill>
              </div>
            }
          />
          <div>
            <div className="relative" style={{ height: 26 }}>
              <div className="absolute flex overflow-hidden" style={{ top: 8, left: 0, right: 0, height: 10, borderRadius: 5, gap: 2 }}>
                <div style={{ flex: '0 0 40%', background: 'var(--color-surface-3)' }} />
                <div style={{ flex: '0 0 25%', background: 'var(--color-recovery)' }} />
                <div style={{ flex: '0 0 10%', background: 'var(--color-amber)' }} />
                <div style={{ flex: '1 1 auto', background: 'var(--color-move)' }} />
              </div>
              {acwr && (
                <div className="absolute" style={{ top: 0, left: `calc(${posR(acwr.ratio) * 100}% - 3px)`, width: 6, height: 26, borderRadius: 3, background: 'var(--color-ink)', border: '2px solid var(--color-paper-2)' }} />
              )}
            </div>
            <div className="flex justify-between" style={{ marginTop: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{de ? 'Untertraining' : 'Undertraining'}</span>
              <span style={{ fontSize: 11, color: 'var(--color-recovery)' }}>{de ? 'Optimal' : 'Sweet spot'}</span>
              <span style={{ fontSize: 11, color: 'var(--color-move)' }}>{de ? 'Gefahr' : 'Danger'}</span>
            </div>
          </div>
          <div style={{ height: 1, background: 'var(--color-rule)' }} />
          <div className="flex justify-between">
            {[
              { l: de ? 'Akut · 7T' : 'Acute · 7d', v: acwr ? `${acwr.acute}` : DASH, u: 'TSS' },
              { l: de ? 'Chronisch · 28T' : 'Chronic · 28d', v: acwr ? `${acwr.chronic}` : DASH, u: 'TSS/wk' },
              { l: de ? 'Anstieg' : 'Ramp', v: ramp != null ? showTrend(Math.round(ramp)) : DASH, u: de ? 'pro Woche' : 'per week' },
            ].map((s) => (
              <div key={s.l} className="flex flex-col gap-1">
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{s.l}</span>
                <div className="flex items-end gap-1">
                  <span className="num-display" style={{ fontSize: 19, fontWeight: 700, color: 'var(--color-ink)' }}>{s.v}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-muted)', paddingBottom: 3 }}>{s.u}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* 4. Load by Intensity */}
        <Card>
          <CardHead
            title={de ? 'Last nach Intensität' : 'Load by Intensity'}
            sub={mix ? `${mix.model}${mix.model && mix.target_model ? ' · ' : ''}${de ? 'Ziel: ' : 'target: '}${mix.target_model}` : (de ? 'Woraus dein Stress kam · 28T' : 'Where your stress came from · 28d')}
            right={mix ? (
              <Pill color={mix.aligned ? 'var(--color-recovery)' : 'var(--color-amber)'} soft={mix.aligned ? 'rgba(22,224,138,0.15)' : 'rgba(255,176,32,0.15)'}>
                <Check size={14} /> {mix.aligned ? (de ? 'Ausgerichtet' : 'On-target') : (de ? 'Daneben' : 'Off-target')}
              </Pill>
            ) : undefined}
          />
          {mix ? (
            <>
              <div className="flex overflow-hidden" style={{ height: 16, borderRadius: 8, gap: 2 }}>
                {intensitySegs.map((s) => (
                  <div key={s.key} title={`${s.label} · ${Math.round(s.pct)}%`} style={{ width: `${Math.max(0, s.pct)}%`, minWidth: s.pct > 0 ? 4 : 0, background: s.color }} />
                ))}
              </div>
              <div className="flex flex-col gap-2.5">
                {intensitySegs.map((s) => (
                  <div key={s.key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color }} />
                      <span style={{ fontSize: 13, color: 'var(--color-ink)' }}>{s.label}</span>
                    </div>
                    <span className="num-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink-2)' }}>{Math.round(s.pct)}%</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>{DASH}</span>
          )}
        </Card>

        {/* 5. Load by Sport */}
        <Card>
          <CardHead
            title={de ? 'Last nach Sportart' : 'Load by Sport'}
            sub={de ? `Wochenstress je Disziplin · ${Math.round(sportGrand)} TSS` : `Weekly stress by discipline · ${Math.round(sportGrand)} TSS`}
            right={sportSecs > 0 ? (
              <span className="rounded-full" style={{ padding: '5px 10px', background: 'var(--color-surface-2)', fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}>{fmtDur(sportSecs)}</span>
            ) : undefined}
          />
          {sportGrand > 0 ? (
            <>
              <div className="flex overflow-hidden" style={{ height: 16, borderRadius: 8, gap: 2 }}>
                {sportRows.filter((s) => s.pct > 0).map((s) => (
                  <div key={s.key} title={`${s.label} · ${Math.round(s.tss)} TSS · ${Math.round(s.pct)}%`} style={{ width: `${s.pct}%`, background: s.color }} />
                ))}
              </div>
              <div className="flex flex-col gap-3">
                {sportRows.map((s) => (
                  <div key={s.key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--color-surface-2)', color: s.color }}>
                        <s.Icon size={15} />
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--color-ink)' }}>{s.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{s.sec > 0 ? fmtDur(s.sec) : DASH}</span>
                      <span className="num-display" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink-2)' }}>{Math.round(s.tss)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>{DASH}</span>
          )}
        </Card>

        {/* 6. Fitness Signals */}
        <Card gap={14}>
          <div className="flex flex-col gap-0.5">
            <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Fitness-Signale' : 'Fitness Signals'}</span>
            <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{de ? 'Physiologische Benchmarks' : 'Physiological benchmarks'}</span>
          </div>
          {/* Threshold power tile */}
          <div className="flex items-end justify-between rounded-[16px]" style={{ padding: 16, background: 'var(--color-surface-2)' }}>
            <div className="flex flex-col gap-1.5">
              <span className="inline-flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>
                <Zap size={15} style={{ color: 'var(--color-accent)' }} /> {thrLabel}
              </span>
              <div className="flex items-end gap-1.5">
                <span className="num-display" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1, color: 'var(--color-ink)' }}>{threshold != null ? Math.round(threshold) : DASH}</span>
                <span style={{ fontSize: 13, color: 'var(--color-muted)', paddingBottom: 5 }}>{wkg != null ? `W · ${wkg.toFixed(1)} W/kg` : 'W'}</span>
              </div>
            </div>
          </div>
          {/* 3-up grid */}
          <div className="grid grid-cols-3" style={{ gap: 10 }}>
            {fitnessTiles.map((tl) => (
              <div key={tl.label} className="flex flex-col gap-1 rounded-[14px]" style={{ padding: 13, background: 'var(--color-surface-2)' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{tl.label}</span>
                <span className="num-display" style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-ink)' }}>{tl.value}</span>
                <span style={{ fontSize: 10, fontWeight: 500, color: tl.color }}>{tl.unit}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* 7. Monotony & Strain */}
        <Card>
          <div className="flex flex-col gap-0.5">
            <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Monotonie & Strain' : 'Monotony & Strain'}</span>
            <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{de ? 'Übertrainings-Schutz · Foster-Methode' : 'Overtraining guard · Foster method'}</span>
          </div>
          {[
            {
              label: de ? 'Monotonie' : 'Monotony',
              value: foster ? foster.monotony.toFixed(1) : DASH,
              fill: foster ? foster.monotony / 3 : 0,
              color: monoOk ? 'var(--color-recovery)' : 'var(--color-amber)',
              badge: foster ? (monoOk ? (de ? 'Gut' : 'Good') : (de ? 'Hoch' : 'High')) : DASH,
              badgeColor: monoOk ? 'var(--color-recovery)' : 'var(--color-amber)',
              note: de ? 'Ziel < 2,0 · variierte Last' : 'Target < 2.0 · varied load',
            },
            {
              label: de ? 'Wochen-Strain' : 'Weekly Strain',
              value: foster ? Math.round(foster.strain).toLocaleString() : DASH,
              fill: foster ? foster.strain / 4000 : 0,
              color: 'var(--color-strain)',
              badge: foster ? (foster.strain < 2500 ? (de ? 'Moderat' : 'Moderate') : (de ? 'Hoch' : 'High')) : DASH,
              badgeColor: 'var(--color-amber)',
              note: de ? 'Last × Monotonie' : 'Load × monotony',
            },
          ].map((r) => (
            <div key={r.label} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-end gap-2">
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink-2)' }}>{r.label}</span>
                  <span className="num-display" style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-ink)' }}>{r.value}</span>
                </div>
                <span className="rounded-full" style={{ padding: '4px 9px', background: 'var(--color-paper)', fontSize: 11, fontWeight: 700, color: r.badgeColor }}>{r.badge}</span>
              </div>
              <div title={`${r.label}: ${r.value}`} style={{ height: 6, borderRadius: 3, background: 'var(--color-surface-3)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(0, Math.min(100, r.fill * 100))}%`, height: '100%', borderRadius: 3, background: r.color }} />
              </div>
              <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{r.note}</span>
            </div>
          ))}
        </Card>

        {/* 8. This Week — plan compliance (real done vs planned_tss_total) */}
        <Card>
          <CardHead
            title={de ? 'Diese Woche' : 'This Week'}
            sub={de ? 'Plan-Erfüllung' : 'Plan compliance'}
            right={
              <div className="flex items-end gap-0.5">
                <span className="num-display" style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-accent)' }}>{compliancePct != null ? compliancePct : DASH}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-accent)', paddingBottom: 3 }}>%</span>
              </div>
            }
          />
          {compliancePct != null ? (
            <div style={{ height: 10, borderRadius: 5, background: 'var(--color-surface-3)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, Math.max(0, compliancePct))}%`, height: '100%', background: 'var(--color-accent)' }} />
            </div>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
              {de ? 'Noch keine Plandaten diese Woche' : 'No plan data yet this week'}
            </span>
          )}
          <div className="flex justify-between">
            {[
              { v: `${thisWeek.tss}`, l: de ? 'TSS erledigt' : 'TSS done' },
              { v: `${thisWeek.sessions}`, l: de ? 'Einheiten' : 'Sessions' },
              { v: plannedWeekTss != null ? `${Math.round(plannedWeekTss)}` : DASH, l: de ? 'TSS geplant' : 'TSS target' },
            ].map((s) => (
              <div key={s.l} className="flex flex-col gap-1">
                <span className="num-display" style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-ink)' }}>{s.v}</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>{s.l}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            {thisWeek.dayHas.map((has, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <span
                  className="flex items-center justify-center rounded-full"
                  style={{
                    width: 30, height: 30,
                    background: has ? 'var(--color-accent)' : 'var(--color-surface-2)',
                    border: i === todayIdx ? '2px solid var(--color-accent)' : '1px solid var(--color-rule)',
                    color: has ? 'var(--color-ink)' : 'var(--color-muted)',
                  }}
                >
                  {has ? <Check size={15} /> : i === todayIdx ? <Zap size={14} /> : <Moon size={13} />}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: i === todayIdx ? 'var(--color-accent)' : 'var(--color-muted)' }}>{weekdayLetters[i]}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* 9. Trajectory */}
        <Card gap={14}>
          <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Verlauf · nächste 7 Tage' : 'Trajectory · next 7 days'}</span>
          {traj ? (
            <div className="flex justify-between">
              {[
                {
                  Icon: Calendar, iconColor: 'var(--color-strain)',
                  label: de ? 'Peak-Form ETA' : 'Peak form ETA',
                  value: traj?.days_to_goal != null ? `${traj.days_to_goal}${de ? 'T' : 'd'}` : DASH,
                  sub: traj?.taper_window || (de ? 'bei Taper' : 'if you taper'),
                },
                {
                  Icon: Shield, iconColor: 'var(--color-amber)',
                  label: de ? 'Wochen-TSS' : 'Weekly TSS',
                  value: traj ? `${Math.round(traj.weekly_tss_actual)}` : DASH,
                  sub: traj ? `/ ${Math.round(traj.weekly_tss_required)} ${de ? 'Ziel' : 'target'}` : (de ? 'Ziel' : 'target'),
                },
              ].map((s) => (
                <div key={s.label} className="flex flex-col gap-1.5">
                  <span className="inline-flex items-center gap-1.5" style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>
                    <s.Icon size={14} style={{ color: s.iconColor }} /> {s.label}
                  </span>
                  <span className="num-display" style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-ink)' }}>{s.value}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-ink-2)' }}>{s.sub}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2" style={{ color: 'var(--color-muted)' }}>
              <CalendarOff size={16} /> <span style={{ fontSize: 13 }}>{de ? 'Kein Event gesetzt' : 'No event set'}</span>
            </div>
          )}
        </Card>

        {/* 10. Recommendation */}
        <Card accent>
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center rounded-full" style={{ width: 40, height: 40, background: 'var(--color-accent)', color: 'var(--color-ink)' }}>
              <Check size={24} />
            </span>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="num-display" style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-ink)' }}>{recHeadline}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-accent)' }}>{de ? "Heutige Empfehlung" : "Today's recommendation"}</span>
            </div>
          </div>
          {recBody && (
            <p style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--color-ink-2)' }}>{recBody}</p>
          )}
          <Link
            to="/dashboard?tab=today"
            className="flex items-center justify-center gap-2 rounded-full"
            style={{ padding: 15, background: 'var(--color-accent)', color: 'var(--color-ink)', fontSize: 15, fontWeight: 700 }}
          >
            <span className="num-display" style={{ fontWeight: 700 }}>{de ? 'Einheit öffnen' : 'Open session'}</span>
            <ArrowRight size={18} />
          </Link>
        </Card>
      </div>
    </div>
  )
}
