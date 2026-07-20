/**
 * WorkoutDetailView — rebuilt 1:1 from Pencil "Screen · Workout Detail".
 * NavRow (back · title · share) → Hero (icon, title, sub, 4 summary chips) →
 * Interval Profile chart card → Structure steps card → Targets card →
 * Fueling card → Devices card → Edit affordance (no start CTA — the app cannot execute workouts). Reached from the
 * Today / Train workout cards at /workout/today and /workout/:date.
 * TODAY renders the real prescribed-workout blocks (ResolvedBlock[]) from the
 * coach brief (rich "why today" narrative). A FUTURE planned day resolves that
 * day's session from the weekly plan (useCurrentWeek) and renders the SAME
 * layout, mapping its DayPlan/intervals into the identical block visualization.
 */
import { useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format, parseISO, differenceInCalendarWeeks } from 'date-fns'
import {
  ChevronLeft, Share2, Bike, Footprints, Dumbbell, Repeat, Zap, Heart, Gauge, Apple, Droplet,
  SlidersHorizontal, Sparkles, Target, BookOpen,
} from 'lucide-react'
import { formatDate } from '../utils/format'
import { useCoachBrief } from '../hooks/useCoachBrief'
import { useAthleteProfile } from '../hooks/useAthleteProfile'
import { useCurrentWeek } from '../hooks/useCurrentWeek'
import { useLocale } from '../contexts/LocaleContext'
import { detectWorkoutSport } from '../api/coach'
import type { ResolvedBlock, PrescribedWorkout, WorkoutSport } from '../api/coach'
import type { DayPlan } from '../api/weeks'

// Per-sport hero identity.
const SPORT_META: Record<WorkoutSport, { Icon: typeof Bike; en: string; de: string }> = {
  cycling: { Icon: Bike, en: 'Bike', de: 'Rad' },
  running: { Icon: Footprints, en: 'Run', de: 'Lauf' },
  gym: { Icon: Dumbbell, en: 'Strength', de: 'Kraft' },
}
// Running pace zones as %threshold-pace (speed) — used to derive a pace target
// for a run block from its zone when a threshold pace is known. Never fabricated.
const RUN_PACE_FRAC: Record<number, [number, number]> = {
  1: [0, 0.76], 2: [0.76, 0.87], 3: [0.87, 0.94], 4: [0.94, 1.00], 5: [1.00, 1.06], 6: [1.06, 1.12], 7: [1.12, 1.20],
}
const fmtPace = (sPerKm: number) => `${Math.floor(sPerKm / 60)}:${String(Math.round(sPerKm % 60)).padStart(2, '0')}`

// ── token helpers ───────────────────────────────────────────────────────────
const cardStyle = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const
const innerStyle = { background: 'var(--color-surface-2)' } as const
const chipStyle = { background: 'var(--color-paper)', border: '1px solid var(--color-rule)' } as const
const zoneColor = (z: number) => `var(--color-zone-${Math.min(7, Math.max(1, z))})`

