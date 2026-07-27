import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Brain, RefreshCw, Trophy, TrendingUp, TrendingDown, Flag, Bike,
  BarChart3, Activity, ArrowRight, ArrowUp, ChevronRight, Share2, Gauge,
  ChevronDown, Clock, Mountain,
} from 'lucide-react'
import { subDays } from 'date-fns'
import { prefersReducedMotion } from '../utils/motion'
import { useLocale } from '../contexts/LocaleContext'
import MobileBottomNav from '../components/dashboard/MobileBottomNav'
import DashboardHeaderBar from '../components/dashboard/DashboardHeaderBar'
import { usePMC } from '../hooks/usePMC'
import { useAthleteProfile } from '../hooks/useAthleteProfile'
import { useActivitiesRange } from '../hooks/useActivitiesRange'
import { useCoachBrief } from '../hooks/useCoachBrief'
import { useGoalTrajectory } from '../hooks/useGoalTrajectory'
import { useCurrentWeek } from '../hooks/useCurrentWeek'
import { usePowerProfileView } from '../hooks/usePowerProfileView'
import { useSeasonTrends } from '../hooks/useSeasonTrends'
import { formatDate } from '../utils/format'

/**
 * V3 · Season Progress — a 1:1 rebuild of the Pencil "V3 · Season Progress"
 * frame (node prfwd): the season-story screen behind the Progress / Fortschritt
 * tab. It answers "how far you've come this season and where you're headed".
 *
 * Every figure is real:
 *   • FTP / W/kg / monthly FTP progression — /analytics/power-profile-view
 *     (ftp_progression is the app's only typed FTP-over-time series).
 *   • Season fitness curve — the dated CTL history from /training-load/pmc.
 *   • The forecast — the ONE Bayesian /weeks/current projection.
 *   • Durability / decoupling — power-profile-view.sprint_pedal, plus the
 *     season decoupling trend from /analytics/season-trends.
 *   • VO₂max / weight / durability / 20-min-power season trends — the monthly
 *     buckets from /analytics/season-trends, aggregated from already-stored
 *     data (daily_metric.raw_data / weight_kg, activity_stream.decoupling_pct /
 *     mmp_curve[1200]).
 *   • Event context — /coach/trajectory.
 * Where a metric genuinely has no stored data for THIS athlete (e.g. no Garmin
 * VO₂max, no daily weight, event distance / elevation / finish-time), we render
 * an honest "—" or an honest empty state — never a fabricated number.
 */

const DASH = '—'

const C = {
  bg: 'var(--color-paper)',
  surface: 'var(--color-paper-2)',
  surface2: 'var(--color-surface-2)',
  surface3: 'var(--color-surface-3)',
  border: 'var(--color-rule)',
  ink: 'var(--color-ink)',
  ink2: 'var(--color-ink-2)',
  tertiary: 'var(--color-muted)',
  accent: 'var(--color-accent)',
  recovery: 'var(--color-recovery)',
  strain: 'var(--color-strain)',
  gold: 'var(--color-gold)',
  violet: 'var(--color-violet)',
  amber: 'var(--color-amber)',
  move: 'var(--color-move)',
}
const soft = (v: string, pct = 15) => `color-mix(in srgb, ${v} ${pct}%, transparent)`
const DISPLAY = 'num-display'

// Approximation of the pen's warm "wrapped-iri" marble shader (coral→magenta→dark).
const HERO_BG = 'radial-gradient(125% 125% at 12% 8%, #FF7A46 0%, #E0456B 44%, #7A1D3F 70%, #2A1024 100%)'
const DURA_BG = 'radial-gradient(125% 125% at 18% 12%, #FF6A3C 0%, #D93E5C 46%, #3A0D16 76%, #160608 100%)'

const n0 = (x: number | null | undefined) => (x == null || !isFinite(x) ? null : Math.round(x))
const n1 = (x: number | null | undefined) => (x == null || !isFinite(x) ? null : Math.round(x * 10) / 10)

/** Smooth-ish SVG polyline point string across a 0..W × 0..H box (padded). */
function sparkPoints(vals: number[], w = 120, h = 26, pad = 3): string {
  if (vals.length < 2) return ''
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const span = Math.max(1e-6, hi - lo)
  const x = (i: number) => (i / (vals.length - 1)) * w
  const y = (v: number) => h - pad - ((v - lo) / span) * (h - pad * 2)
  return vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
}

// ── shared shells ───────────────────────────────────────────────────────────
function Card({ children, gap = 16, pad = 20, style }: {
  children: React.ReactNode; gap?: number; pad?: number; style?: React.CSSProperties
}) {
  return (
    <div className="rounded-[24px]" style={{
      display: 'flex', flexDirection: 'column', gap, padding: pad,
      background: C.surface, border: `1px solid ${C.border}`, ...style,
    }}>
      {children}
    </div>
  )
}

function SectionHeader({ tick, title, sub }: { tick: string; title: string; sub: string }) {
  return (
    <div className="flex items-center" style={{ gap: 11 }}>
      <span style={{ width: 3, height: 26, borderRadius: 2, background: tick, flex: 'none' }} />
      <div className="flex flex-col" style={{ gap: 1 }}>
        <span className={DISPLAY} style={{ fontSize: 17, fontWeight: 700, letterSpacing: 0.5, color: C.ink }}>{title}</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: C.tertiary }}>{sub}</span>
      </div>
    </div>
  )
}

function Pill({ children, color, bg }: { children: React.ReactNode; color: string; bg?: string }) {
  return (
    <span className="inline-flex items-center rounded-full"
      style={{ gap: 4, padding: '5px 10px', fontSize: 11, fontWeight: 700, color, background: bg ?? C.surface2 }}>
      {children}
    </span>
  )
}

