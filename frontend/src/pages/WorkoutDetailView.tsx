/**
 * WorkoutDetailView — rebuilt 1:1 from Pencil "V3 · Workout Detail" (node PloPg).
 * NavRow (back · "Workout" · share) → Hero (sport icon, title, sub, why-line,
 * 4 summary chips) → AI Coach card (why this session & why today, goal callout,
 * ask-row) → Interval Profile (BlockBars) → Structure (warm-up · MAIN SET repeat
 * block · cool-down) → Targets (power zone band + HR/cadence cells) → Fueling
 * (estimate: carbs timeline + pack) → Swap row → Export CTA + destinations.
 *
 * BIKE-ONLY (cycling). Reached from Today / Train at /workout/today and
 * /workout/:date. TODAY renders the coach brief's real prescribed workout; a
 * FUTURE planned day resolves that day's session from the weekly plan and maps
 * it into the identical presentation. Honest "—" where sensor data is absent.
 */
import { useEffect, useMemo } from 'react'
import { useNavigate, useParams, Navigate } from 'react-router-dom'
import { format, parseISO, differenceInCalendarWeeks } from 'date-fns'
import {
  ChevronLeft, ChevronRight, Share2, Bike, Repeat, Zap, Heart, Gauge, Droplet,
  Cookie, Brain, Flag, MessageCircle, Home, CalendarClock,
} from 'lucide-react'
import { formatDate } from '../utils/format'
import { useCoachBrief } from '../hooks/useCoachBrief'
import { useAthleteProfile } from '../hooks/useAthleteProfile'
import { useCurrentWeek } from '../hooks/useCurrentWeek'
import { useActivitiesRange } from '../hooks/useActivitiesRange'
import { localDayKey } from '../utils/loadMetrics'
import { useLocale } from '../contexts/LocaleContext'
import { workoutDisplayTitle, workoutDisplayPurpose, workoutDisplayRationale } from '../api/coach'
import BlockBars, { zoneColor, zoneForPct } from '../components/workout/BlockBars'
import WorkoutExportCard, { type ExportBlockReason } from '../components/workout/WorkoutExportCard'
import type { ResolvedBlock, PrescribedWorkout } from '../api/coach'
import type { CustomBlock } from '../api/customWorkouts'
import type { DayPlan } from '../api/weeks'