function fmtMMSS(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

// Group consecutive identical effort/rest blocks into "N× …" steps.
function groupBlocks(blocks: ResolvedBlock[]) {
  const groups: Array<{ block: ResolvedBlock; count: number }> = []
  for (const b of blocks) {
    const last = groups[groups.length - 1]
    if (last && last.block.name === b.name && last.block.target_watts_low === b.target_watts_low && last.block.duration_s === b.duration_s) last.count++
    else groups.push({ block: b, count: 1 })
  }
  return groups
}

// ── derived summaries from real blocks ───────────────────────────────────────
function summarize(w: PrescribedWorkout) {
  const blocks = w.blocks ?? []
  const totalS = w.total_duration_s ?? blocks.reduce((a, b) => a + b.duration_s, 0) ?? w.duration_minutes * 60
  const minutes = w.duration_minutes || Math.round(totalS / 60)
  // main = highest-zone block (tie → highest %FTP) — drives hero/targets.
  const main = blocks.reduce<ResolvedBlock | null>((best, b) => {
    if (!best) return b
    if (b.zone > best.zone) return b
    if (b.zone === best.zone && b.target_pct_ftp > best.target_pct_ftp) return b
    return best
  }, null)
  const peakPct = blocks.reduce((m, b) => Math.max(m, b.target_pct_ftp || 0), 0)
  // kJ ≈ Σ avg-watts × seconds / 1000 — a real estimate, 0 → unknown.
  const kj = blocks.reduce((a, b) => {
    const avg = b.target_watts_high > 0 ? (b.target_watts_low + b.target_watts_high) / 2 : 0
    return a + avg * b.duration_s
  }, 0) / 1000
  const zones = Array.from(new Set(blocks.map((b) => Math.min(7, Math.max(1, b.zone))))).sort((a, b) => a - b)
  return { blocks, totalS, minutes, main, peakPct, kj: Math.round(kj), zones }
}

// ── Future-day mapping: DayPlan → PrescribedWorkout ──────────────────────────
// A planned week day carries interval blocks (duration + %FTP + zone) but no
// resolved watts/names/RPE. We derive those the same way the today path does:
// watts from the athlete FTP, a zone-labeled name, and a zone-approximated RPE —
// so the identical block/interval visualization renders from real plan data.
const ZONE_NAME: Record<number, { en: string; de: string }> = {
  1: { en: 'Recovery', de: 'Erholung' },
  2: { en: 'Endurance', de: 'Grundlage' },
  3: { en: 'Tempo', de: 'Tempo' },
  4: { en: 'Threshold', de: 'Schwelle' },
  5: { en: 'VO₂ Max', de: 'VO₂max' },
  6: { en: 'Anaerobic', de: 'Anaerob' },
  7: { en: 'Neuromuscular', de: 'Neuromuskulär' },
}
const RPE_BY_ZONE: Record<number, number> = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 7, 6: 8, 7: 10 }

function dayHasSession(d: DayPlan): boolean {
  const dur = d.duration_seconds_target ?? (d.intervals ?? []).reduce((s, iv) => s + (iv.duration_seconds ?? 0), 0)
  return d.category !== 'rest' && (dur > 0 || (d.intervals?.length ?? 0) > 0 || (d.target_tss ?? 0) > 0)
}

function mapDayToWorkout(d: DayPlan, ftp: number | null, de: boolean): PrescribedWorkout {
  const blocks: ResolvedBlock[] = (d.intervals ?? []).map((iv) => {
    const z = Math.min(7, Math.max(1, iv.zone))
    const pct = iv.power_target_pct_ftp ?? 0
    const watts = ftp != null && pct > 0 ? Math.round(pct * ftp) : 0
    return {
      name: de ? ZONE_NAME[z].de : ZONE_NAME[z].en,
      duration_s: iv.duration_seconds ?? 0,
      target_watts_low: watts,
      target_watts_high: watts,
      target_pct_ftp: pct,
      zone: z,
      rpe: RPE_BY_ZONE[z] ?? 4,
      cadence_low: null,
      cadence_high: null,
      target_hr_low: null,
      target_hr_high: null,
    }
  })
  const totalS = d.duration_seconds_target ?? blocks.reduce((s, b) => s + b.duration_s, 0)
  return {
    template_id: d.template_id ?? '',
    title: d.title,
    duration_minutes: Math.round(totalS / 60),
    total_duration_s: totalS,
    predicted_tss: d.target_tss ?? 0,
    framework_cited: '',
    purpose: null,
    category: d.category,
    blocks,
    why_this_workout: d.rationale || null,
  }
}