// ── Season fitness curve — scrubbable CTL line ──────────────────────────────
// The dated CTL history rendered as an SVG area+line, with a movable marker:
// touch/drag (or hover on desktop) reads the fitness value + date at that point.
// Reuses the app's tap-tooltip pattern (HoverBars / PMCChart) rather than uPlot,
// since the honest data here is a single sparse yearly series.
function SeasonFitnessChart({
  data, fmtD, phases,
}: {
  data: { t: number; ctl: number }[]
  fmtD: (d: Date, p: { en: string; de: string }) => string
  phases: { t: string; c: string }[]
}) {
  const [active, setActive] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const reduce = prefersReducedMotion()
  const W = 310, H = 150, PAD = 12
  const vals = data.map((e) => e.ctl)
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const span = Math.max(1e-6, hi - lo)
  const xFrac = (i: number) => (data.length < 2 ? 0 : i / (data.length - 1))
  const yPx = (v: number) => H - PAD - ((v - lo) / span) * (H - PAD * 2)
  const pts = data.map((e, i) => `${(xFrac(i) * W).toFixed(1)},${yPx(e.ctl).toFixed(1)}`).join(' ')
  const area = `0,${H} ${pts} ${W},${H}`

  // Month markers — first index of each calendar month, thinned to ≤ 6 labels.
  const months = useMemo(() => {
    const seen = new Set<string>()
    const out: { i: number; label: string }[] = []
    data.forEach((e, i) => {
      const d = new Date(e.t)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      if (!seen.has(key)) { seen.add(key); out.push({ i, label: fmtD(d, { en: 'MMM', de: 'MMM' }) }) }
    })
    if (out.length > 6) { const step = Math.ceil(out.length / 6); return out.filter((_, k) => k % step === 0) }
    return out
  }, [data, fmtD])

  const setFromClientX = (clientX: number) => {
    const el = wrapRef.current
    if (!el || data.length < 2) return
    const rect = el.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    setActive(Math.round(frac * (data.length - 1)))
  }

  const act = active != null ? data[active] : null
  const actFrac = active != null ? xFrac(active) : 0
  const actY = act ? yPx(act.ctl) : 0
  const tipLeft = Math.min(86, Math.max(14, actFrac * 100)) // clamp so the tooltip never overflows

  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <div
        ref={wrapRef}
        className="relative select-none"
        style={{ height: H, touchAction: 'none', cursor: 'crosshair' }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setFromClientX(e.clientX) }}
        onPointerMove={(e) => { if (e.pressure > 0 || e.pointerType === 'mouse') setFromClientX(e.clientX) }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setActive(null) }}
      >
        {/* clipped chart body: phase bands + area + line */}
        <div className="absolute inset-0 rounded-[14px] overflow-hidden" style={{ background: C.surface2 }}>
          <div className="absolute inset-0 flex">
            {phases.map((p) => (
              <span key={p.t} style={{ flex: 1, background: soft(p.c, 8) }} />
            ))}
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0" style={{ width: '100%', height: '100%' }} aria-hidden>
            <defs>
              <linearGradient id="ctlFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FF5A3C" stopOpacity="0.42" />
                <stop offset="100%" stopColor="#FF5A3C" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <polygon points={area} fill="url(#ctlFill)" />
            <polyline points={pts} fill="none" stroke={C.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* movable marker + dot (unclipped overlay) */}
        {act && (
          <>
            <span className="absolute" style={{
              left: `${actFrac * 100}%`, top: 0, bottom: 0, width: 1,
              background: soft(C.accent, 55), transform: 'translateX(-0.5px)',
              transition: reduce ? undefined : 'left 90ms linear',
            }} />
            <span className="absolute rounded-full" style={{
              left: `${actFrac * 100}%`, top: actY, width: 11, height: 11,
              background: C.accent, border: '2px solid var(--color-paper)',
              transform: 'translate(-50%, -50%)', boxShadow: '0 0 10px #FF5A3C99',
              transition: reduce ? undefined : 'left 90ms linear, top 90ms linear',
            }} />
            {(() => {
              const below = actY < H / 2 // flip tooltip below the dot when the point sits high
              return (
                <div className="absolute z-10 pointer-events-none flex flex-col items-center" style={{
                  left: `${tipLeft}%`,
                  top: below ? actY + 14 : actY - 14,
                  transform: `translate(-50%, ${below ? '0' : '-100%'})`,
                  transition: reduce ? undefined : 'left 90ms linear, top 90ms linear',
                }}>
                  {below && <span style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: `5px solid ${C.surface3}` }} />}
                  <div className="rounded-[10px] flex flex-col items-center whitespace-nowrap" style={{
                    gap: 1, padding: '6px 10px', background: C.surface3,
                    border: `1px solid ${C.border}`, boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
                  }}>
                    <span className={DISPLAY} style={{ fontSize: 15, lineHeight: 1, fontWeight: 700, color: C.accent }}>
                      CTL {Math.round(act.ctl)}
                    </span>
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: C.tertiary }}>
                      {fmtD(new Date(act.t), { en: 'MMM d', de: 'd. MMM' })}
                    </span>
                  </div>
                  {!below && <span style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `5px solid ${C.surface3}` }} />}
                </div>
              )
            })()}
          </>
        )}
      </div>

      {/* month markers */}
      <div className="relative" style={{ height: 13 }}>
        {months.map((m) => (
          <span key={m.i} className="absolute" style={{
            left: `${Math.min(94, Math.max(2, xFrac(m.i) * 100))}%`,
            transform: 'translateX(-50%)', fontSize: 10, fontWeight: 600, color: C.tertiary,
          }}>{m.label}</span>
        ))}
      </div>
    </div>
  )
}