// ── token helpers ───────────────────────────────────────────────────────────
const card = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const
const inner = { background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' } as const
const chip = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const

function fmtMMSS(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}
const wattsStr = (lo: number, hi: number) => (lo <= 0 ? '—' : lo === hi ? `${lo}` : `${lo}–${hi}`)

// German zone names (bike) — used when a block's own name is generic.
const ZONE_NAME_DE: Record<number, string> = {
  1: 'Erholung', 2: 'Grundlage', 3: 'Tempo', 4: 'Schwelle', 5: 'VO₂max', 6: 'Anaerob', 7: 'Neuromuskulär',
}
// Strip a trailing rep index from a block name ("VO2 3" → "VO2") for the repeat step.
const baseName = (n: string) => n.replace(/\s*\d+\s*$/, '').trim() || n

// ── Structure grouping ──────────────────────────────────────────────────────
// Collapse a contiguous alternating effort/recovery run into ONE "N×" repeat
// block (the pen's MAIN SET), and expand a single structured-set block
// (reps/on_s/off_s) into the same repeat shape. Everything else is a 1:1 step.
type StepItem =
  | { kind: 'step'; b: ResolvedBlock }
  | { kind: 'repeat'; count: number; effort: ResolvedBlock; rest: ResolvedBlock | null }

const sig = (b: ResolvedBlock) =>
  `${b.zone}|${b.duration_s}|${b.target_watts_low}|${b.target_watts_high}|${Math.round((b.target_pct_ftp || 0) * 100)}`

function buildSteps(blocks: ResolvedBlock[]): StepItem[] {
  const out: StepItem[] = []
  let i = 0
  while (i < blocks.length) {
    const b = blocks[i]
    // Alternating (effort, recovery) run repeated ≥2× → one MAIN SET repeat.
    if (
      i + 3 < blocks.length &&
      sig(blocks[i]) === sig(blocks[i + 2]) &&
      sig(blocks[i + 1]) === sig(blocks[i + 3]) &&
      sig(blocks[i]) !== sig(blocks[i + 1])
    ) {
      const A = blocks[i]
      const B = blocks[i + 1]
      let j = i
      let efforts = 0
      while (j < blocks.length && sig(blocks[j]) === ((j - i) % 2 === 0 ? sig(A) : sig(B))) {
        if ((j - i) % 2 === 0) efforts++
        j++
      }
      out.push({ kind: 'repeat', count: efforts, effort: A, rest: B })
      i = j
      continue
    }
    // A single block that IS a structured set (reps/on_s/off_s).
    if (b.reps != null && b.reps >= 2 && b.on_s != null && b.on_s > 0 && b.off_s != null && b.off_s > 0) {
      const offPct = b.off_pct_ftp ?? 0
      out.push({
        kind: 'repeat',
        count: b.reps,
        effort: { ...b, duration_s: b.on_s },
        rest: {
          ...b,
          name: 'Recovery',
          duration_s: b.off_s,
          target_pct_ftp: offPct,
          zone: offPct > 0 ? zoneForPct(offPct) : 1,
          target_watts_low: b.off_watts_low ?? 0,
          target_watts_high: b.off_watts_high ?? 0,
        },
      })
      i++
      continue
    }
    out.push({ kind: 'step', b })
    i++
  }
  return out
}

// ── derived session summary from real blocks ────────────────────────────────
function summarize(w: PrescribedWorkout) {
  const blocks = w.blocks ?? []
  const totalS = w.total_duration_s ?? (blocks.reduce((a, b) => a + b.duration_s, 0) || w.duration_minutes * 60)
  const minutes = w.duration_minutes || Math.round(totalS / 60)
  const main = blocks.reduce<ResolvedBlock | null>((best, b) => {
    if (!best) return b
    if (b.zone > best.zone) return b
    if (b.zone === best.zone && b.target_pct_ftp > best.target_pct_ftp) return b
    return best
  }, null)
  const peakPct = blocks.reduce((m, b) => Math.max(m, b.target_pct_ftp || 0), 0)
  const kj = Math.round(
    blocks.reduce((a, b) => {
      const avg = b.target_watts_high > 0 ? (b.target_watts_low + b.target_watts_high) / 2 : 0
      return a + avg * b.duration_s
    }, 0) / 1000,
  )
  const zones = Array.from(new Set(blocks.map((b) => Math.min(7, Math.max(1, b.zone))))).sort((a, b) => a - b)
  return { blocks, totalS, minutes, main, peakPct, kj, zones }
}

// ── Future-day mapping: DayPlan → PrescribedWorkout ─────────────────────────
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
    // Structured micro-set (reps/on_s/off_s) — propagate so BlockBars renders
    // real on/off stripes and buildSteps forms a MAIN SET. The preview leaves
    // duration_seconds 0, so derive it from the set math (reps × (on+off)).
    const structured = iv.reps != null && iv.reps >= 2 && iv.on_s != null && iv.off_s != null
    const offPct = iv.off_pct_ftp ?? 0
    const offW = ftp != null && offPct > 0 ? Math.round(offPct * ftp) : 0
    const durS = structured ? iv.reps! * (iv.on_s! + iv.off_s!) : iv.duration_seconds ?? 0
    return {
      name: de ? ZONE_NAME_DE[z] : `Zone ${z}`,
      duration_s: durS,
      target_watts_low: watts,
      target_watts_high: watts,
      target_pct_ftp: pct,
      zone: z,
      rpe: RPE_BY_ZONE[z] ?? 4,
      cadence_low: null,
      cadence_high: null,
      target_hr_low: null,
      target_hr_high: null,
      reps: structured ? iv.reps : null,
      on_s: structured ? iv.on_s : null,
      off_s: structured ? iv.off_s : null,
      off_pct_ftp: structured ? iv.off_pct_ftp : null,
      off_watts_low: structured ? offW : null,
      off_watts_high: structured ? offW : null,
    }
  })
  const totalS = d.duration_seconds_target ?? blocks.reduce((s, b) => s + b.duration_s, 0)
  // The weekly-plan preview leaves non-structured warm-up / cool-down blocks at
  // 0 s. Rendering those as literal "0:00 · —" steps looks broken, so spread the
  // session's leftover planned time across them — the structure then sums to the
  // real total instead of dropping to just the main set. Any block still left at
  // 0 s (no leftover to give) is filtered out rather than shown as a dead row.
  const assigned = blocks.reduce((s, b) => s + b.duration_s, 0)
  const zeros = blocks.filter((b) => b.duration_s <= 0)
  if (zeros.length > 0 && totalS > assigned) {
    const each = Math.floor((totalS - assigned) / zeros.length)
    for (const b of blocks) if (b.duration_s <= 0) b.duration_s = each
  }
  const filledBlocks = blocks.filter((b) => b.duration_s > 0)
  return {
    template_id: d.template_id ?? '',
    title: d.title,
    duration_minutes: Math.round(totalS / 60),
    total_duration_s: totalS,
    predicted_tss: d.target_tss ?? 0,
    framework_cited: '',
    purpose: null,
    category: d.category,
    blocks: filledBlocks,
    why_this_workout: d.rationale || null,
  }
}