export default function WorkoutDetailView() {
  const navigate = useNavigate()
  const { locale } = useLocale()
  const de = locale === 'de'
  const { date: dateParam } = useParams<{ date?: string }>()
  // Resolve the target day. "today" (or the /workout/today alias, i.e. no param)
  // maps to today's date; any other param is a literal YYYY-MM-DD planned day.
  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), [])
  const targetDate = !dateParam || dateParam === 'today' ? todayStr : dateParam
  const isToday = targetDate === todayStr
  // Week offset from today's Monday-week to the target date's Monday-week (0..12).
  const weekOffset = useMemo(() => {
    if (isToday) return 0
    try {
      return Math.min(12, Math.max(0, differenceInCalendarWeeks(parseISO(targetDate), new Date(), { weekStartsOn: 1 })))
    } catch { return 0 }
  }, [isToday, targetDate])

  // Always open at the very top (re-scroll when navigating between days).
  useEffect(() => { window.scrollTo(0, 0) }, [targetDate])
  const { data: brief } = useCoachBrief()
  const { data: profile } = useAthleteProfile()
  const { data: week } = useCurrentWeek(weekOffset)
  const ftp = profile?.ftp_watts ?? null

  // Today → the coach brief's rich prescribed workout. A future day → its planned
  // session from the weekly plan, mapped into the same PrescribedWorkout shape.
  const dayPlan = useMemo(() => (isToday ? null : week?.days?.find((d) => d.date === targetDate) ?? null), [isToday, week, targetDate])
  const w: PrescribedWorkout | null = useMemo(() => {
    if (isToday) return brief?.prescribed_workout ?? null
    if (dayPlan && dayHasSession(dayPlan)) return mapDayToWorkout(dayPlan, ftp, de)
    return null
  }, [isToday, brief, dayPlan, ftp, de])

  // Sport — future days carry an explicit sport; today's is inferred from the brief.
  const sport: WorkoutSport = isToday
    ? (w ? detectWorkoutSport(w) : 'cycling')
    : ((dayPlan?.sport as WorkoutSport) ?? 'cycling')
  const sportMeta = SPORT_META[sport] ?? SPORT_META.cycling
  const thrPaceSPerKm = profile?.running_threshold_pace_ms ? 1000 / profile.running_threshold_pace_ms : null
  const groups = useMemo(() => (w ? groupBlocks(w.blocks) : []), [w])
  const s = useMemo(() => (w ? summarize(w) : null), [w])
  // Intensity terrain from the real interval blocks (x=time, y=effort). Declared
  // BEFORE any early return (derives blocks from `s` with a null guard) so hook
  // order never changes between the loading and loaded renders (React #310).
  const terrain = useMemo(() => {
    const blocks = s?.blocks ?? []
    if (!blocks.length) return { area: '', line: '' }
    const total = blocks.reduce((a, b) => a + b.duration_s, 0) || 1
    let x = 0
    const pts: Array<[number, number]> = []
    for (const b of blocks) {
      const bw = (b.duration_s / total) * 400
      const eff = b.target_pct_ftp > 0 ? b.target_pct_ftp / 1.35 : b.zone / 7
      const y = 120 - Math.min(114, Math.max(10, eff * 114))
      pts.push([x, y]); pts.push([x + bw, y]); x += bw
    }
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
    return { area: `${line} L400 120 L0 120 Z`, line }
  }, [s])
  // "Why today & goal" inputs — the coach's real rationale + the target event.
  // Adaptations are a live "now" concept, so they only apply to today.
  const evidence = (brief?.evidence as Record<string, unknown> | undefined) ?? {}
  const athlete = evidence.athlete as Record<string, unknown> | undefined
  const goalName = athlete?.goal_target as string | undefined
  const daysToGoal = athlete?.days_to_goal as number | undefined
  const adaptSummary = isToday ? (brief as { adaptations?: { summary?: string } } | undefined)?.adaptations?.summary : undefined

  const t = {
    title: de ? 'Workout' : 'Workout',
    none: de ? 'Keine Einheit für heute.' : 'No workout for today.',
    profile: de ? 'INTERVALLPROFIL' : 'INTERVAL PROFILE',
    structure: de ? 'STRUKTUR' : 'STRUCTURE',
    targets: de ? 'ZIELWERTE' : 'TARGETS',
    fueling: de ? 'VERPFLEGUNG' : 'FUELING',
    devices: de ? 'GERÄTE' : 'DEVICES',
    steps: (n: number, m: number) => (de ? `${n} Schritte · ${m} min` : `${n} steps · ${m} min`),
    forEffort: (m: number) => (de ? `für ${m} min Einheit` : `for ${m} min effort`),
    carbs: de ? 'Kohlenhydrate / Std' : 'carbs / hr',
    fluid: de ? 'Flüssigkeit / Std' : 'fluid / hr',
    estimate: de ? 'geschätzt' : 'estimate',
    power: de ? 'Leistung' : 'Power',
    pace: 'Pace',
    cadence: de ? 'Trittfrequenz' : 'Cadence',
    reps: de ? 'Wdh.' : 'Reps',
    load: de ? 'Last' : 'Load',
    rpe: 'RPE',
    moves: de ? 'Übungen' : 'Movements',
    paired: de ? '3 verbunden' : '3 paired',
    send: de ? 'An Head Unit senden' : 'Send to head unit',
    edit: de ? 'Einheit bearbeiten' : 'Edit workout',
    dPower: de ? 'Leistung' : 'Power',
    dHr: de ? 'HR-Gurt' : 'HR Strap',
    dHead: de ? 'Head Unit' : 'Head Unit',
  }

  // ── NavRow (shared across states) ──────────────────────────────────────────
  const nav = (
    <div className="flex items-center justify-between px-4 py-1.5">
      <button type="button" onClick={() => navigate(-1)} aria-label={de ? 'Zurück' : 'Back'} className="grid place-items-center rounded-full" style={{ width: 40, height: 40, ...chipStyle }}>
        <ChevronLeft size={24} style={{ color: 'var(--color-ink)' }} />
      </button>
      <span className="num-display" style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-ink)' }}>{t.title}</span>
      <button type="button" aria-label={de ? 'Teilen' : 'Share'} className="grid place-items-center rounded-full" style={{ width: 40, height: 40, ...chipStyle }}>
        <Share2 size={20} style={{ color: 'var(--color-ink)' }} />
      </button>
    </div>
  )

  if (!w || !s) {
    // Honest, date-aware empty state: today with no brief, or a planned rest /
    // no-session day. A rest day (or content-less day) reads as recovery.
    const isRest = !isToday && (!dayPlan || dayPlan.category === 'rest' || !dayHasSession(dayPlan))
    const dLabel = isToday ? null : formatDate(parseISO(targetDate), de ? 'EEEE, d. MMM' : 'EEEE, MMM d', locale)
    const msg = isToday
      ? t.none
      : isRest
        ? (de ? 'Ruhetag — Erholung & Regeneration. Keine Einheit geplant.' : 'Rest day — recovery & regeneration. No session planned.')
        : (de ? 'Keine Einheit für diesen Tag.' : 'No session for this day.')
    return (
      <div className="min-h-screen" style={{ background: 'var(--color-paper)' }}>
        <div className="mx-auto w-full max-w-md">{nav}</div>
        <div className="grid place-items-center py-24 px-6 text-center">
          <div className="flex flex-col items-center gap-2">
            {dLabel && <span className="eyebrow" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-muted)' }}>{dLabel.toUpperCase()}</span>}
            <p style={{ color: 'var(--color-ink-2)' }}>{msg}</p>
          </div>
        </div>
      </div>
    )
  }

  const { blocks, totalS, minutes, main, peakPct, kj, zones } = s
  const gPerHr = minutes >= 150 ? 90 : 60
  const chartMax = Math.max(120, peakPct * 100)
  const PLOT_H = 150

  // targets — main block, graceful "—" where sensor data is unavailable.
  const powerVal = main && main.target_watts_high > 0
    ? (main.target_watts_low === main.target_watts_high ? `${main.target_watts_low}` : `${main.target_watts_low}–${main.target_watts_high}`)
    : '—'
  const hrVal = main && main.target_hr_low != null && main.target_hr_high != null ? `${main.target_hr_low}–${main.target_hr_high}` : '—'
  const cadVal = main && main.cadence_low != null && main.cadence_high != null ? `${main.cadence_low}–${main.cadence_high}` : '—'

  // Run pace target for the main block: %threshold-pace band → pace (only when a
  // real threshold pace is known; never fabricated).
  const runPace = (() => {
    if (sport !== 'running' || !main || !thrPaceSPerKm) return null
    const band = RUN_PACE_FRAC[main.zone]
    if (!band) return null
    const mid = (band[0] + band[1]) / 2 || 1
    return `${fmtPace(thrPaceSPerKm / mid)}/km`
  })()

  // ── Generated header art (in the .pen style, adapted to sport + intensity) ──
  const sportColor = sport === 'running' ? 'var(--color-exercise)' : sport === 'gym' ? 'var(--color-amber)' : 'var(--color-strain)'
  // Intensity accent: higher peak %FTP/zone → warmer (coral); easy → cool.
  const intensity = Math.min(1, peakPct > 0 ? peakPct / 1.2 : (main?.zone ?? 2) / 7)
  const headerGlow = `color-mix(in srgb, var(--color-accent) ${Math.round(18 + intensity * 34)}%, transparent)`

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-paper)' }}>
      <div className="mx-auto w-full max-w-md">
        {/* Generated header — .pen-style gradient + real intensity terrain, nav + title overlaid */}
        <div className="relative overflow-hidden" style={{ borderBottomLeftRadius: 24, borderBottomRightRadius: 24, background: 'linear-gradient(160deg, color-mix(in srgb, var(--color-accent) 16%, var(--color-paper-2)) 0%, var(--color-paper) 72%)' }}>
          <div className="absolute inset-0" style={{ background: `radial-gradient(120% 90% at 28% -10%, ${headerGlow} 0%, transparent 62%)` }} />
          <svg viewBox="0 0 400 120" preserveAspectRatio="none" className="absolute left-0 right-0 bottom-0" style={{ width: '100%', height: 110 }}>
            <defs>
              <linearGradient id="wkterr" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={sportColor} stopOpacity="0.5" />
                <stop offset="1" stopColor={sportColor} stopOpacity="0.04" />
              </linearGradient>
            </defs>
            {terrain.area && <path d={terrain.area} fill="url(#wkterr)" />}
            {terrain.line && <path d={terrain.line} fill="none" stroke={sportColor} strokeWidth={2} opacity={0.85} />}
          </svg>
          <sportMeta.Icon size={128} style={{ position: 'absolute', right: -14, top: 24, opacity: 0.09 }} />
          <div className="relative">
            {nav}
            <div className="px-4 pt-7 pb-4">
              <span className="eyebrow" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: sportColor }}>{(de ? sportMeta.de : sportMeta.en).toUpperCase()} · {de ? 'ZONE' : 'ZONE'} {main?.zone ?? '—'} · {minutes} MIN</span>
              <h1 className="num-display" style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1.05, marginTop: 4 }}>{w.title}</h1>
            </div>
          </div>
        </div>
        <div className="px-4 pt-5 pb-7 flex flex-col gap-5">

          {/* ── Hero chips ──────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            {/* summary chips — sport-aware 4th slot (bike %FTP · run pace · gym RPE) */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { v: `${Math.round(w.predicted_tss)}`, l: 'TSS' },
                { v: `${minutes}`, l: 'min' },
                sport === 'cycling'
                  ? { v: kj > 0 ? `~${kj}` : '—', l: 'kJ' }
                  : sport === 'running'
                    ? { v: runPace ?? '—', l: runPace ? 'Pace' : 'Pace' }
                    : { v: main ? `${main.rpe}` : '—', l: 'RPE' },
                sport === 'cycling'
                  ? { v: peakPct > 0 ? `${Math.round(peakPct * 100)}%` : '—', l: 'FTP' }
                  : sport === 'running'
                    ? { v: hrVal, l: 'HR' }
                    : { v: main ? `${main.zone}` : '—', l: de ? 'Stufe' : 'Zone' },
              ].map((c, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5 rounded-[16px] px-3 py-2.5" style={chipStyle}>
                  <span className="num-display" style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-ink)' }}>{c.v}</span>
                  <span className="eyebrow" style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{c.l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Interval Profile Card ─────────────────────────────────────── */}
          <div className="rounded-[24px] p-5 flex flex-col gap-[14px]" style={cardStyle}>
            <div className="flex items-center justify-between">
              <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1.5px', color: 'var(--color-ink-2)' }}>{t.profile}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>% FTP</span>
            </div>
            {/* plot: y-axis + bars */}
            <div className="flex gap-2">
              <div className="flex flex-col justify-between items-end" style={{ width: 26, height: PLOT_H }}>
                {[120, 90, 60].map((y) => (
                  <span key={y} style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-muted)' }}>{y}</span>
                ))}
              </div>
              <div className="flex-1 flex items-end gap-[3px]" style={{ height: PLOT_H }}>
                {blocks.map((b, i) => {
                  const h = Math.max(6, Math.round((((b.target_pct_ftp || 0) * 100) / chartMax) * PLOT_H))
                  return <div key={i} className="flex-1 rounded-t-[3px]" style={{ height: h, background: zoneColor(b.zone) }} />
                })}
              </div>
            </div>
            {/* x-axis */}
            <div className="flex items-center justify-between" style={{ paddingLeft: 34 }}>
              <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-muted)' }}>0:00</span>
              <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-muted)' }}>{fmtMMSS(totalS)}</span>
            </div>
            {/* zone legend */}
            <div className="flex items-center gap-[14px] flex-wrap">
              {zones.map((z) => (
                <span key={z} className="inline-flex items-center gap-[5px]">
                  <span className="rounded-full" style={{ width: 8, height: 8, background: zoneColor(z) }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-2)' }}>Z{z}</span>
                </span>
              ))}
            </div>
          </div>

          {/* ── Structure Card ────────────────────────────────────────────── */}
          <div className="rounded-[24px] p-5 flex flex-col gap-4" style={cardStyle}>
            <div className="flex items-center justify-between">
              <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1.5px', color: 'var(--color-ink-2)' }}>{t.structure}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>{t.steps(groups.length, minutes)}</span>
            </div>
            <div className="flex flex-col gap-3">
              {groups.map((g, i) => {
                const b = g.block
                const target = b.target_watts_high > 0
                  ? (b.target_watts_low === b.target_watts_high ? `${b.target_watts_low} W` : `${b.target_watts_low}–${b.target_watts_high} W`)
                  : b.target_hr_low != null ? `${b.target_hr_low}–${b.target_hr_high} bpm`
                  : `Z${b.zone}`
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="shrink-0 rounded-[2px]" style={{ width: 4, height: 38, background: zoneColor(b.zone) }} />
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <span className="flex items-center gap-2">
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>{b.name}</span>
                        {g.count > 1 && (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: 'var(--color-accent-soft)' }}>
                            <Repeat size={11} style={{ color: 'var(--color-accent)' }} />
                            <span className="num-display" style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent)' }}>{g.count}×</span>
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)' }}>
                        {de ? 'Zone' : 'Zone'} {b.zone}{b.target_pct_ftp > 0 ? ` · ${Math.round(b.target_pct_ftp * 100)}% FTP` : ''}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="num-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{fmtMMSS(b.duration_s)}</span>
                      <span className="num-mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{target}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Targets Card ──────────────────────────────────────────────── */}
          <div className="rounded-[24px] p-5 flex flex-col gap-4" style={cardStyle}>
            <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1.5px', color: 'var(--color-ink-2)' }}>{t.targets}</span>
            <div className="flex items-stretch">
              {[
                { Icon: Zap, color: 'var(--color-accent)', val: powerVal, unit: 'W', lbl: t.power },
                { Icon: Heart, color: 'var(--color-move)', val: hrVal, unit: 'bpm', lbl: main ? `HR · Z${main.zone}` : 'HR' },
                { Icon: Gauge, color: 'var(--color-strain)', val: cadVal, unit: 'rpm', lbl: t.cadence },
              ].map((tg, i) => (
                <div key={i} className="flex-1 flex items-center" >
                  {i > 0 && <span className="self-center" style={{ width: 1, height: 44, background: 'var(--color-rule)' }} />}
                  <div className="flex-1 flex flex-col items-center gap-1.5">
                    <tg.Icon size={20} style={{ color: tg.color }} />
                    <span className="flex items-baseline gap-[3px]">
                      <span className="num-display" style={{ fontSize: 19, fontWeight: 700, color: 'var(--color-ink)' }}>{tg.val}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{tg.unit}</span>
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-ink-2)' }}>{tg.lbl}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Fueling Card (estimate) ───────────────────────────────────── */}
          <div className="rounded-[24px] p-5 flex flex-col gap-[14px]" style={cardStyle}>
            <div className="flex items-center justify-between">
              <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1.5px', color: 'var(--color-ink-2)' }}>{t.fueling}</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>{t.forEffort(minutes)} · {t.estimate}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { Icon: Apple, color: 'var(--color-amber)', val: `${gPerHr} g`, lbl: t.carbs },
                { Icon: Droplet, color: 'var(--color-strain)', val: '~500 ml', lbl: t.fluid },
              ].map((f, i) => (
                <div key={i} className="flex items-center gap-2.5 rounded-[16px] px-3.5 py-3" style={innerStyle}>
                  <span className="shrink-0 grid place-items-center rounded-full" style={{ width: 34, height: 34, background: 'var(--color-surface-3)' }}>
                    <f.Icon size={18} style={{ color: f.color }} />
                  </span>
                  <div className="flex flex-col">
                    <span className="num-display" style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-ink)' }}>{f.val}</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-ink-2)' }}>{f.lbl}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Why today & goal ───────────────────────────────────────────── */}
          <div className="rounded-[24px] p-5 flex flex-col gap-4" style={cardStyle}>
            <div className="flex items-center gap-2">
              <Sparkles size={16} strokeWidth={2.2} style={{ color: 'var(--color-accent)' }} />
              <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1.5px', color: 'var(--color-ink-2)' }}>{isToday ? (de ? 'WARUM HEUTE' : 'WHY TODAY') : (de ? 'GEPLANTE EINHEIT' : 'PLANNED SESSION')}</span>
            </div>

            {/* the coach's rationale for prescribing this session today */}
            {(w.why_this_workout || adaptSummary) && (
              <p style={{ fontSize: 14, color: 'var(--color-ink)', lineHeight: 1.45 }}>{w.why_this_workout || adaptSummary}</p>
            )}
            {adaptSummary && w.why_this_workout && adaptSummary !== w.why_this_workout && (
              <div className="flex items-start gap-2.5 rounded-[16px] p-3" style={innerStyle}>
                <Sparkles size={15} strokeWidth={2.2} style={{ color: 'var(--color-accent)', marginTop: 1, flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>{adaptSummary}</span>
              </div>
            )}

            {/* the training goal this session serves */}
            <div className="flex items-start gap-2.5 rounded-[16px] p-3" style={innerStyle}>
              <Target size={16} strokeWidth={2.2} style={{ color: 'var(--color-recovery)', marginTop: 1, flexShrink: 0 }} />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="eyebrow" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--color-muted)' }}>{de ? 'DAS ZIEL' : 'THE GOAL'}</span>
                <span style={{ fontSize: 13, color: 'var(--color-ink)', lineHeight: 1.4 }}>
                  {w.purpose
                    ? w.purpose
                    : goalName
                      ? (de
                          ? `Baut gezielt auf ${goalName}${daysToGoal ? ` (in ${daysToGoal} Tagen)` : ''} hin.`
                          : `Builds specifically toward ${goalName}${daysToGoal ? ` (in ${daysToGoal} days)` : ''}.`)
                      : (de ? 'Ein gezielter Baustein deines periodisierten Aufbaus.' : 'A targeted block of your periodized build.')}
                </span>
              </div>
            </div>

            {/* the science this workout is built on */}
            {w.framework_cited && (
              <div className="flex items-center gap-2">
                <BookOpen size={14} strokeWidth={2} style={{ color: 'var(--color-muted)' }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>{de ? 'Methode: ' : 'Framework: '}{w.framework_cited}</span>
              </div>
            )}
          </div>

          {/* No start CTA: the app prescribes and reviews — it cannot execute
              a workout (user decision, Jul 2026). Export/push lives in the
              header actions. */}
          <div className="flex flex-col gap-2.5">
            <button type="button" className="inline-flex items-center justify-center gap-1.5 py-2">
              <SlidersHorizontal size={16} style={{ color: 'var(--color-ink-2)' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink-2)' }}>{t.edit}</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