// ── page ─────────────────────────────────────────────────────────────────────
export default function BikeProgressView() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const navigate = useNavigate()
  const today = useMemo(() => new Date(), [])
  const year = today.getFullYear()
  const fmtD = useCallback(
    (d: Date, p: { en: string; de: string }) => formatDate(d, de ? p.de : p.en, locale),
    [de, locale],
  )

  const { data: ppv } = usePowerProfileView()
  const { data: trends } = useSeasonTrends()
  const { data: pmc } = usePMC(365)
  const { data: athlete } = useAthleteProfile()
  const { data: brief } = useCoachBrief()
  const { data: traj } = useGoalTrajectory()
  const { data: week } = useCurrentWeek()
  // A wide window for season milestones (longest ride etc.); clamped to API max.
  const fetchFrom = useMemo(() => subDays(today, 365), [today])
  const { data: actData } = useActivitiesRange(fetchFrom, today)

  // ── Canonical FTP / W/kg / weight ──────────────────────────────────────────
  const weight = ppv?.weight_kg ?? athlete?.weight_kg ?? null
  const ftp = n0(ppv?.threshold_watts) ?? athlete?.ftp_watts ?? null
  const ftpWkg = ppv?.threshold_wkg ?? (ftp != null && weight ? ftp / weight : null)

  // ── Monthly FTP progression (the one typed FTP-over-time series) ───────────
  // Anchor the current month to the canonical FTP so the hero, the trend, the
  // gains and Then-vs-Now never disagree (audit P0-1: one FTP everywhere).
  const prog = useMemo(() => {
    const raw = ppv?.ftp_progression ?? []
    if (!raw.length || ftp == null) return raw
    return raw.map((p) => (p.is_current ? { ...p, watts: ftp } : p))
  }, [ppv, ftp])
  const progWatts = prog.map((p) => p.watts)
  const firstFtp = prog.length ? prog[0].watts : null
  const curFtp = prog.length ? prog[prog.length - 1].watts : ftp
  const ftpGainW = firstFtp != null && curFtp != null ? Math.round(curFtp - firstFtp) : null
  const firstWkg = firstFtp != null && weight ? firstFtp / weight : null
  const curWkg = curFtp != null && weight ? curFtp / weight : ftpWkg
  const wkgGain = firstWkg != null && curWkg != null ? curWkg - firstWkg : null
  const monthsSpan = prog.length

  // ── Percentile — the app's established honest W/kg ladder (audit: one FTP,
  // one convention). We avoid benchmark.position_pct here: its "top X%" vs
  // "Xth-percentile" polarity is ambiguous and could invert the framing. ──
  const topPct = useMemo(() => {
    if (ftpWkg == null) return null
    return ftpWkg >= 4.5 ? 3 : ftpWkg >= 4.0 ? 8 : ftpWkg >= 3.5 ? 18 : ftpWkg >= 3.0 ? 35 : 55
  }, [ftpWkg])

  // ── Dein Motor interactivity — tap a metric tile to reveal what it means ──
  const [motorTile, setMotorTile] = useState<'ftp' | 'wkg' | null>(null)
  const fadeReveal: React.CSSProperties = prefersReducedMotion() ? {} : { animation: 'bpvReveal 240ms cubic-bezier(.22,1,.36,1)' }
  const phenType = ppv?.phenotype?.type ?? null
  // The app's honest W/kg tier ladder (mirrors the topPct thresholds above), so
  // the rider can see exactly which rung their power-to-weight sits on.
  const wkgTiers = useMemo(() => ([
    { label: 'Elite', min: 4.5, pct: 3 },
    { label: de ? 'Sehr stark' : 'Very strong', min: 4.0, pct: 8 },
    { label: de ? 'Stark' : 'Strong', min: 3.5, pct: 18 },
    { label: de ? 'Solide' : 'Solid', min: 3.0, pct: 35 },
    { label: de ? 'Im Aufbau' : 'Building', min: 0, pct: 55 },
  ]), [de])
  const curTierIdx = useMemo(() => {
    if (ftpWkg == null) return -1
    return wkgTiers.findIndex((t) => ftpWkg >= t.min)
  }, [ftpWkg, wkgTiers])

  // ── Season CTL curve (dated PMC history, current year only) ───────────────
  const ctlYear = useMemo(() => {
    const entries = pmc?.entries ?? []
    return entries
      .filter((e) => new Date(e.date).getFullYear() === year && isFinite(e.ctl))
      .map((e) => ({ t: +new Date(e.date), ctl: e.ctl }))
      .sort((a, b) => a.t - b.t)
  }, [pmc, year])
  const ctlNow = ctlYear.length ? Math.round(ctlYear[ctlYear.length - 1].ctl) : null
  const ctlMax = ctlYear.length ? Math.round(Math.max(...ctlYear.map((e) => e.ctl))) : null
  const ctlFirst = ctlYear.length ? Math.round(ctlYear[0].ctl) : null
  const ctlGain = ctlNow != null && ctlFirst != null ? ctlNow - ctlFirst : null
  const ctlIsPeak = ctlNow != null && ctlMax != null && ctlNow >= ctlMax

  // ── Season milestones — only the ones we can back with real dated data ────
  const activities = useMemo(() => actData?.activities ?? [], [actData])
  const rides = useMemo(
    () => activities.filter((a) => a.sport === 'cycling'),
    [activities],
  )
  const milestones = useMemo(() => {
    type M = { key: string; icon: React.ReactNode; iconBg: string; title: string; date: string | null; value: string; highlight?: boolean }
    const out: M[] = []
    // New FTP record — the canonical FTP, dated to the current progression month.
    if (curFtp != null) {
      const curMonth = prog.find((p) => p.is_current)
      out.push({
        key: 'ftp', icon: <Trophy size={18} style={{ color: C.gold }} />, iconBg: soft(C.gold, 15),
        title: de ? 'FTP-Rekord' : 'FTP record',
        date: curMonth ? (de ? curMonth.month_de : curMonth.month_en) : null,
        value: `${Math.round(curFtp)} W`, highlight: true,
      })
    }
    // Longest ride this season — max distance among fetched cycling rides.
    const longest = rides.reduce<typeof rides[number] | null>(
      (best, a) => ((a.distance_meters ?? 0) > (best?.distance_meters ?? 0) ? a : best), null)
    if (longest && (longest.distance_meters ?? 0) > 0) {
      out.push({
        key: 'long', icon: <Bike size={18} style={{ color: C.strain }} />, iconBg: soft(C.strain, 15),
        title: de ? 'Längste Fahrt der Saison' : 'Longest ride this season',
        date: fmtD(new Date(longest.started_at), { en: 'MMM d', de: 'd. MMM' }),
        value: `${Math.round((longest.distance_meters ?? 0) / 1000)} km`,
      })
    }
    // Peak fitness — the season CTL high-water mark, dated.
    if (ctlMax != null) {
      const peak = ctlYear.find((e) => Math.round(e.ctl) === ctlMax)
      out.push({
        key: 'ctl', icon: <TrendingUp size={18} style={{ color: C.accent }} />, iconBg: soft(C.accent, 15),
        title: de ? 'Höchste Fitness' : 'Peak fitness',
        date: peak ? fmtD(new Date(peak.t), { en: 'MMM d', de: 'd. MMM' }) : null,
        value: `CTL ${ctlMax}`,
      })
    }
    // Cohort percentile — real benchmark position, no crossing date.
    if (topPct != null) {
      out.push({
        key: 'pct', icon: <BarChart3 size={18} style={{ color: C.violet }} />, iconBg: soft(C.violet, 15),
        title: de ? `In den Top ${topPct} %` : `Into the top ${topPct}%`,
        date: null, value: de ? 'Perzentil' : 'percentile',
      })
    }
    return out
  }, [curFtp, prog, rides, ctlMax, ctlYear, topPct, de, fmtD])

  // ── Durability (power fade / decoupling) ─────────────────────────────────
  const durabilityPct = ppv?.sprint_pedal?.durability_best_pct ?? null
  const decouplingPct = ppv?.sprint_pedal?.avg_decoupling_pct ?? null

  // ── Season trends — real monthly series aggregated from stored data ───────
  // (VO₂max, weight, durability/decoupling, best 20-min power). Each metric is
  // honestly empty when THIS athlete has no stored data for it.
  const trendPts = useMemo(() => trends?.points ?? [], [trends])
  const trendVals = useCallback(
    (key: 'vo2max' | 'weight_kg' | 'durability_pct' | 'p20min_w') =>
      trendPts.map((p) => p[key]).filter((v): v is number => v != null),
    [trendPts],
  )
  const vo2Sum = trends?.vo2max
  const p20Sum = trends?.p20min_w
  const wtSum = trends?.weight_kg
  const duraSum = trends?.durability_pct
  const vo2Vals = useMemo(() => trendVals('vo2max'), [trendVals])
  const p20Vals = useMemo(() => trendVals('p20min_w'), [trendVals])
  const wtVals = useMemo(() => trendVals('weight_kg'), [trendVals])
  // Monthly decoupling trend for the Durability card (labelled months, lower =
  // holds power deeper). Replaces the fabricated You/Jan/Elite fade chart.
  const duraTrend = useMemo(
    () =>
      trendPts
        .filter((p) => p.durability_pct != null)
        .map((p) => ({ label: de ? p.month_de : p.month_en, v: p.durability_pct as number })),
    [trendPts, de],
  )
  const hasDuraTrend = duraTrend.length >= 2

  // ── The projection — /weeks/current Bayesian forecast ────────────────────
  const proj = week?.projection ?? null
  const projPerf = proj != null && proj.mode === 'performance'
  const projCentral = proj?.projected_central != null ? Math.round(proj.projected_central) : null
  const projCurrent = proj?.current_estimate != null ? Math.round(proj.current_estimate) : null
  const projDelta = projCentral != null && projCurrent != null ? projCentral - projCurrent : null
  const projHorizonIso = proj?.path?.length ? proj.path[proj.path.length - 1].date : null
  const projHorizonLabel = projHorizonIso
    ? fmtD(new Date(`${projHorizonIso}T12:00:00`), { en: 'MMM', de: 'MMM' })
    : null
  // Forecast bars: current (actual) + up to 4 sampled projected path points.
  const forecastBars = useMemo(() => {
    if (!projPerf || !proj || projCurrent == null) return []
    const path = proj.path ?? []
    const sampled: { label: string; value: number; projected: boolean }[] = [
      { label: de ? 'jetzt' : 'now', value: projCurrent, projected: false },
    ]
    if (path.length) {
      const step = Math.max(1, Math.floor(path.length / 4))
      for (let i = step - 1; i < path.length && sampled.length < 5; i += step) {
        const p = path[i]
        sampled.push({
          label: fmtD(new Date(`${p.date}T12:00:00`), { en: 'MMM', de: 'MMM' }),
          value: Math.round(p.central), projected: true,
        })
      }
    }
    return sampled
  }, [projPerf, proj, projCurrent, de, fmtD])

  // ── Event context — /coach/trajectory ────────────────────────────────────
  const eventName = traj?.event_name ?? athlete?.goals?.target_event_name ?? null
  const eventDateStr = traj?.event_date ?? athlete?.target_event_date ?? null
  const eventDate = eventDateStr ? new Date(`${eventDateStr}T12:00:00`) : null
  const eventTypeRaw = traj?.event_type ?? athlete?.target_event_type ?? null
  const daysToGoal = traj?.days_to_goal ?? null
  const onTrackWord = traj?.on_track === 'ahead'
    ? (de ? 'Vor dem Plan für' : 'Ahead of plan for')
    : traj?.on_track === 'behind'
      ? (de ? 'Im Rückstand für' : 'Behind for')
      : (de ? 'Auf Kurs für' : 'On track for')
  const projectionValid = traj != null && traj.projection_basis !== 'none' && traj.ctl_projected_at_goal != null

  // ── Coach narrative ──────────────────────────────────────────────────────
  const narrative = traj?.narrative_hook || brief?.verdict || null

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: C.bg, color: C.ink }}>
      <style>{`@keyframes bpvReveal{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}`}</style>
      <div className="max-w-md mx-auto" style={{ padding: '8px 20px 96px' }}>
        {/* Shared utility header — locale / sync / settings / profile, same as
            the other main tabs (this is a standalone root route, not in DashboardShell). */}
        <DashboardHeaderBar />
        <div className="flex flex-col" style={{ gap: 20, marginTop: 12 }}>

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between" style={{ gap: 12 }}>
            <div className="flex flex-col" style={{ gap: 2 }}>
              <span className="eyebrow" style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1, color: C.tertiary }}>
                {de ? `${year} · SEIT JANUAR` : `${year} · SINCE JANUARY`}
              </span>
              <span className={DISPLAY} style={{ fontSize: 28, fontWeight: 700, color: C.ink }}>
                {de ? 'Saison-Fortschritt' : 'Season Progress'}
              </span>
            </div>
            <span className="inline-flex items-center rounded-full" style={{ gap: 6, padding: '7px 12px', background: C.surface2 }}>
              <RefreshCw size={13} style={{ color: C.ink2 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.ink2 }}>{de ? 'Synchron' : 'Synced'}</span>
            </span>
          </div>

          {/* ── Coach's read on your season ─────────────────────────────── */}
          <div className="rounded-[24px] flex flex-col" style={{ gap: 14, padding: 18, background: C.violet + '26', border: `1px solid ${C.violet}` }}>
            <div className="flex items-center" style={{ gap: 11 }}>
              <span className="flex items-center justify-center rounded-full" style={{ width: 38, height: 38, background: C.violet, flex: 'none' }}>
                <Brain size={20} style={{ color: '#fff' }} />
              </span>
              <div className="flex flex-col" style={{ gap: 1 }}>
                <span className={DISPLAY} style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>
                  {de ? 'Coach-Einschätzung zur Saison' : "Coach's read on your season"}
                </span>
                <span style={{ fontSize: 12, fontWeight: 500, color: C.tertiary }}>
                  {de ? 'Januar → heute' : 'January → today'}
                </span>
              </div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, color: C.ink2, lineHeight: 1.5 }}>
              {narrative ?? (de
                ? 'Noch keine Saison-Einschätzung — sie erscheint, sobald genug Trainingshistorie vorliegt.'
                : 'No season read yet — it appears once there is enough training history.')}
            </span>
            {eventName && (
              <div className="rounded-[14px] flex items-center" style={{ gap: 10, padding: '11px 12px', background: '#00000026' }}>
                <span className="flex items-center justify-center rounded-full" style={{ width: 30, height: 30, background: C.accent, flex: 'none' }}>
                  <Flag size={15} style={{ color: '#fff' }} />
                </span>
                <div className="flex flex-col" style={{ gap: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{onTrackWord} {eventName}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: C.ink2 }}>
                    {eventDate ? fmtD(eventDate, { en: 'MMM d', de: 'd. MMM' }) : DASH}
                    {projPerf && projCentral != null && projectionValid
                      ? ` · ${de ? 'proj. FTP' : 'projected FTP'} ${projCentral} ${proj?.unit ?? 'W'}`
                      : ''}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ── Hero · your engine ──────────────────────────────────────── */}
          <div className="rounded-[24px] flex flex-col" style={{ gap: 20, padding: 22, background: HERO_BG }}>
            <div className="flex items-center justify-between">
              <span className="eyebrow" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, color: '#FFFFFFCC' }}>
                {de ? `${year} · DEIN MOTOR` : `${year} · YOUR ENGINE`}
              </span>
              {topPct != null && (
                <span className="inline-flex items-center rounded-full" style={{ gap: 5, padding: '6px 11px', background: '#FFFFFF29' }}>
                  <Trophy size={13} style={{ color: '#fff' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Top {topPct}%</span>
                </span>
              )}
            </div>
            <div className="flex items-stretch" style={{ gap: 14 }}>
              <button
                type="button"
                onClick={() => setMotorTile((v) => (v === 'ftp' ? null : 'ftp'))}
                aria-expanded={motorTile === 'ftp'}
                className="flex items-end text-left rounded-[12px]"
                style={{
                  gap: 5, padding: '4px 10px 4px 8px', border: 0,
                  background: motorTile === 'ftp' ? '#FFFFFF24' : 'transparent',
                  outline: motorTile === 'ftp' ? '1px solid #FFFFFF4D' : 'none', minHeight: 44,
                }}>
                <span className={DISPLAY} style={{ fontSize: 54, fontWeight: 700, color: '#fff', lineHeight: 1, textShadow: '0 0 22px #FFFFFF59' }}>{ftp ?? DASH}</span>
                <span style={{ fontSize: 16, fontWeight: 500, color: '#FFFFFFB3', paddingBottom: 10 }}>W</span>
              </button>
              <span style={{ width: 1, background: '#FFFFFF33', flex: 'none', margin: '8px 0' }} />
              <button
                type="button"
                onClick={() => setMotorTile((v) => (v === 'wkg' ? null : 'wkg'))}
                aria-expanded={motorTile === 'wkg'}
                className="flex flex-col justify-center text-left rounded-[12px]"
                style={{
                  gap: 2, padding: '4px 10px', border: 0,
                  background: motorTile === 'wkg' ? '#FFFFFF24' : 'transparent',
                  outline: motorTile === 'wkg' ? '1px solid #FFFFFF4D' : 'none', minHeight: 44,
                }}>
                <div className="flex items-end" style={{ gap: 4 }}>
                  <span className={DISPLAY} style={{ fontSize: 32, fontWeight: 700, color: '#fff', lineHeight: 1 }}>{n1(ftpWkg) ?? DASH}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#FFFFFF80', paddingBottom: 5 }}>W/kg</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 500, color: '#FFFFFFB3' }}>
                  {weight != null ? `${de ? 'bei' : 'at'} ${n1(weight)} kg` : (de ? 'Gewicht ergänzen' : 'add weight')}
                </span>
              </button>
              <span className="flex items-center" style={{ marginLeft: 'auto' }}>
                <ChevronDown size={18} strokeWidth={2.4} style={{
                  color: '#FFFFFFB3', transform: motorTile ? 'rotate(180deg)' : 'none',
                  transition: 'transform 200ms cubic-bezier(.22,1,.36,1)',
                }} />
              </span>
            </div>
            {ftpGainW != null && (
              <span className="inline-flex items-center self-start rounded-full" style={{ gap: 6, padding: '7px 13px', background: '#0A0C0F59', backdropFilter: 'blur(14px)' }}>
                <TrendingUp size={14} style={{ color: '#5EF0A8' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                  {ftpGainW >= 0 ? '+' : ''}{ftpGainW} W{wkgGain != null ? ` · ${wkgGain >= 0 ? '+' : ''}${n1(wkgGain)} W/kg` : ''} {de ? 'seit Januar' : 'since January'}
                </span>
              </span>
            )}
            {prog.length >= 2 && (
              <div className="flex flex-col" style={{ gap: 9 }}>
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: '#FFFFFFB3' }}>
                    {(de ? prog[0].month_de : prog[0].month_en).toUpperCase()} · {Math.round(firstFtp ?? 0)} W
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: '#fff' }}>
                    {de ? 'JETZT' : 'NOW'} · {Math.round(curFtp ?? 0)} W ↗
                  </span>
                </div>
                <div className="flex items-end" style={{ gap: 5, height: 70 }}>
                  {(() => {
                    const mx = Math.max(...progWatts, 1)
                    return progWatts.map((w, i) => {
                      const last = i === progWatts.length - 1
                      return (
                        <span key={i} className="flex-1" style={{
                          height: Math.max(10, (w / mx) * 70),
                          borderRadius: '4px 4px 0 0',
                          background: last ? '#fff' : '#0A0C0F5C',
                          boxShadow: last ? '0 0 14px #FFFFFFB3' : undefined,
                        }} />
                      )
                    })
                  })()}
                </div>
              </div>
            )}

            {/* Reveal — plain-language meaning of the tapped metric */}
            {motorTile === 'ftp' && (
              <div className="rounded-[14px] flex items-start" style={{ gap: 10, padding: '12px 13px', background: '#0A0C0F5C', backdropFilter: 'blur(14px)', ...fadeReveal }}>
                <span className="flex items-center justify-center rounded-full" style={{ width: 28, height: 28, background: '#FFFFFF1F', flex: 'none' }}>
                  <Clock size={15} style={{ color: '#fff' }} />
                </span>
                <div className="flex flex-col" style={{ gap: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{de ? 'FTP — deine Stundenleistung' : 'FTP — your one-hour power'}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#FFFFFFCC', lineHeight: 1.45 }}>
                    {de
                      ? `Die Leistung, die du etwa eine Stunde am Stück treten kannst. Je höher, desto größer dein Motor. Deiner liegt bei ${ftp ?? DASH} W.`
                      : `The power you can hold for roughly an hour straight. The higher it is, the bigger your engine. Yours is ${ftp ?? DASH} W.`}
                  </span>
                </div>
              </div>
            )}
            {motorTile === 'wkg' && (
              <div className="rounded-[14px] flex flex-col" style={{ gap: 11, padding: '13px', background: '#0A0C0F5C', backdropFilter: 'blur(14px)', ...fadeReveal }}>
                <div className="flex items-start" style={{ gap: 10 }}>
                  <span className="flex items-center justify-center rounded-full" style={{ width: 28, height: 28, background: '#FFFFFF1F', flex: 'none' }}>
                    <Mountain size={15} style={{ color: '#fff' }} />
                  </span>
                  <div className="flex flex-col" style={{ gap: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{de ? 'W/kg — was am Berg zählt' : 'W/kg — what matters on climbs'}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#FFFFFFCC', lineHeight: 1.45 }}>
                      {de
                        ? 'Deine Leistung pro Kilogramm Körpergewicht. Am Anstieg entscheidet sie, wie schnell du hochkommst.'
                        : 'Your power per kilogram of body weight. On a climb it decides how fast you get to the top.'}
                    </span>
                  </div>
                </div>
                {/* W/kg tier ladder — where the rider sits */}
                {ftpWkg != null && (
                  <div className="flex flex-col" style={{ gap: 5 }}>
                    {wkgTiers.map((t, i) => {
                      const cur = i === curTierIdx
                      return (
                        <div key={t.label} className="flex items-center rounded-[9px]" style={{
                          gap: 8, padding: '6px 9px',
                          background: cur ? '#FFFFFF26' : 'transparent',
                          outline: cur ? '1px solid #FFFFFF4D' : 'none',
                        }}>
                          <span style={{ fontSize: 12, fontWeight: cur ? 800 : 600, color: cur ? '#fff' : '#FFFFFF99', flex: 1 }}>{t.label}</span>
                          {cur && <span style={{ fontSize: 11, fontWeight: 700, color: '#5EF0A8' }}>{de ? 'du' : 'you'} · {n1(ftpWkg)}</span>}
                          <span className={DISPLAY} style={{ fontSize: 11, fontWeight: 700, color: cur ? '#fff' : '#FFFFFF80' }}>{t.min > 0 ? `≥ ${n1(t.min)}` : `< 3.0`} W/kg</span>
                        </div>
                      )
                    })}
                    {phenType && (
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#FFFFFFCC', lineHeight: 1.4, marginTop: 2 }}>
                        {de ? 'Dein Fahrertyp: ' : 'Your rider type: '}
                        <span style={{ fontWeight: 700, color: '#fff' }}>{phenType}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {!motorTile && (
              <span style={{ fontSize: 10.5, fontWeight: 500, color: '#FFFFFF80' }}>
                {de ? 'FTP oder W/kg antippen — was die Zahlen bedeuten' : 'Tap FTP or W/kg — what the numbers mean'}
              </span>
            )}
          </div>

          {/* ═══ PROGRESS ═══ */}
          <SectionHeader tick={C.accent} title={de ? 'FORTSCHRITT' : 'PROGRESS'}
            sub={de ? `Was du aufgebaut hast · ${monthsSpan || DASH} Monate` : `What you've built · ${monthsSpan || DASH} months`} />

          {/* Season fitness curve (CTL) */}
          <Card>
            <div className="flex items-start justify-between" style={{ gap: 12 }}>
              <div className="flex flex-col" style={{ gap: 3 }}>
                <span className="eyebrow" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, color: C.tertiary }}>
                  {de ? 'SAISON-FITNESS' : 'SEASON FITNESS'}
                </span>
                <div className="flex items-end" style={{ gap: 8 }}>
                  <span className={DISPLAY} style={{ fontSize: 44, fontWeight: 700, color: C.ink, lineHeight: 1 }}>{ctlNow ?? DASH}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: C.tertiary, paddingBottom: 6 }}>
                    {ctlIsPeak ? (de ? 'Höchstwert des Jahres' : 'highest all year') : (de ? 'aktuell' : 'current')}
                  </span>
                </div>
              </div>
              {ctlGain != null && (
                <Pill color={ctlGain >= 0 ? C.recovery : C.move} bg={soft(ctlGain >= 0 ? C.recovery : C.move, 15)}>
                  {ctlGain >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                  {ctlGain >= 0 ? '+' : ''}{ctlGain} {de ? 'dieses Jahr' : 'this year'}
                </Pill>
              )}
            </div>
            {ctlYear.length >= 2 ? (
              <>
                {/* Plain-language explainer — what the curve actually is */}
                <span style={{ fontSize: 12.5, fontWeight: 500, color: C.ink2, lineHeight: 1.45 }}>
                  {de
                    ? 'Deine „Fitness“ ist deine rollende Trainingslast (CTL) — die Summe deines Trainings der letzten Wochen. Steigt sie, wächst dein Motor; fällt sie, baust du ab.'
                    : 'Your "fitness" is your rolling training load (CTL) — the sum of your training over recent weeks. Rising means your engine is growing; falling means you\'re detraining.'}
                </span>

                <SeasonFitnessChart
                  data={ctlYear}
                  fmtD={fmtD}
                  phases={[
                    { t: de ? 'Basis' : 'Base', c: C.strain },
                    { t: de ? 'Aufbau' : 'Build', c: C.accent },
                    { t: 'Peak', c: C.gold },
                  ]}
                />

                {/* Legend for the phase bands + scrub hint */}
                <div className="flex items-center justify-between" style={{ gap: 8 }}>
                  <div className="flex items-center" style={{ gap: 12, flexWrap: 'wrap' }}>
                    {[
                      { t: de ? 'Basis' : 'Base', c: C.strain },
                      { t: de ? 'Aufbau' : 'Build', c: C.accent },
                      { t: 'Peak', c: C.gold },
                    ].map((p) => (
                      <span key={p.t} className="inline-flex items-center" style={{ gap: 5 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: soft(p.c, 45) }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: C.ink2 }}>{p.t}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 500, color: C.tertiary }}>
                  {de ? 'Kurve antippen & ziehen für Wert und Datum' : 'Tap & drag the curve for the value and date'}
                </span>

                {/* One-line "what this means for you" read */}
                <span style={{ fontSize: 13, fontWeight: 500, color: C.ink2, lineHeight: 1.4 }}>
                  {ctlGain != null && ctlGain > 0
                    ? (de
                        ? `Deine Fitness ist seit Januar um ${ctlGain} Punkte gestiegen${ctlIsPeak ? ' — Höchststand der Saison.' : '.'}`
                        : `Your fitness is up ${ctlGain} points since January${ctlIsPeak ? ' — the highest of the season.' : '.'}`)
                    : ctlGain != null && ctlGain < 0
                      ? (de
                          ? `Deine Fitness liegt ${Math.abs(ctlGain)} Punkte unter Januar — eine ruhigere Phase.`
                          : `Your fitness is ${Math.abs(ctlGain)} points below January — a quieter stretch.`)
                      : (de
                          ? 'Deine Saison-Fitness aus der täglichen CTL-Historie.'
                          : 'Your season fitness, from the daily CTL history.')}
                </span>
              </>
            ) : (
              <span style={{ fontSize: 12, color: C.tertiary, padding: '20px 0' }}>
                {de ? 'Noch nicht genug Historie für die Saisonkurve' : 'Not enough history yet for the season curve'}
              </span>
            )}
          </Card>

          {/* What you built — gains rows */}
          <div className="rounded-[24px] flex flex-col" style={{ padding: '6px 20px', background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="flex items-end justify-between" style={{ padding: '14px 0' }}>
              <span className={DISPLAY} style={{ fontSize: 16, fontWeight: 600, color: C.ink }}>{de ? 'Was du aufgebaut hast' : 'What you built'}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: C.tertiary }}>{de ? 'seit Januar' : 'since January'}</span>
            </div>
            {(() => {
              const rows: {
                key: string; name: string; value: string
                spark: number[] | null; sparkColor: string
                delta: string | null; deltaGood: boolean
              }[] = [
                {
                  key: 'ftp', name: 'FTP', value: ftp != null ? `${ftp} W` : DASH,
                  spark: progWatts.length >= 2 ? progWatts : null, sparkColor: C.accent,
                  delta: ftpGainW != null ? `${ftpGainW >= 0 ? '+' : ''}${ftpGainW} W` : null, deltaGood: (ftpGainW ?? 0) >= 0,
                },
                {
                  key: 'wkg', name: de ? 'Leistung / Gewicht' : 'Power / weight', value: n1(ftpWkg) != null ? `${n1(ftpWkg)} W/kg` : DASH,
                  spark: progWatts.length >= 2 && weight ? progWatts.map((w) => w / weight) : null, sparkColor: C.recovery,
                  delta: wkgGain != null ? `${wkgGain >= 0 ? '+' : ''}${n1(wkgGain)}` : null, deltaGood: (wkgGain ?? 0) >= 0,
                },
                {
                  key: 'vo2', name: 'VO₂max',
                  value: vo2Sum?.latest != null ? `${n1(vo2Sum.latest)}` : DASH,
                  spark: vo2Vals.length >= 2 ? vo2Vals : null, sparkColor: C.violet,
                  delta: vo2Sum?.delta != null ? `${vo2Sum.delta >= 0 ? '+' : ''}${n1(vo2Sum.delta)}` : null,
                  deltaGood: (vo2Sum?.delta ?? 0) >= 0,
                },
                {
                  key: 'p20', name: de ? '20-Min-Leistung' : '20-min power',
                  value: (p20Sum?.latest ?? ppv?.curve?.find((c) => c.seconds === 1200)?.watts) != null
                    ? `${p20Sum?.latest ?? ppv!.curve!.find((c) => c.seconds === 1200)!.watts} W` : DASH,
                  spark: p20Vals.length >= 2 ? p20Vals : null, sparkColor: C.strain,
                  delta: p20Sum?.delta != null ? `${p20Sum.delta >= 0 ? '+' : ''}${p20Sum.delta} W` : null,
                  deltaGood: (p20Sum?.delta ?? 0) >= 0,
                },
                {
                  key: 'wt', name: de ? 'Gewicht' : 'Weight',
                  value: (wtSum?.latest ?? n1(weight)) != null ? `${n1(wtSum?.latest ?? weight)} kg` : DASH,
                  spark: wtVals.length >= 2 ? wtVals : null, sparkColor: C.gold,
                  // Lower weight is the good direction.
                  delta: wtSum?.delta != null ? `${wtSum.delta >= 0 ? '+' : ''}${n1(wtSum.delta)} kg` : null,
                  deltaGood: (wtSum?.delta ?? 0) <= 0,
                },
                {
                  key: 'dur', name: de ? 'Ausdauer-Abfall' : 'Durability drop',
                  value: durabilityPct != null ? `${durabilityPct < 0 ? '−' : '+'}${Math.abs(n1(durabilityPct)!)}%` : DASH,
                  spark: null, sparkColor: C.move, delta: null, deltaGood: true,
                },
              ]
              return rows.map((r, i) => (
                <div key={r.key}>
                  {i > 0 && <div style={{ height: 1, background: C.border }} />}
                  <div className="flex items-center" style={{ gap: 12, padding: '12px 0' }}>
                    <div className="flex flex-col" style={{ gap: 2, width: 104, flex: 'none' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{r.name}</span>
                      <span className={DISPLAY} style={{ fontSize: 15, fontWeight: 700, color: C.ink2 }}>{r.value}</span>
                    </div>
                    <div className="relative" style={{ flex: 1, height: 26 }}>
                      {r.spark ? (
                        <svg viewBox="0 0 120 26" preserveAspectRatio="none" style={{ width: '100%', height: 26 }} aria-hidden>
                          <polyline points={sparkPoints(r.spark)} fill="none" stroke={r.sparkColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : null}
                    </div>
                    {r.delta != null ? (
                      <span className="rounded-full text-center flex-none" style={{ padding: '4px 9px', fontSize: 11, fontWeight: 700, color: r.deltaGood ? C.recovery : C.move, background: soft(r.deltaGood ? C.recovery : C.move, 15) }}>{r.delta}</span>
                    ) : (
                      <span className="text-center flex-none" style={{ padding: '4px 9px', fontSize: 11, fontWeight: 700, color: C.tertiary }}>{DASH}</span>
                    )}
                  </div>
                </div>
              ))
            })()}
          </div>

          {/* Then vs Now */}
          {firstFtp != null && curFtp != null && ftpGainW != null && (
            <Card gap={14}>
              <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: C.ink2 }}>
                {de ? 'JANUAR-DU → JETZT' : 'JANUARY YOU → NOW'}
              </span>
              <div className="flex items-center" style={{ gap: 12 }}>
                <div className="flex-1 flex flex-col items-center rounded-[16px]" style={{ gap: 3, padding: 14, background: C.surface2 }}>
                  <span className="eyebrow" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: C.tertiary }}>{(de ? prog[0].month_de : prog[0].month_en).toUpperCase()}</span>
                  <span className={DISPLAY} style={{ fontSize: 24, fontWeight: 700, color: C.ink2 }}>{Math.round(firstFtp)} W</span>
                  {firstWkg != null && <span style={{ fontSize: 11, color: C.tertiary }}>{n1(firstWkg)} W/kg</span>}
                </div>
                <div className="flex flex-col items-center" style={{ gap: 2, flex: 'none' }}>
                  <TrendingUp size={20} style={{ color: C.recovery }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.recovery }}>{ftpGainW >= 0 ? '+' : ''}{ftpGainW} W</span>
                  {wkgGain != null && <span style={{ fontSize: 11, fontWeight: 700, color: C.recovery }}>{wkgGain >= 0 ? '+' : ''}{n1(wkgGain)}</span>}
                </div>
                <div className="flex-1 flex flex-col items-center rounded-[16px]" style={{ gap: 3, padding: 14, background: soft(C.accent, 15), border: `1px solid ${C.accent}`, boxShadow: '0 4px 18px -2px #FF5A3C4D' }}>
                  <span className="eyebrow" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: C.accent }}>{de ? 'JETZT' : 'NOW'}</span>
                  <span className={DISPLAY} style={{ fontSize: 24, fontWeight: 700, color: C.ink }}>{Math.round(curFtp)} W</span>
                  {curWkg != null && <span style={{ fontSize: 11, color: C.ink2 }}>{n1(curWkg)} W/kg</span>}
                </div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 500, color: C.ink2, lineHeight: 1.4 }}>
                {de
                  ? `+${ftpGainW} W seit Januar. Am Berg fährst du dem Januar-Ich davon.`
                  : `+${ftpGainW} W since January. The January you gets dropped on every climb.`}
              </span>
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    const txt = de ? `+${ftpGainW} W FTP seit Januar` : `+${ftpGainW} W FTP since January`
                    if (typeof navigator !== 'undefined' && navigator.share) navigator.share({ text: txt }).catch(() => {})
                  }}
                  className="inline-flex items-center rounded-full"
                  style={{ gap: 6, padding: '8px 14px', background: C.surface2, border: 0, color: C.ink, fontSize: 12, fontWeight: 700 }}>
                  <Share2 size={14} /> {de ? 'Teilen' : 'Share this'}
                </button>
              </div>
            </Card>
          )}

          {/* Power Profile link */}
          <button onClick={() => navigate('/power-profile')}
            className="rounded-[24px] flex items-center text-left w-full"
            style={{ gap: 12, padding: '14px 18px', background: C.surface, border: `1px solid ${C.border}` }}>
            <span className="flex items-center justify-center rounded-full" style={{ width: 40, height: 40, background: soft(C.accent, 15), flex: 'none' }}>
              <Gauge size={20} style={{ color: C.accent }} />
            </span>
            <div className="flex flex-col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{de ? 'Leistungsprofil' : 'Power Profile'}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: C.ink2 }}>
                {de ? 'Alle Bestwerte, Kurve, Zonen & Benchmarks' : 'All power bests, curve, zones & benchmarks live here'}
              </span>
            </div>
            <ChevronRight size={20} style={{ color: C.tertiary, flex: 'none' }} />
          </button>

          {/* ═══ SEASON WINS ═══ */}
          <SectionHeader tick={C.gold} title={de ? 'SAISON-SIEGE' : 'SEASON WINS'}
            sub={de ? 'Die Meilensteine, die du geknackt hast' : 'The milestones you unlocked'} />

          <div className="rounded-[24px] flex flex-col" style={{ gap: 8, padding: 14, background: C.surface, border: `1px solid ${C.border}` }}>
            {milestones.length ? milestones.map((m) => (
              <div key={m.key} className="flex items-center rounded-[14px]" style={{
                gap: 12, padding: '10px 12px',
                background: m.highlight ? soft(C.gold, 15) : 'transparent',
                border: m.highlight ? `1px solid ${soft(C.gold, 35)}` : '1px solid transparent',
              }}>
                <span className="flex items-center justify-center rounded-full" style={{ width: 38, height: 38, background: m.iconBg, flex: 'none' }}>{m.icon}</span>
                <div className="flex flex-col" style={{ gap: 1, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{m.title}</span>
                  {m.date && <span style={{ fontSize: 11, fontWeight: 500, color: C.tertiary }}>{m.date}</span>}
                </div>
                <span className={DISPLAY} style={{ fontSize: 16, fontWeight: 700, color: m.highlight ? C.gold : C.ink, flex: 'none' }}>{m.value}</span>
              </div>
            )) : (
              <span style={{ fontSize: 12, color: C.tertiary, padding: '14px 4px' }}>
                {de ? 'Noch keine Meilensteine erfasst in dieser Saison' : 'No milestones logged yet this season'}
              </span>
            )}
          </div>

          {/* ═══ DURABILITY ═══ */}
          <SectionHeader tick={C.accent} title={de ? 'AUSDAUER' : 'DURABILITY'}
            sub={de ? 'Leistung halten, wenn müde — der Profi-Unterschied' : 'Holding power when tired — the pro differentiator'} />

          {(() => {
            const duraDeveloped = durabilityPct != null || hasDuraTrend
            return (
          <div className="rounded-[24px] flex flex-col" style={{ gap: 14, padding: 20, background: duraDeveloped ? DURA_BG : C.surface, border: `1px solid ${duraDeveloped ? '#FFFFFF1F' : C.border}` }}>
            <div className="flex items-center justify-between" style={{ gap: 12 }}>
              <div className="flex flex-col" style={{ gap: 2 }}>
                <span className={DISPLAY} style={{ fontSize: 16, fontWeight: 600, color: duraDeveloped ? '#fff' : C.ink }}>{de ? 'Ausdauer' : 'Durability'}</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: duraDeveloped ? '#FFFFFFCC' : C.ink2 }}>
                  {de ? 'Wie deine Leistung tief im Ritt hält' : 'How your power holds deep into a ride'}
                </span>
              </div>
              {durabilityPct != null && (
                <Pill color={C.recovery} bg={soft(C.recovery, 15)}>
                  {Math.abs(durabilityPct) <= 5 ? (de ? 'Stark' : 'Strong') : Math.abs(durabilityPct) <= 10 ? (de ? 'Solide' : 'Solid') : (de ? 'Im Aufbau' : 'Building')}
                </Pill>
              )}
            </div>
            {durabilityPct != null && (
              <>
                <div className="flex items-end" style={{ gap: 10 }}>
                  <span className={DISPLAY} style={{ fontSize: 40, fontWeight: 800, color: '#fff', lineHeight: 1 }}>
                    {durabilityPct < 0 ? '−' : '+'}{Math.abs(n1(durabilityPct)!)}%
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#FFFFFFCC', paddingBottom: 5 }}>
                    {de ? 'nach 1.500 kJ' : 'after 1,500 kJ'}
                  </span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#FFFFFFD9', lineHeight: 1.4 }}>
                  {decouplingPct != null
                    ? (de
                        ? `Dein Leistungsabfall über lange Fahrten. Entkopplung im Schnitt ${n1(decouplingPct)}% — je niedriger, desto besser hältst du.`
                        : `Your power fade over long rides. Average decoupling ${n1(decouplingPct)}% — the lower, the deeper you hold.`)
                    : (de
                        ? 'Dein Leistungsabfall über lange Fahrten — je niedriger, desto besser hältst du die Wattzahl.'
                        : 'Your power fade over long rides — the lower, the deeper you hold your watts.')}
                </span>
              </>
            )}
            {/* Season decoupling trend — a REAL monthly series (activity_stream
                .decoupling_pct), lower = holds power deeper. Replaces the pen's
                fabricated You/Jan/Elite fade chart with the athlete's own data. */}
            {hasDuraTrend ? (
              <div className="flex flex-col" style={{ gap: 10, paddingTop: durabilityPct != null ? 6 : 0, borderTop: durabilityPct != null ? '1px solid #FFFFFF1F' : undefined }}>
                <div className="flex items-center justify-between">
                  <span className="eyebrow" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, color: '#FFFFFFB3' }}>
                    {de ? 'ENTKOPPLUNG · SAISON' : 'DECOUPLING · SEASON'}
                  </span>
                  {duraSum?.delta != null && (
                    <span className="inline-flex items-center rounded-full" style={{ gap: 5, padding: '5px 10px', fontSize: 11, fontWeight: 700, color: '#fff', background: '#0A0C0F59' }}>
                      {duraSum.delta <= 0 ? <TrendingDown size={13} style={{ color: '#5EF0A8' }} /> : <TrendingUp size={13} style={{ color: '#FFB86B' }} />}
                      {duraSum.delta >= 0 ? '+' : ''}{n1(duraSum.delta)}% {de ? 'seit Jan.' : 'since Jan'}
                    </span>
                  )}
                </div>
                <div className="relative rounded-[12px] overflow-hidden" style={{ height: 96, background: '#0A0C0F40' }}>
                  {(() => {
                    const vals = duraTrend.map((d) => d.v)
                    const W = 300, H = 96
                    const pts = sparkPoints(vals, W, H, 14)
                    const area = `0,${H} ${pts} ${W},${H}`
                    return (
                      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0" style={{ width: '100%', height: '100%' }} aria-hidden>
                        <defs>
                          <linearGradient id="duraFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.30" />
                            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.02" />
                          </linearGradient>
                        </defs>
                        <polygon points={area} fill="url(#duraFill)" />
                        <polyline points={pts} fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                        {(() => {
                          const lo = Math.min(...vals), hi = Math.max(...vals)
                          const span = Math.max(1e-6, hi - lo)
                          const cx = W, cy = H - 14 - ((vals[vals.length - 1] - lo) / span) * (H - 28)
                          return <circle cx={cx - 3} cy={cy} r={3.5} fill="#fff" />
                        })()}
                      </svg>
                    )
                  })()}
                </div>
                <div className="flex">
                  {duraTrend.map((d, i) => (
                    <span key={i} className="flex-1 text-center" style={{ fontSize: 10, fontWeight: 600, color: '#FFFFFF99' }}>{d.label}</span>
                  ))}
                </div>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#FFFFFFCC', lineHeight: 1.4 }}>
                  {de
                    ? `Monatliche Herz-Leistungs-Entkopplung deiner Fahrten — zuletzt ${n1(duraSum?.latest ?? 0)}%. Je niedriger, desto besser hältst du die Leistung.`
                    : `Monthly heart-rate-to-power decoupling across your rides — latest ${n1(duraSum?.latest ?? 0)}%. Lower means your power holds deeper into the ride.`}
                </span>
              </div>
            ) : durabilityPct == null ? (
              <span style={{ fontSize: 12, color: C.tertiary, padding: '8px 0' }}>
                {de ? 'Braucht mehr lange Fahrten (>1.500 kJ), um die Ausdauer zu messen.' : 'Needs more long rides (>1,500 kJ) to measure durability.'}
              </span>
            ) : null}
          </div>
            )
          })()}

          {/* ═══ PROJECTION ═══ */}
          <SectionHeader tick={C.strain} title={de ? 'PROGNOSE' : 'PROJECTION'}
            sub={de ? 'Wohin es geht · Modellprognose' : "Where you're headed · model forecast"} />

          {/* FTP / performance forecast */}
          <Card>
            <div className="flex items-start justify-between" style={{ gap: 12 }}>
              <div className="flex flex-col" style={{ gap: 2 }}>
                <span className={DISPLAY} style={{ fontSize: 16, fontWeight: 600, color: C.ink }}>
                  {proj?.metric_label ?? (de ? 'Prognose' : 'Forecast')}
                </span>
                <span style={{ fontSize: 12, fontWeight: 500, color: C.ink2 }}>
                  {de ? 'Projizierter Verlauf · nächste 90 Tage' : 'Projected trend · next 90 days'}
                </span>
              </div>
              <div className="flex items-center" style={{ gap: 10 }}>
                <span className="inline-flex items-center" style={{ gap: 4 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: C.accent }} />
                  <span style={{ fontSize: 11, fontWeight: 500, color: C.tertiary }}>{de ? 'Aktuell' : 'Actual'}</span>
                </span>
                <span className="inline-flex items-center" style={{ gap: 4 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, border: `1.5px solid ${C.accent}` }} />
                  <span style={{ fontSize: 11, fontWeight: 500, color: C.tertiary }}>{de ? 'Prognose' : 'Projected'}</span>
                </span>
              </div>
            </div>
            {projPerf && forecastBars.length >= 2 ? (
              <>
                <div className="flex items-end" style={{ gap: 10, height: 172 }}>
                  {(() => {
                    const mx = Math.max(...forecastBars.map((b) => b.value), 1)
                    return forecastBars.map((b, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end" style={{ gap: 6, height: '100%' }}>
                        <span className={DISPLAY} style={{ fontSize: 11, fontWeight: 700, color: b.projected ? C.accent : C.accent }}>{b.value}</span>
                        <span className="w-full" style={{
                          height: Math.max(20, (b.value / mx) * 140),
                          borderRadius: 6,
                          background: b.projected ? soft(C.accent, 15) : C.accent,
                          border: b.projected ? `1.5px solid ${C.accent}` : undefined,
                        }} />
                      </div>
                    ))
                  })()}
                </div>
                <div className="flex" style={{ gap: 10 }}>
                  {forecastBars.map((b, i) => (
                    <span key={i} className="flex-1 text-center" style={{ fontSize: 10, fontWeight: b.projected ? 500 : 700, color: b.projected ? C.tertiary : C.accent }}>{b.label}</span>
                  ))}
                </div>
                <div className="flex items-center rounded-[16px]" style={{ gap: 12, padding: 14, background: '#0A0C0FB3', border: `1px solid ${soft(C.strain, 20)}` }}>
                  <span className="flex items-center justify-center rounded-full" style={{ width: 38, height: 38, background: C.strain, flex: 'none' }}>
                    <Activity size={20} style={{ color: '#fff' }} />
                  </span>
                  <div className="flex flex-col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                    <span className={DISPLAY} style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>
                      {de ? 'Projizierte' : 'Projected'} {proj?.metric_label ?? 'FTP'} {projCentral ?? DASH} {proj?.unit ?? 'W'}
                    </span>
                    <span style={{ fontSize: 12, color: C.ink2 }}>
                      {projHorizonLabel ? `${de ? 'bis' : 'by'} ${projHorizonLabel} · ` : ''}{de ? 'wenn du dranbleibst' : 'if you hold ramp'}
                    </span>
                  </div>
                  {projDelta != null && (
                    <Pill color={C.recovery} bg={soft(C.recovery, 15)}>
                      <ArrowUp size={12} /> {projDelta >= 0 ? '+' : ''}{projDelta} {proj?.unit ?? 'W'}
                    </Pill>
                  )}
                </div>
              </>
            ) : (
              <span style={{ fontSize: 12, color: C.tertiary, padding: '16px 0' }}>
                {de
                  ? 'Noch keine belastbare Leistungsprognose — braucht mehr Trainingshistorie.'
                  : 'No reliable performance forecast yet — needs more training history.'}
              </span>
            )}
          </Card>

          {/* Event prediction — honest CTL-toward-event readout (no finish-time source) */}
          {eventName && (
            <Card>
              <div className="flex items-center" style={{ gap: 12 }}>
                <span className="flex items-center justify-center rounded-[12px]" style={{ width: 40, height: 40, background: C.surface2, flex: 'none' }}>
                  <Flag size={20} style={{ color: C.amber }} />
                </span>
                <div className="flex flex-col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                  <span className={DISPLAY} style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{eventName}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: C.tertiary }}>
                    {eventDate ? fmtD(eventDate, { en: 'MMM d', de: 'd. MMM' }) : DASH}
                    {eventTypeRaw ? ` · ${eventTypeRaw}` : ''}
                    {daysToGoal != null ? ` · ${daysToGoal} ${de ? 'Tage' : 'days'}` : ''}
                  </span>
                </div>
              </div>
              {projectionValid ? (
                <div className="flex items-center justify-between rounded-[16px]" style={{ padding: 16, background: C.surface2 }}>
                  <div className="flex flex-col" style={{ gap: 3 }}>
                    <span className="eyebrow" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, color: C.tertiary }}>{de ? 'HEUTE' : 'CURRENT'}</span>
                    <span className={DISPLAY} style={{ fontSize: 22, fontWeight: 700, color: C.ink2 }}>CTL {traj?.ctl_now != null ? Math.round(traj.ctl_now) : DASH}</span>
                  </div>
                  <ArrowRight size={20} style={{ color: C.tertiary }} />
                  <div className="flex flex-col items-end" style={{ gap: 3 }}>
                    <span className="eyebrow" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, color: C.accent }}>{de ? 'RENNTAG' : 'RACE DAY'}</span>
                    <span className={DISPLAY} style={{ fontSize: 22, fontWeight: 700, color: C.ink }}>CTL {traj?.ctl_projected_at_goal != null ? Math.round(traj.ctl_projected_at_goal) : DASH}</span>
                  </div>
                  {traj?.ctl_now != null && traj?.ctl_projected_at_goal != null && (
                    <Pill color={C.recovery} bg={soft(C.recovery, 15)}>
                      <TrendingUp size={12} /> {Math.round(traj.ctl_projected_at_goal - traj.ctl_now) >= 0 ? '+' : ''}{Math.round(traj.ctl_projected_at_goal - traj.ctl_now)}
                    </Pill>
                  )}
                </div>
              ) : (
                <span style={{ fontSize: 12, color: C.tertiary, padding: '4px 0' }}>
                  {de ? 'Renntag-Prognose noch nicht belastbar — braucht einen aktiven Plan.' : 'Race-day projection not reliable yet — needs an active plan.'}
                </span>
              )}
            </Card>
          )}

        </div>
      </div>
      <MobileBottomNav />
    </div>
  )
}