// ── Power-zone band (Targets) — Coggan %FTP band edges on a 0..150% scale ────
const ZONE_BANDS: Array<{ z: number; lo: number; hi: number }> = [
  { z: 1, lo: 0, hi: 55 }, { z: 2, lo: 55, hi: 75 }, { z: 3, lo: 75, hi: 90 },
  { z: 4, lo: 90, hi: 105 }, { z: 5, lo: 105, hi: 120 }, { z: 6, lo: 120, hi: 150 },
]
const SCALE_MAX = 150

export default function WorkoutDetailView() {
  const navigate = useNavigate()
  const { locale } = useLocale()
  const de = locale === 'de'
  const { date: dateParam } = useParams<{ date?: string }>()
  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), [])
  const targetDate = !dateParam || dateParam === 'today' ? todayStr : dateParam
  const isToday = targetDate === todayStr
  const weekOffset = useMemo(() => {
    if (isToday) return 0
    try {
      return Math.min(12, Math.max(0, differenceInCalendarWeeks(parseISO(targetDate), new Date(), { weekStartsOn: 1 })))
    } catch { return 0 }
  }, [isToday, targetDate])

  useEffect(() => { window.scrollTo(0, 0) }, [targetDate])
  const { data: brief } = useCoachBrief()
  const { data: profile } = useAthleteProfile()
  const { data: week } = useCurrentWeek(weekOffset)
  const ftp = profile?.ftp_watts ?? null

  // Today's completed ride (if any). Once you've trained, the coach drops the
  // prescription (brief.prescribed_workout → null), which would otherwise leave
  // this view on the "no workout / rest" message. If a ride exists for today,
  // "view workout" should open the ride you actually did instead.
  const { data: todayActs } = useActivitiesRange(new Date(), new Date())
  const todayRide = useMemo(() => {
    if (!isToday) return null
    const todayKey = localDayKey(new Date())
    return (todayActs?.activities ?? []).find(
      (a) =>
        /(cycl|bike|ride|mtb|gravel|virtual)/.test((a.sport ?? '').toLowerCase()) &&
        localDayKey(a.started_at ?? a.date ?? '') === todayKey,
    ) ?? null
  }, [isToday, todayActs])

  const dayPlan = useMemo(
    () => (isToday ? null : week?.days?.find((d) => d.date === targetDate) ?? null),
    [isToday, week, targetDate],
  )
  const w: PrescribedWorkout | null = useMemo(() => {
    if (isToday) return brief?.prescribed_workout ?? null
    if (dayPlan && dayHasSession(dayPlan)) return mapDayToWorkout(dayPlan, ftp, de)
    return null
  }, [isToday, brief, dayPlan, ftp, de])

  const s = useMemo(() => (w ? summarize(w) : null), [w])
  const steps = useMemo(() => (w ? buildSteps(w.blocks) : []), [w])

  // "Einheit bearbeiten" → open the workout builder seeded with THIS workout as
  // an editable draft. ResolvedBlocks map straight onto CustomBlocks (both use
  // %FTP as a fraction): an on/off set → interval, everything else → steady.
  const onEditWorkout = () => {
    if (!w) return
    const seedBlocks: CustomBlock[] = (w.blocks ?? []).map((b) => {
      if (b.reps && b.on_s) {
        return {
          type: 'interval', name: b.name,
          reps: b.reps, on_s: b.on_s, off_s: b.off_s ?? 0,
          on_pct: b.target_pct_ftp ?? null, off_pct: b.off_pct_ftp ?? null,
        }
      }
      return { type: 'steady', name: b.name, duration_s: b.duration_s, power_pct: b.target_pct_ftp ?? null }
    })
    const seedName = (de ? w.title_de : w.title) || w.title || (de ? 'Eigenes Workout' : 'Custom workout')
    navigate('/workouts/builder', { state: { seed: { name: seedName, blocks: seedBlocks } } })
  }

  // Coach rationale (today only — a "now" concept) + the training goal.
  const evidence = (brief?.evidence as Record<string, unknown> | undefined) ?? {}
  const athlete = evidence.athlete as Record<string, unknown> | undefined
  const goalName = athlete?.goal_target as string | undefined
  const daysToGoal = athlete?.days_to_goal as number | undefined
  const verdict = isToday ? (brief?.verdict as string | undefined) : undefined
  const coachBody = isToday
    ? (brief?.rationale as string | undefined) || (w ? workoutDisplayRationale(w, de) ?? undefined : undefined)
    : (w ? workoutDisplayRationale(w, de) ?? undefined : undefined)

  const t = {
    title: 'Workout',
    profile: de ? 'INTERVALLPROFIL' : 'INTERVAL PROFILE',
    structure: de ? 'STRUKTUR' : 'STRUCTURE',
    targets: de ? 'ZIELWERTE' : 'TARGETS',
    fueling: de ? 'VERPFLEGUNG' : 'FUELING',
  }

  // ── NavRow (shared across states) ──────────────────────────────────────────
  const nav = (
    <div className="flex items-center justify-between px-4" style={{ paddingTop: 6, paddingBottom: 6 }}>
      <button type="button" onClick={() => navigate(-1)} aria-label={de ? 'Zurück' : 'Back'} className="grid place-items-center" style={{ width: 40, height: 40, borderRadius: 100, ...chip }}>
        <ChevronLeft size={24} style={{ color: 'var(--color-ink)' }} />
      </button>
      <span style={{ fontFamily: '"Sora", sans-serif', fontSize: 17, fontWeight: 700, color: 'var(--color-ink)' }}>{t.title}</span>
      <button type="button" aria-label={de ? 'Teilen' : 'Share'} className="grid place-items-center" style={{ width: 40, height: 40, borderRadius: 100, ...chip }}>
        <Share2 size={20} style={{ color: 'var(--color-ink)' }} />
      </button>
    </div>
  )

  if (!w || !s) {
    // Trained today → show the ride you did, not the (now-consumed) prescription.
    if (isToday && todayRide) return <Navigate to={`/activities/${todayRide.id}/ride`} replace />
    const isRest = !isToday && (!dayPlan || dayPlan.category === 'rest' || !dayHasSession(dayPlan))
    const dLabel = isToday ? null : formatDate(parseISO(targetDate), de ? 'EEEE, d. MMM' : 'EEEE, MMM d', locale)
    const msg = isToday
      ? (de ? 'Keine Einheit für heute.' : 'No workout for today.')
      : isRest
        ? (de ? 'Ruhetag — Erholung & Regeneration. Keine Einheit geplant.' : 'Rest day — recovery & regeneration. No session planned.')
        : (de ? 'Keine Einheit für diesen Tag.' : 'No session for this day.')
    return (
      <div className="min-h-screen" style={{ background: 'var(--color-paper)' }}>
        <div className="mx-auto w-full max-w-md">{nav}</div>
        <div className="grid place-items-center py-24 px-6 text-center">
          <div className="flex flex-col items-center gap-2">
            {dLabel && <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-muted)' }}>{dLabel.toUpperCase()}</span>}
            <p style={{ color: 'var(--color-ink-2)' }}>{msg}</p>
          </div>
        </div>
      </div>
    )
  }

  const { totalS, minutes, main, peakPct, kj, zones } = s
  const mainZone = main?.zone ?? '—'
  const peakPctInt = Math.round(peakPct * 100)

  // Session-average power (kJ·1000 / duration). 0 → unknown.
  const avgW = kj > 0 && totalS > 0 ? Math.round((kj * 1000) / totalS) : null

  // Fueling estimate — a real heuristic from duration/intensity, clearly labeled.
  const hrs = totalS / 3600
  const gPerHr = peakPct >= 0.9 || minutes >= 120 ? 60 : 45
  const totalCarbs = Math.round(gPerHr * hrs)
  const bottles = Math.max(1, Math.round(hrs))
  const gels = Math.max(0, Math.round((totalCarbs - bottles * 15) / 25))

  // Targets — main block, honest "—" where sensor data is absent.
  const powerVal = main && main.target_watts_high > 0 ? `${wattsStr(main.target_watts_low, main.target_watts_high)} W` : '—'
  const hrVal = main && main.target_hr_low != null && main.target_hr_high != null ? `${main.target_hr_low}–${main.target_hr_high}` : '—'
  const cadVal = main && main.cadence_low != null && main.cadence_high != null ? `${main.cadence_low}–${main.cadence_high}` : '—'

  const zoneLabel = (z: number) => (de ? ZONE_NAME_DE[z] : ZONE_NAME_DE[z] ? `Zone ${z}` : `Z${z}`)
  const stepLabel = (b: ResolvedBlock) =>
    b.target_pct_ftp > 0 ? `Zone ${b.zone} · ${Math.round(b.target_pct_ftp * 100)}% FTP` : `Zone ${b.zone}`

  // Marker position on the zone band (0..1 along SCALE_MAX).
  const markerFrac = Math.min(1, Math.max(0, (peakPctInt || (main?.zone ?? 2) * 20) / SCALE_MAX))

  const eyebrow = { fontSize: 12, fontWeight: 700, letterSpacing: '1.5px', color: 'var(--color-ink-2)' } as const

  // ── Export gating (backlog 02·I1) ──────────────────────────────────────────
  // Only structured power workouts export. The endpoint serves TODAY's brief,
  // so a future planned day is honestly disabled; today without an FTP anchor
  // (endpoint would 400) is disabled too.
  const structured = w.blocks.length > 0 && w.blocks.some((b) => (b.target_pct_ftp ?? 0) > 0 || b.target_watts_high > 0)
  const exportAvailable = isToday && structured && ftp != null && ftp > 0
  const exportReason: ExportBlockReason = !structured
    ? 'no_structure'
    : !isToday
      ? 'future'
      : ftp == null || ftp <= 0
        ? 'no_ftp'
        : null

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-paper)' }}>
      <div className="mx-auto w-full max-w-md">
        {nav}
        <div className="px-4 flex flex-col" style={{ paddingTop: 8, paddingBottom: 28, gap: 20 }}>

          {/* ── Hero ──────────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-[14px]">
              <span className="shrink-0 grid place-items-center" style={{ width: 52, height: 52, borderRadius: 100, background: 'var(--color-accent-soft)' }}>
                <Bike size={26} style={{ color: 'var(--color-accent)' }} />
              </span>
              <div className="flex flex-col gap-[3px] min-w-0">
                <h1 style={{ fontFamily: '"Sora", sans-serif', fontSize: 24, fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1.1 }}>{workoutDisplayTitle(w, de)}</h1>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-ink-2)' }}>
                  {(de ? 'Rad' : 'Bike')} · {de ? 'Zone' : 'Zone'} {mainZone} · {minutes} {de ? 'Min' : 'min'}
                </span>
              </div>
            </div>
            {(() => {
              // Hero "why" line = the short template purpose ("what it is"). The
              // coach card carries the longer "why today". Skip when it would
              // duplicate the coach body, or when there is no coach card at all.
              const purpose = workoutDisplayPurpose(w, de)
              const line = purpose ?? (!coachBody ? workoutDisplayRationale(w, de) : null)
              if (!line || line === coachBody) return null
              return <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>{line}</p>
            })()}
            {/* summary chips — TSS · min · kJ · peak %FTP (all real, "—" if 0) */}
            <div className="flex gap-2">
              {[
                { v: `${Math.round(w.predicted_tss)}`, l: 'TSS' },
                { v: `${minutes}`, l: de ? 'Min' : 'min' },
                { v: kj > 0 ? `~${kj}` : '—', l: 'kJ' },
                { v: peakPctInt > 0 ? `${peakPctInt}%` : '—', l: 'FTP' },
              ].map((c, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5" style={{ borderRadius: 16, padding: '10px 12px', ...chip }}>
                  <span style={{ fontFamily: '"Sora", sans-serif', fontSize: 16, fontWeight: 700, color: 'var(--color-ink)' }}>{c.v}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{c.l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── AI Coach card (why this session & why today) ──────────────── */}
          {coachBody && (
            <div className="flex flex-col" style={{ borderRadius: 24, padding: 18, gap: 14, background: 'var(--color-violet-soft)', border: '1px solid var(--color-violet)' }}>
              <div className="flex items-center gap-[11px]">
                <span className="shrink-0 grid place-items-center" style={{ width: 38, height: 38, borderRadius: 100, background: 'var(--color-violet)' }}>
                  <Brain size={21} style={{ color: '#FFFFFF' }} />
                </span>
                <div className="flex flex-col gap-px min-w-0">
                  <span style={{ fontFamily: '"Sora", sans-serif', fontSize: 16, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? 'Dein Coach' : 'Your coach'}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-violet)' }}>{isToday ? (de ? 'Warum diese Einheit — und warum heute' : 'Why this session — and why today') : (de ? 'Diese geplante Einheit' : 'This planned session')}</span>
                </div>
              </div>
              {verdict && <p style={{ fontFamily: '"Sora", sans-serif', fontSize: 16, fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1.3 }}>{verdict}</p>}
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.5 }}>{coachBody}</p>
              {goalName && (
                <div className="flex items-center gap-[10px]" style={{ borderRadius: 14, padding: '11px 12px', background: '#00000026' }}>
                  <span className="shrink-0 grid place-items-center" style={{ width: 30, height: 30, borderRadius: 100, background: 'var(--color-violet)' }}>
                    <Flag size={16} style={{ color: '#FFFFFF' }} />
                  </span>
                  <div className="flex flex-col gap-px min-w-0">
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink)' }}>{de ? `Baut auf ${goalName} hin` : `Builds toward ${goalName}`}</span>
                    {daysToGoal != null && <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-ink-2)' }}>{de ? `${daysToGoal} Tage` : `${daysToGoal} days`}</span>}
                  </div>
                </div>
              )}
              {isToday && (
                <>
                  <div style={{ height: 1, background: '#FFFFFF1A' }} />
                  <button type="button" onClick={() => navigate('/coach')} className="flex items-center justify-between">
                    <span className="flex items-center gap-[7px]">
                      <MessageCircle size={16} style={{ color: 'var(--color-violet)' }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-violet)' }}>{de ? 'Zu dieser Einheit fragen' : 'Ask about this session'}</span>
                    </span>
                    <ChevronRight size={18} style={{ color: 'var(--color-violet)' }} />
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── Interval Profile ──────────────────────────────────────────── */}
          <div className="flex flex-col" style={{ borderRadius: 24, padding: 20, gap: 14, ...card }}>
            <div className="flex items-center justify-between">
              <span style={eyebrow}>{t.profile}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>% FTP</span>
            </div>
            <div className="flex gap-2">
              <div className="flex flex-col justify-between items-end" style={{ width: 26, height: 150 }}>
                {[120, 90, 60].map((y) => (
                  <span key={y} style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-muted)' }}>{y}</span>
                ))}
              </div>
              <div className="flex-1" style={{ height: 150 }}>
                <BlockBars blocks={w.blocks} height={150} />
              </div>
            </div>
            <div className="flex items-center justify-between" style={{ paddingLeft: 34 }}>
              <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-muted)' }}>0:00</span>
              <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-muted)' }}>{fmtMMSS(totalS)}</span>
            </div>
            <div className="flex items-center gap-[14px] flex-wrap">
              {zones.map((z) => (
                <span key={z} className="inline-flex items-center gap-[5px]">
                  <span style={{ width: 8, height: 8, borderRadius: 100, background: zoneColor(z), border: '1px solid var(--color-rule)' }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-2)' }}>Z{z}</span>
                </span>
              ))}
            </div>
          </div>

          {/* ── Structure ─────────────────────────────────────────────────── */}
          <div className="flex flex-col" style={{ borderRadius: 24, padding: 20, gap: 16, ...card }}>
            <div className="flex items-center justify-between">
              <span style={eyebrow}>{t.structure}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>{w.blocks.length} {de ? (w.blocks.length === 1 ? 'Schritt' : 'Schritte') : (w.blocks.length === 1 ? 'step' : 'steps')} · {minutes} {de ? 'Min' : 'min'}</span>
            </div>
            {steps.map((it, i) => {
              if (it.kind === 'step') {
                const b = it.b
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="shrink-0" style={{ width: 4, height: 38, borderRadius: 2, background: zoneColor(b.zone) }} />
                    <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>{b.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)' }}>{stepLabel(b)}</span>
                    </div>
                    <div className="flex flex-col items-end gap-[2px]">
                      <span style={{ fontFamily: '"Sora", sans-serif', fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{fmtMMSS(b.duration_s)}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{b.target_watts_high > 0 ? `${wattsStr(b.target_watts_low, b.target_watts_high)} W` : '—'}</span>
                    </div>
                  </div>
                )
              }
              // repeat block — the pen's MAIN SET
              const { effort, rest, count } = it
              const rows = [{ b: effort, name: de && ZONE_NAME_DE[effort.zone] && /^(vo2|zone)/i.test(baseName(effort.name)) ? ZONE_NAME_DE[effort.zone] : baseName(effort.name) }]
              if (rest) rows.push({ b: rest, name: rest.name })
              return (
                <div key={i} className="flex flex-col gap-3" style={{ borderRadius: 16, padding: 14, ...inner }}>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', color: 'var(--color-muted)' }}>{de ? 'HAUPTTEIL' : 'MAIN SET'}</span>
                    <span className="inline-flex items-center gap-1" style={{ borderRadius: 100, padding: '4px 10px', background: 'var(--color-surface-3)' }}>
                      <Repeat size={13} style={{ color: 'var(--color-ink)' }} />
                      <span style={{ fontFamily: '"Sora", sans-serif', fontSize: 13, fontWeight: 700, color: 'var(--color-ink)' }}>{count} ×</span>
                    </span>
                  </div>
                  {rows.map((r, ri) => (
                    <div key={ri}>
                      {ri > 0 && <div style={{ height: 1, background: 'var(--color-rule)', marginBottom: 12 }} />}
                      <div className="flex items-center gap-3">
                        <span className="shrink-0" style={{ width: 4, height: 38, borderRadius: 2, background: zoneColor(r.b.zone) }} />
                        <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
                          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>{r.name}</span>
                          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)' }}>{stepLabel(r.b)}</span>
                        </div>
                        <div className="flex flex-col items-end gap-[2px]">
                          <span style={{ fontFamily: '"Sora", sans-serif', fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{fmtMMSS(r.b.duration_s)}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{r.b.target_watts_high > 0 ? `${wattsStr(r.b.target_watts_low, r.b.target_watts_high)} W` : '—'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          {/* ── Targets ───────────────────────────────────────────────────── */}
          <div className="flex flex-col" style={{ borderRadius: 24, padding: 20, gap: 16, ...card }}>
            <span style={eyebrow}>{t.targets}</span>
            {/* power target + zone band */}
            <div className="flex flex-col gap-[10px]">
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink-2)' }}>{de ? 'Leistungsziel' : 'Power target'}</span>
                <span className="flex items-center gap-2">
                  <span style={{ fontFamily: '"Sora", sans-serif', fontSize: 16, fontWeight: 700, color: 'var(--color-ink)' }}>{powerVal}</span>
                  {main && (
                    <span style={{ borderRadius: 100, padding: '3px 9px', background: `color-mix(in srgb, ${zoneColor(main.zone)} 18%, transparent)`, fontSize: 11, fontWeight: 700, color: zoneColor(main.zone) }}>{de ? 'Zone' : 'Zone'} {main.zone}</span>
                  )}
                </span>
              </div>
              <div className="relative" style={{ height: 22 }}>
                <div className="absolute flex items-center gap-[2px]" style={{ left: 0, right: 0, top: 6, height: 10 }}>
                  {ZONE_BANDS.map((zb) => (
                    <span key={zb.z} style={{ flex: zb.hi - zb.lo, height: 10, borderRadius: 2, background: zoneColor(zb.z), opacity: 0.45 }} />
                  ))}
                </div>
                <span className="absolute" style={{ left: `calc(${markerFrac * 100}% - 1px)`, top: -3, width: 2, height: 28, borderRadius: 1, background: 'var(--color-ink)' }} />
              </div>
              <div className="flex items-center justify-between">
                {ZONE_BANDS.map((zb) => (
                  <span key={zb.z} style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)' }}>Z{zb.z}</span>
                ))}
              </div>
              {main && peakPctInt > 0 && ftp && (
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
                  {de
                    ? `Ganz oben in Zone ${main.zone} — ${peakPctInt}% deiner ${ftp} W FTP.`
                    : `Right at the top of Zone ${main.zone} — ${peakPctInt}% of your ${ftp} W FTP.`}
                </span>
              )}
            </div>
            <div style={{ height: 1, background: 'var(--color-rule)' }} />
            {/* HR + cadence cells */}
            <div className="flex gap-[10px]">
              {[
                { Icon: Heart, color: 'var(--color-move)', val: hrVal, unit: 'bpm', lbl: de ? 'Herzfrequenz' : 'Heart rate' },
                { Icon: Gauge, color: 'var(--color-strain)', val: cadVal, unit: 'rpm', lbl: de ? 'Trittfrequenz' : 'Cadence' },
              ].map((c, i) => (
                <div key={i} className="flex-1 flex items-center gap-[9px]" style={{ borderRadius: 16, padding: 12, ...inner }}>
                  <span className="shrink-0 grid place-items-center" style={{ width: 30, height: 30, borderRadius: 100, background: 'var(--color-surface-3)' }}>
                    <c.Icon size={17} style={{ color: c.color }} />
                  </span>
                  <div className="flex flex-col gap-px min-w-0">
                    <span className="flex items-end gap-[3px]">
                      <span style={{ fontFamily: '"Sora", sans-serif', fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{c.val}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)' }}>{c.unit}</span>
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-ink-2)' }}>{c.lbl}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Fueling (estimate) ────────────────────────────────────────── */}
          <div className="flex flex-col" style={{ borderRadius: 24, padding: 20, gap: 14, ...card }}>
            <div className="flex items-center justify-between">
              <span style={eyebrow}>{t.fueling}</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>{minutes} {de ? 'Min' : 'min'} · {de ? `${gPerHr} g KH/Std · Schätzung` : `${gPerHr} g carbs/hr · estimate`}</span>
            </div>
            {/* timeline: WU / main / CD proportional segments with sip + gel marks */}
            <div className="relative" style={{ height: 26 }}>
              <div className="absolute flex items-center gap-[3px]" style={{ left: 0, right: 0, top: 8, height: 12 }}>
                {w.blocks.map((b, i) => (
                  <span key={i} style={{ flex: Math.max(1, b.duration_s), height: 12, borderRadius: 3, background: b.zone >= 4 ? 'var(--color-accent)' : 'var(--color-surface-3)', opacity: b.zone >= 4 ? 0.5 : 1 }} />
                ))}
              </div>
              {[0.22, 0.44, 0.66, 0.88].map((f, i) => (
                <Droplet key={i} size={13} style={{ position: 'absolute', left: `calc(${f * 100}% - 6px)`, top: -4, color: 'var(--color-strain)' }} />
              ))}
            </div>
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-[5px]">
                <Droplet size={13} style={{ color: 'var(--color-strain)' }} />
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-ink-2)' }}>{de ? 'Alle 15 Min trinken' : 'Sip every 15 min'}</span>
              </span>
              <span className="inline-flex items-center gap-[5px]">
                <Cookie size={13} style={{ color: 'var(--color-amber)' }} />
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-ink-2)' }}>{de ? 'Gel vor den Intervallen' : 'Gel before the intervals'}</span>
              </span>
            </div>
            <div style={{ height: 1, background: 'var(--color-rule)' }} />
            <div className="flex gap-[10px]">
              {[
                { Icon: Droplet, color: 'var(--color-strain)', v: `${bottles} ${bottles === 1 ? (de ? 'Flasche' : 'bottle') : (de ? 'Flaschen' : 'bottles')}`, l: `${bottles * 500} ml` },
                { Icon: Cookie, color: 'var(--color-amber)', v: `${gels} ${de ? 'Gel' : gels === 1 ? 'gel' : 'gels'}`, l: de ? `${gels * 25} g KH` : `${gels * 25} g carbs` },
                { Icon: Zap, color: 'var(--color-accent)', v: `~${totalCarbs} g`, l: de ? 'KH gesamt' : 'total carbs' },
              ].map((p, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-[7px]" style={{ borderRadius: 16, padding: '13px 8px', ...inner }}>
                  <span className="grid place-items-center" style={{ width: 34, height: 34, borderRadius: 100, background: 'var(--color-surface-3)' }}>
                    <p.Icon size={18} style={{ color: p.color }} />
                  </span>
                  <span style={{ fontFamily: '"Sora", sans-serif', fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>{p.v}</span>
                  <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-muted)' }}>{p.l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Swap row ──────────────────────────────────────────────────── */}
          <div className="flex gap-2">
            {[
              { Icon: Home, label: de ? 'Indoor-Variante' : 'Indoor version' },
              { Icon: CalendarClock, label: de ? 'Tag verschieben' : 'Move day' },
            ].map((b, i) => (
              <button key={i} type="button" className="flex-1 flex items-center justify-center gap-[6px]" style={{ borderRadius: 100, padding: '10px 0', ...chip }}>
                <b.Icon size={15} style={{ color: 'var(--color-ink-2)' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>{b.label}</span>
              </button>
            ))}
          </div>

          {/* ── Export CTA (backlog 02·I1 — .zwo/.erg/.mrc/.fit) ──────────── */}
          <WorkoutExportCard available={exportAvailable} reason={exportReason} onEditWorkout={onEditWorkout} />

        </div>
      </div>
    </div>
  )
}
