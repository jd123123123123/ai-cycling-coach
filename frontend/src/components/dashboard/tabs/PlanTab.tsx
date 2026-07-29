/**
 * PlanTab (Train) — session-first order: WeekNav → WeekStrip → today's session
 * cards → the week's session list → notes → PlanCard (→ V3 Season detail) →
 * "Plan & Ziel ändern" → plan import / custom-workout builder → Load & Form.
 * Bike-only. Real week-plan, FTP, and activity data throughout. (The old
 * per-sport Focus picker and the collapsed "Saison-Details" accordion —
 * periodization/PROGNOSE/zones — were removed; the V3 Season screen owns that.)
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { subDays, format, parseISO } from 'date-fns'
import { Bike, Footprints, Infinity as InfinityIcon, Check, Dumbbell, Plus, Clock, Zap, Target, Heart, Info, ChevronRight, ChevronLeft, ListChecks, Moon, AlertTriangle, Thermometer, Flame, FileUp, SlidersHorizontal } from 'lucide-react'
import { useCurrentWeek } from '../../../hooks/useCurrentWeek'
import { useCoachBrief } from '../../../hooks/useCoachBrief'
import { useTodaySession } from '../../../hooks/useTodaySession'
import SessionOfTheDay from '../../dashboard/SessionOfTheDay'
import SessionReviewCard from '../../dashboard/SessionReviewCard'
import { useAthleteProfile } from '../../../hooks/useAthleteProfile'
import { useActivitiesRange } from '../../../hooks/useActivitiesRange'
import { useLocale } from '../../../contexts/LocaleContext'
import AdaptiveCard from '../../plan/AdaptiveCard'
import PlanChangeInterview from '../../plan/PlanChangeInterview'
import { detectWorkoutSport, loggedReviewFromEvidence } from '../../../api/coach'
import type { WorkoutSport } from '../../../api/coach'
import type { DayPlan, IntervalBlockOut } from '../../../api/weeks'
import { phaseLabel, seasonArc } from '../../../utils/seasonArc'
import { useSeasonArc } from '../../../hooks/useSeasonArc'
import ChapterBar from '../../narrative/ChapterBar'
import { intensityStep, intensityLabel } from '../../../utils/intensityScale'
import { formatDate } from '../../../utils/format'

type Sport = 'bike' | 'run' | 'all'
type ZoneMode = 'power' | 'pace' | 'hr'
const cardStyle = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const

// Per-sport visual identity (icon + accent + de/en label).
const SPORT_META: Record<WorkoutSport, { Icon: typeof Bike; en: string; de: string; color: string }> = {
  cycling: { Icon: Bike, en: 'Bike', de: 'Rad', color: 'var(--color-strain)' },
  running: { Icon: Footprints, en: 'Run', de: 'Lauf', color: 'var(--color-exercise)' },
  gym: { Icon: Dumbbell, en: 'Strength', de: 'Kraft', color: 'var(--color-amber)' },
}

// Friel-style running zones — HR as %LTHR(run), pace as %threshold-pace (speed).
const RUN_HR = [
  { z: 'Z1', en: 'Recovery', de: 'Erholung', lo: 0, hi: 0.85, color: 'var(--color-recovery)' },
  { z: 'Z2', en: 'Endurance', de: 'Grundlage', lo: 0.85, hi: 0.90, color: 'var(--color-stand)' },
  { z: 'Z3', en: 'Tempo', de: 'Tempo', lo: 0.90, hi: 0.94, color: 'var(--color-strain)' },
  { z: 'Z4', en: 'Threshold', de: 'Schwelle', lo: 0.94, hi: 1.00, color: 'var(--color-accent)' },
  { z: 'Z5', en: 'VO₂ Max', de: 'VO₂max', lo: 1.00, hi: 0, color: 'var(--color-amber)' },
]
const RUN_PACE = [
  { z: 'Z1', en: 'Recovery', de: 'Erholung', lo: 0, hi: 0.76, color: 'var(--color-recovery)' },
  { z: 'Z2', en: 'Endurance', de: 'Grundlage', lo: 0.76, hi: 0.87, color: 'var(--color-stand)' },
  { z: 'Z3', en: 'Tempo', de: 'Tempo', lo: 0.87, hi: 0.94, color: 'var(--color-strain)' },
  { z: 'Z4', en: 'Threshold', de: 'Schwelle', lo: 0.94, hi: 1.00, color: 'var(--color-accent)' },
  { z: 'Z5', en: 'VO₂ Max', de: 'VO₂max', lo: 1.00, hi: 1.06, color: 'var(--color-amber)' },
]
const fmtPace = (sPerKm: number) => `${Math.floor(sPerKm / 60)}:${String(Math.round(sPerKm % 60)).padStart(2, '0')}`

// Localized session-category labels (plan-day category → chip/meta word) so a
// German user never reads "Sweet spot" chrome under a Lauf row.
const CAT_LABEL: Record<string, { en: string; de: string }> = {
  recovery: { en: 'Recovery', de: 'Erholung' },
  endurance: { en: 'Endurance', de: 'Grundlage' },
  tempo: { en: 'Tempo', de: 'Tempo' },
  sweet_spot: { en: 'Sweet Spot', de: 'Sweet Spot' },
  threshold: { en: 'Threshold', de: 'Schwelle' },
  vo2: { en: 'VO₂max', de: 'VO₂max' },
  rest: { en: 'Rest', de: 'Ruhetag' },
}

function zoneBarColor(z: number): string {
  if (z <= 1) return 'var(--color-surface-3)'
  if (z <= 3) return 'var(--color-strain)'
  if (z === 4) return 'var(--color-accent)'
  if (z === 5) return 'var(--color-amber)'
  return 'var(--color-move)'
}

// ── Session-level power math (textfit handoff / audit P2-14) ────────────────
// The old meta line paired the PEAK interval's watts with the SESSION's TSS
// ("276 W · 82 TSS") — it read like broken math. Split instead into a
// session-level headline (duration-weighted Ø watts) plus a labeled peak
// sub-line, mirroring WorkoutDetailView's landed `peakChip` pattern.
// Both are pure + exported for node-env vitest.

/** Effective work-seconds and mean %FTP of one block, honoring structured
 *  on/off sets: a "30×15/45s" block spends reps×on_s at power_target_pct_ftp
 *  and reps×off_s at off_pct_ftp — averaging the whole 30 min at the on-power
 *  overstates the load (the merged-block bug: "Ø 215 W", "30 Min @ 120% FTP"). */
function blockPctSeconds(iv: IntervalBlockOut): { pctSeconds: number; seconds: number } {
  const onPct = iv.power_target_pct_ftp ?? 0
  if (iv.reps && iv.on_s && iv.on_s > 0) {
    const offPct = iv.off_pct_ftp ?? 0
    const offS = iv.off_s ?? 0
    const onSeconds = iv.reps * iv.on_s
    const offSeconds = iv.reps * offS
    return {
      pctSeconds: onSeconds * onPct + offSeconds * offPct,
      seconds: onSeconds + offSeconds,
    }
  }
  return { pctSeconds: iv.duration_seconds * onPct, seconds: iv.duration_seconds }
}

/** Duration-weighted session-average watts from a day's intervals. */
export function cyclingAvgWatts(ivs: IntervalBlockOut[], ftp: number | null): number | null {
  if (ftp == null) return null
  const powered = ivs.filter((iv) => (iv.power_target_pct_ftp ?? 0) > 0 && iv.duration_seconds > 0)
  const tot = powered.reduce((s, iv) => s + iv.duration_seconds, 0)
  if (tot <= 0) return null
  const pctSeconds = powered.reduce((s, iv) => s + blockPctSeconds(iv).pctSeconds, 0)
  return Math.round((pctSeconds / tot) * ftp)
}

/** "Spitzen: 30×15 s @ 288 W (120 % FTP)" for structured micro-sets, or
 *  "Spitzen: 4×15 Min @ 276 W (92 % FTP)" for steady interval blocks — the
 *  hardest repeated effort, labeled as peaks. Null for steady single-zone
 *  rides or when no FTP/powered interval exists — never fabricated, and never
 *  the physiologically-impossible merged form ("30 Min @ 120% FTP"). */
export function cyclingPeakLine(ivs: IntervalBlockOut[], ftp: number | null, de: boolean): string | null {
  if (ftp == null) return null
  if (new Set(ivs.map((iv) => iv.zone)).size < 2) return null
  const peak = ivs.reduce<IntervalBlockOut | null>((m, iv) => {
    if ((iv.power_target_pct_ftp ?? 0) <= 0) return m
    if (!m || (iv.power_target_pct_ftp as number) > (m.power_target_pct_ftp as number)) return iv
    return m
  }, null)
  if (!peak) return null
  const watts = Math.round((peak.power_target_pct_ftp as number) * ftp)
  const pct = Math.round((peak.power_target_pct_ftp as number) * 100)

  // Structured micro-set: the ON interval is the real effort, not the merged
  // block duration. Render "reps × on-seconds" so we never claim 30 continuous
  // minutes at 120% FTP.
  if (peak.reps && peak.on_s && peak.on_s > 0) {
    const onS = peak.on_s
    const onStr = onS % 60 === 0 ? `${onS / 60} Min` : `${onS} s`
    const onStrEn = onS % 60 === 0 ? `${onS / 60} min` : `${onS} s`
    return de
      ? `Spitzen: ${peak.reps}×${onStr} @ ${watts} W (${pct} % FTP)`
      : `Peaks: ${peak.reps}×${onStrEn} @ ${watts} W (${pct}% FTP)`
  }

  const count = ivs.filter((iv) =>
    iv.power_target_pct_ftp === peak.power_target_pct_ftp && iv.duration_seconds === peak.duration_seconds).length
  const dur = peak.duration_seconds
  const durStr = dur % 60 === 0 ? `${dur / 60}` : `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}`
  const rep = count > 1 ? `${count}×` : ''
  return de
    ? `Spitzen: ${rep}${durStr} Min @ ${watts} W (${pct} % FTP)`
    : `Peaks: ${rep}${durStr} min @ ${watts} W (${pct}% FTP)`
}

/** 409 week-endpoint gate — the backend refuses to build a week without FTP
 *  (X-Error-Code: ftp_required) or a profile (profile_required). Returns the
 *  code, or null for any non-409/absent error. Pure + exported for vitest. */
export function weekBlockCode(error: unknown): 'ftp_required' | 'profile_required' | null {
  const e = error as {
    response?: { status?: number; headers?: Record<string, unknown>; data?: { detail?: unknown } }
  } | null | undefined
  if (!e?.response || e.response.status !== 409) return null
  const headers = e.response.headers ?? {}
  const code = (headers['x-error-code'] ?? headers['X-Error-Code']) as string | undefined
  if (code === 'ftp_required' || code === 'profile_required') return code
  const detail = e.response.data?.detail
  if (typeof detail === 'string' && /profil/i.test(detail)) return 'profile_required'
  return 'ftp_required'
}

/** Honest watt-range chip fragment — null (render nothing) for zero/absent
 *  bounds; "0–0W" must never reach the screen (review finding, Jul 2026). */
export function fmtWattRange(lo: number | null | undefined, hi: number | null | undefined): string | null {
  if (lo == null || hi == null || lo <= 0 || hi <= 0) return null
  return `${lo}–${hi}W`
}

/** The session's DEFINING effort zone — the hardest zone held for a
 *  meaningful total (≥90 s across its blocks), NOT the time-dominant zone:
 *  a 6×3 min @ 115% VO₂ day is Z5 even though warm-up/recovery Z1 dominates
 *  the clock (review finding, Jul 2026). Falls back to the hardest block,
 *  then to the category's representative zone. Pure + exported for vitest. */
export function definingZone(ivs: IntervalBlockOut[], category?: string | null): number | null {
  const CAT: Record<string, number> = { recovery: 1, endurance: 2, tempo: 3, sweet_spot: 4, threshold: 4, vo2: 5 }
  if (ivs.length > 0) {
    const perZone = new Map<number, number>()
    ivs.forEach((b) => perZone.set(b.zone, (perZone.get(b.zone) ?? 0) + b.duration_seconds))
    const sustained = [...perZone.entries()].filter(([, s]) => s >= 90).map(([z]) => z)
    if (sustained.length > 0) return Math.max(...sustained)
    return Math.max(...ivs.map((b) => b.zone))
  }
  return category != null ? CAT[category] ?? null : null
}

export default function PlanTab() {
  const { locale } = useLocale()
  const de = locale === 'de'
  // Bike-only product: the sport stays fixed to 'bike' (the Rad/Lauf/Alle
  // toggle has been removed). The run/all branches below remain as harmless
  // dormant code paths so the sport-scoped derivations keep type-checking.
  const [sport] = useState<Sport>('bike')
  const [, setZoneMode] = useState<ZoneMode>('power')
  // The zones card follows the active sport: run → pace/HR by default, else power.
  useEffect(() => { setZoneMode(sport === 'run' ? 'pace' : 'power') }, [sport])
  const today = useMemo(() => new Date(), [])
  const todayStr = useMemo(() => format(today, 'yyyy-MM-dd'), [today])
  // Which day of the week strip is expanded inline below it (default = today).
  const [selectedDate, setSelectedDate] = useState<string>(todayStr)
  // Select a day and scroll the strip + inline preview into view — used by both
  // the week-strip dots and the session-list rows, so tapping any session opens
  // THAT day's detail inline (never navigates to today's workout).
  const stripRef = useRef<HTMLDivElement>(null)
  const selectDay = (date: string) => {
    setSelectedDate(date)
    stripRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  // How many weeks ahead of the current week we're previewing. 0 = this week
  // (the today-anchored live view); >0 pages into the plan's future weeks.
  const [weekOffset, setWeekOffset] = useState(0)
  // Plan-change interview (credit → delta questions → new week) — V3 flow.
  const [interviewOpen, setInterviewOpen] = useState(false)
  const MAX_WEEK_OFFSET = 12
  const isFuture = weekOffset > 0
  const { data: week, error: weekError } = useCurrentWeek(weekOffset)
  // 409 gate: the backend cannot build a week without FTP/profile. Never
  // paper over it with placeholder numbers — render the honest CTA instead.
  const weekBlocked = weekBlockCode(weekError)
  const { data: brief } = useCoachBrief()
  const { data: profile } = useAthleteProfile()
  const { data: acts } = useActivitiesRange(useMemo(() => subDays(today, 8), [today]), today)

  // Keep the inline-preview selection inside the visible week. This week → today;
  // a future week → its Monday (first day), until the user taps another day.
  useEffect(() => {
    if (weekOffset === 0) setSelectedDate(todayStr)
    else if (week?.week_start) setSelectedDate(week.week_start.slice(0, 10))
  }, [weekOffset, week?.week_start, todayStr])

  const ftp = profile?.ftp_watts ?? null
  const lthrRun = profile?.lthr_running ?? null
  const thrPaceSPerKm = profile?.running_threshold_pace_ms ? 1000 / profile.running_threshold_pace_ms : null
  const meso = week?.meso_block
  const days = week?.days ?? []
  // Yesterday's planned-but-missed bike ride — the week strip only spans
  // today→+6, so yesterday's row can't carry the marker; a small honest chip
  // (non-guilt) surfaces the miss instead. The AdaptiveCard below carries the
  // full reflow/absorb outcome from the live feed.
  const missedYesterday = !isFuture ? (week?.missed_yesterday ?? null) : null
  const missedTitle = de ? (missedYesterday?.title_de || missedYesterday?.title) : missedYesterday?.title
  const missedHint = missedYesterday
    ? (missedYesterday.is_quality
        ? (de ? 'auf einen freien Tag verlegt' : 'moved to a free day')
        : (de ? 'absorbiert — kein Nachholen' : 'absorbed — no make-up'))
    : null
  // Inline day panel — the day the user tapped in the strip.
  const selDay = days.find((d) => d.date === selectedDate) ?? null
  // A future week never contains today, so its today-only surfaces (WOD, session
  // review) must stay collapsed even during the brief selection-reset render.
  const selectedIsToday = !isFuture && (selDay?.is_today ?? (selectedDate === todayStr))
  const workout = brief?.prescribed_workout
  // Session Review for the day trained — attached to the brief for TODAY only.
  const evidence = (brief?.evidence as Record<string, unknown> | undefined) ?? {}
  const athleteEv = (evidence.athlete as Record<string, unknown> | undefined) ?? {}
  // Post-ride review — same resolution as Today, so a completed session is
  // reviewed on the Train page too (not only on Today).
  const review = brief?.post_ride_review ?? loggedReviewFromEvidence(evidence)
  const goalName = athleteEv.goal_target as string | undefined
  // Rest-day truth + brief-failure fallback — the SHARED useTodaySession
  // derivation (same producer as the Today tab; audit P0-3 / finding #1).
  const { isRestDay: sharedIsRestDay, isActiveTrainingDay, fallback } = useTodaySession()
  const decisionState = brief?.daily_decision?.state ?? null
  const isRestDay = useMemo(() => {
    if (decisionState || fallback === 'planned_rest') return sharedIsRestDay || !isActiveTrainingDay
    if (!workout) return true
    const id = (workout.template_id ?? '').toLowerCase()
    return /^(rest|recovery)/.test(id)
  }, [decisionState, fallback, sharedIsRestDay, isActiveTrainingDay, workout])

  const weekStart = week?.week_start ? parseISO(week.week_start) : subDays(today, 7)
  const trainedDays = useMemo(() => new Set((acts?.activities ?? []).filter((a) => (a.tss ?? 0) > 0).map((a) => (a.started_at ?? a.date ?? '').slice(0, 10))), [acts])
  // One matcher for both plan-day sports ('cycling'/'running'/'gym') and activity sports.
  const sportMatch = (s: string) => sport === 'all' || (sport === 'bike' && s === 'cycling') || (sport === 'run' && s === 'running')
  // Everything below is scoped to the toggle so the page never shows one sport's
  // numbers under another's label. 'all' → the combined week.
  const sportDays = useMemo(() => days.filter((d) => sportMatch(d.sport)), [days, sport])
  // A day's prescribed seconds — prefer the explicit target, but fall back to the
  // sum of its interval blocks. LLM personalization can null out
  // `duration_seconds_target` while keeping the interval structure, so this
  // recovers the real planned hours instead of collapsing to "—".
  const dayDurSec = (d: DayPlan) => d.duration_seconds_target ?? ((d.intervals ?? []).reduce((s, iv) => s + (iv.duration_seconds ?? 0), 0))
  // A day is a real session when it carries any prescribed content — content-based
  // so it survives category/duration re-shaping. True rest/gap days have none.
  const isSessionDay = (d: DayPlan) => d.category !== 'rest' && (dayDurSec(d) > 0 || (d.intervals?.length ?? 0) > 0 || (d.target_tss ?? 0) > 0)
  const sportSessions = sportDays.filter(isSessionDay)
  const upcoming = sportDays.filter((d) => isSessionDay(d) && !d.is_today && parseISO(d.date) >= today)
  // Dual-sport shadowed secondary sessions (audit P0-5): their TSS is inside
  // planned_tss_total, so the week list must SHOW that load as visible line
  // items instead of silently dropping it. Split strength vs run by title.
  const shadowSecondary = useMemo(() => {
    const rows = days.filter((d) => (d.secondary_target_tss ?? 0) > 0)
    const isRunTitle = (t: string | null | undefined) => !!t && /\b(run|lauf|jog)/i.test(t)
    const agg = (list: DayPlan[]) => ({
      n: list.length,
      tss: Math.round(list.reduce((s, d) => s + (d.secondary_target_tss ?? 0), 0)),
    })
    const runs = rows.filter((d) => isRunTitle(d.secondary_title))
    const strength = rows.filter((d) => !isRunTitle(d.secondary_title))
    return {
      strength: strength.length > 0 ? agg(strength) : null,
      runs: runs.length > 0 ? agg(runs) : null,
    }
  }, [days])
  const hasSportSessions = sportSessions.length > 0
  const sportWord = sport === 'bike' ? (de ? 'Rad' : 'Bike') : sport === 'run' ? (de ? 'Lauf' : 'Run') : (de ? 'Alle' : 'All')

  // Season arc for THIS card — ONE producer (utils/seasonArc) over the
  // athlete's goal date (profile first, brief evidence as backup) and the
  // PAGED meso block (respects weekOffset), so the season-summary card below
  // always describes the week currently selected in the pager.
  // Audit P0-5: the old three-way fallback (meso ?? stale brief evidence ??
  // Math.round over a non-midnight `now`) flipped 138↔139 depending on the hour.
  const goalEventDate = typeof athleteEv.goal_event_date === 'string' ? athleteEv.goal_event_date as string : null
  const cardArc = useMemo(() => seasonArc({
    targetEventDate: profile?.target_event_date ?? null,
    goalEventDate,
    meso: meso ?? null,
  }), [profile?.target_event_date, goalEventDate, meso])
  // ChapterBar's arc — the ONE shared hook every chapter calls, ALWAYS
  // describing the current week regardless of this tab's own week pager, so
  // the bar can never disagree with Today/Body/History when the user pages
  // through past/future weeks here.
  const arc = useSeasonArc()

  // Plan card — real aggregates, scoped to the selected discipline.
  const weekHours = sportDays.reduce((s, d) => s + dayDurSec(d), 0) / 3600
  const sessionCount = sportSessions.length
  // Sport-specific TSS target = this sport's planned days; 'all' prefers the
  // server's planned_tss_total — THE weekly display target (includes dual-sport
  // shadowed secondary sessions), reconciling header and list (audit P0-5).
  const sportTargetTss = sportDays.reduce((s, d) => s + (d.target_tss ?? 0), 0)
  const weeklyTarget = sport === 'all' ? (week?.planned_tss_total ?? sportTargetTss) : sportTargetTss
  const planName = goalName ?? (de ? 'Trainingsplan' : 'Training Plan')

  // Workout-of-day — sport detection only gates the shared SessionOfTheDay
  // mount (the card itself renders in the shared component; audit: one home).
  const wodSport = workout ? detectWorkoutSport(workout) : 'cycling'
  const wodMatches = !!workout && sportMatch(wodSport)

  const fmtDur = (s: number | null) => {
    if (s == null) return ''
    if (s < 3600) return `${Math.round(s / 60)} min`
    const h = Math.floor(s / 3600)
    const m = Math.round((s % 3600) / 60)
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Plan-status card — plan position + projection + change/illness notes.
  // Plan-level (not sport-scoped): meso weekly target + all-sport completed TSS.
  // ─────────────────────────────────────────────────────────────────────────
  const readiness = week?.readiness ?? null
  const planChanges = week?.plan_changes ?? null

  // planned_tss_total is THE weekly display target (sum of all planned rows
  // incl. shadowed secondaries); the meso figure is advisory-only fallback.
  const planTarget = week?.planned_tss_total ?? meso?.weekly_tss_target ?? 0
  const planDone = useMemo(() => (acts?.activities ?? [])
    .filter((a) => parseISO(a.started_at ?? a.date ?? '') >= weekStart)
    .reduce((s, a) => s + (a.tss ?? 0), 0), [acts, weekStart])
  const planPct = planTarget > 0 ? Math.min(100, (planDone / planTarget) * 100) : 0

  // ── Top PlanCard (.pen TqTJw) — season summary that taps into the Season
  // detail (.pen pTlXd / SeasonView). Week-of-block badge + block progress bar
  // + Weeks-left / Week-hours / Sessions / Week-load stats. Real meso data;
  // honest "—" where a figure is absent.
  const blockBadge = cardArc.weekInBlock != null && cardArc.blockWeeks != null && cardArc.blockWeeks > 0
    ? (de ? `Woche ${cardArc.weekInBlock} / ${cardArc.blockWeeks}` : `Week ${cardArc.weekInBlock} / ${cardArc.blockWeeks}`)
    : phaseLabel(meso?.phase ?? null, de)
  const blockPct = cardArc.weekInBlock != null && cardArc.blockWeeks != null && cardArc.blockWeeks > 0
    ? Math.min(100, (cardArc.weekInBlock / cardArc.blockWeeks) * 100)
    : planPct
  const planStats: [string, string][] = [
    cardArc.weeksToEvent != null
      ? [`${cardArc.weeksToEvent}`, de ? 'Wochen übrig' : 'Weeks left']
      : cardArc.blockWeeks != null
        ? [`${cardArc.blockWeeks}`, de ? 'Wochen Aufbau' : 'Week block']
        : ['—', de ? 'Wochen übrig' : 'Weeks left'],
    [weekHours > 0 ? `${weekHours.toFixed(1)}h` : '—', de ? 'Std./Woche' : 'Week hours'],
    [`${sessionCount}`, de ? 'Einheiten' : 'Sessions'],
    [weeklyTarget > 0 ? `${Math.round(weeklyTarget)}` : '—', de ? 'Wochenlast' : 'Week load'],
  ]

  // Zone 3 — notes. Color + icon keyed off readiness status (falls back to plan_changes).
  // 'none' sentinel = no readiness signal (never rendered as text).
  const readyStatus = readiness?.status ?? 'none'
  const noteColor = readyStatus === 'illness' ? 'var(--color-move)'
    : readyStatus === 'overreaching' ? 'var(--color-amber)'
      : readyStatus === 'amber' ? 'var(--color-amber)'
        : readyStatus === 'green' ? 'var(--color-recovery)'
          : 'var(--color-muted)'
  const NoteIcon = readyStatus === 'illness' ? Thermometer
    : readyStatus === 'overreaching' ? Flame
      : readyStatus === 'amber' ? AlertTriangle
        : readyStatus === 'green' ? Check
          : Info
  const hasChangeNote = !!planChanges?.message?.trim()

  // ── Per-session sport-specific meta derivation (Upcoming rows) ──
  // Category → representative zone when a session carries no interval blocks.
  const CAT_ZONE: Record<string, number> = { recovery: 1, endurance: 2, tempo: 3, sweet_spot: 4, threshold: 4, vo2: 5 }
  const cap = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  // Localized category word; unmapped categories fall back to capitalization.
  const catLabel = (c: string) => { const e = CAT_LABEL[c]; return e ? (de ? e.de : e.en) : cap(c) }
  // Run pace range for a zone, from threshold pace + RUN_PACE bands.
  const runPaceForZone = (z: number): string | null => {
    if (thrPaceSPerKm == null) return null
    const band = RUN_PACE[Math.min(RUN_PACE.length - 1, Math.max(0, z - 1))]
    const faster = fmtPace(thrPaceSPerKm / band.hi)
    const slower = band.lo > 0 ? fmtPace(thrPaceSPerKm / band.lo) : null
    return slower ? `${faster}–${slower}` : `>${faster}`
  }
  // Run HR range for a zone, from LTHR + RUN_HR bands.
  const runHrForZone = (z: number): string | null => {
    if (lthrRun == null) return null
    const band = RUN_HR[Math.min(RUN_HR.length - 1, Math.max(0, z - 1))]
    const lo = Math.round(band.lo * lthrRun)
    const hi = band.hi > 0 ? Math.round(band.hi * lthrRun) : null
    return hi ? `${lo}–${hi}` : `${lo}+`
  }
  // Secondary meta line, framed by discipline: bike→watts, run→pace/HR, gym→focus.
  const sessionMeta = (d: DayPlan): string => {
    if (d.sport === 'gym') {
      return [d.category && d.category !== 'rest' ? catLabel(d.category) : null, de ? 'Kraft' : 'Strength'].filter(Boolean).join(' · ')
    }
    if (d.sport === 'running') {
      const z = definingZone(d.intervals, d.category) ?? CAT_ZONE[d.category] ?? 2
      const pace = runPaceForZone(z)
      const hr = runHrForZone(z)
      const parts = pace
        ? [`${pace} /km`, `Z${z}`]
        : hr
          ? [`Z${z}`, `${hr} bpm`]
          : [`Z${z}`, catLabel(d.category)]
      return parts.filter(Boolean).join(' · ')
    }
    // cycling → SESSION-level headline (Ø watts · dominant zone · TSS); the
    // interval peak lives in its own labeled sub-line (sessionPeakSub) so peak
    // watts are never paired with session TSS again (audit P2-14).
    const avgW = cyclingAvgWatts(d.intervals, ftp)
    // Badge = the session's defining effort (hardest sustained zone), never
    // the time-dominant zone — a VO₂ day must not wear "Z1" (finding #5).
    const z = definingZone(d.intervals, d.category) ?? CAT_ZONE[d.category] ?? 2
    return [avgW != null ? `Ø ${avgW} W` : null, `Z${z}`, d.target_tss ? `${Math.round(d.target_tss)} TSS` : null].filter(Boolean).join(' · ')
  }
  // Labeled peak sub-line for cycling sessions — WorkoutDetailView's peakChip
  // grammar ("Spitzen: 4×15 Min @ 276 W (92 % FTP)"); null when meaningless.
  const sessionPeakSub = (d: DayPlan): string | null =>
    d.sport === 'cycling' ? cyclingPeakLine(d.intervals, ftp, de) : null

  // ── Week navigation labels ──
  // Date range like "21–27 Jul" (or cross-month "28 Jul – 3 Aug").
  const weekRangeLabel = useMemo(() => {
    if (!week?.week_start || !week?.week_end) return ''
    const ws = parseISO(week.week_start)
    const we = parseISO(week.week_end)
    const dm = de ? 'd. MMM' : 'd MMM'
    return ws.getMonth() === we.getMonth()
      ? `${formatDate(ws, 'd', locale)}–${formatDate(we, dm, locale)}`
      : `${formatDate(ws, dm, locale)} – ${formatDate(we, dm, locale)}`
  }, [week?.week_start, week?.week_end, de, locale])
  // Primary label: "This week" / "Next week" / the date range beyond that.
  const weekLabel = weekOffset === 0 ? (de ? 'Diese Woche' : 'This week')
    : weekOffset === 1 ? (de ? 'Nächste Woche' : 'Next week')
      : weekRangeLabel
  // Header target = the server's planned_tss_total (sum of every planned row
  // incl. shadowed secondaries) so header and day list always reconcile.
  const weekTssTarget = week?.planned_tss_total ?? meso?.weekly_tss_target ?? 0

  // ── 409 gate (finding #2): no FTP/profile → the backend has NO week to
  // show. Render the honest, actionable empty state — never a placeholder
  // plan with fabricated zero-watt sessions. (After all hooks; safe return.)
  if (weekBlocked && !week) {
    return (
      <div className="flex flex-col gap-6 pb-4">
        <ChapterBar chapter="plan" arc={arc} de={de} />
        <div className="rounded-[24px] flex flex-col items-center text-center" style={{ ...cardStyle, gap: 14, padding: '32px 24px' }}>
          <div className="grid place-items-center rounded-full" style={{ width: 52, height: 52, background: 'var(--color-accent-soft)' }}>
            <Zap size={26} strokeWidth={2.2} style={{ color: 'var(--color-accent)' }} />
          </div>
          <div className="flex flex-col" style={{ gap: 6 }}>
            <h2 className="num-display" style={{ fontSize: 20, color: 'var(--color-ink)' }}>
              {de ? 'Noch kein Plan' : 'No plan yet'}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>
              {weekBlocked === 'ftp_required'
                ? (de
                  ? 'Wir brauchen deine FTP, um deinen Trainingsplan zu bauen — Wattbereiche und Belastung hängen daran.'
                  : 'We need your FTP to build your training plan — watt ranges and load depend on it.')
                : (de
                  ? 'Wir brauchen noch ein paar Angaben in deinem Profil, um deinen Trainingsplan zu bauen.'
                  : 'We need a few more profile details to build your training plan.')}
            </p>
          </div>
          <Link
            to="/profile"
            className="inline-flex items-center justify-center gap-1.5 rounded-full px-6 min-h-[48px]"
            style={{ background: 'var(--color-accent)', color: '#FFFFFF', fontSize: 14, fontWeight: 700 }}
          >
            {weekBlocked === 'ftp_required'
              ? (de ? 'FTP jetzt eintragen' : 'Enter your FTP')
              : (de ? 'Profil vervollständigen' : 'Complete your profile')}
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      <ChapterBar chapter="plan" arc={arc} de={de} />
      {/* Top PlanCard (.pen TqTJw) — the season-summary card the V3 · Train
          frame leads with. Tapping it opens the Season & Race Day detail
          (.pen pTlXd → /season). Real meso data; honest "—" where absent. */}
      <Link to="/season" className="rounded-[24px] p-5 hover-card flex flex-col gap-4" style={cardStyle}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="eyebrow" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.11em', color: 'var(--color-muted)' }}>
              {de ? 'TRAININGSPLAN' : 'TRAINING PLAN'}
            </span>
            <span className="num-display line-clamp-2" style={{ fontSize: 22, color: 'var(--color-ink)' }}>{planName}</span>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1.5">
            <span className="inline-flex items-center rounded-full px-3 py-1.5" style={{ background: 'color-mix(in srgb, var(--color-recovery) 16%, transparent)', color: 'var(--color-recovery)', fontSize: 12, fontWeight: 700 }}>{blockBadge}</span>
            <span className="hover-arrow"><ChevronRight size={16} style={{ color: 'var(--color-muted)' }} /></span>
          </span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: 'var(--color-surface-2)', overflow: 'hidden' }}>
          <div style={{ width: `${blockPct}%`, height: '100%', borderRadius: 999, background: 'var(--color-recovery)' }} />
        </div>
        <div className="flex gap-3">
          {planStats.map(([v, l], i) => (
            <div key={i} className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="num-display" style={{ fontSize: 20, color: 'var(--color-ink)' }}>{v}</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)', lineHeight: 1.25 }}>{l}</span>
            </div>
          ))}
        </div>
        {/* Hours reconciliation — the CTL-anchored ramp explained (real data). */}
        {meso?.hours_note != null && (
          <span style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>
            {de ? meso.hours_note.de : meso.hours_note.en}
          </span>
        )}
      </Link>

      {/* Sport toggle removed — bike-only product (sport is fixed to 'bike'). */}

      {/* Week navigation — page between this week and future plan weeks.
          Prev is disabled at offset 0 (no paging into the past here); next is
          capped at the plan's forward horizon. */}
      <div className="flex items-center gap-2 rounded-[20px] p-2" style={cardStyle}>
        <button type="button" aria-label={de ? 'Vorherige Woche' : 'Previous week'}
          onClick={() => setWeekOffset((o) => Math.max(0, o - 1))} disabled={weekOffset === 0}
          className="shrink-0 grid place-items-center rounded-full"
          style={{ width: 40, height: 40, background: weekOffset === 0 ? 'transparent' : 'var(--color-surface-2)', opacity: weekOffset === 0 ? 0.35 : 1, cursor: weekOffset === 0 ? 'default' : 'pointer' }}>
          <ChevronLeft size={20} strokeWidth={2.2} style={{ color: 'var(--color-ink-2)' }} />
        </button>
        <div className="flex-1 min-w-0 flex flex-col items-center" style={{ gap: 2 }}>
          <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{weekLabel}</span>
          <span className="truncate" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--color-muted)' }}>
            {[weekRangeLabel, phaseLabel(meso?.phase ?? null, de), weekTssTarget > 0 ? `${weekTssTarget} TSS` : null].filter(Boolean).join(' · ')}
          </span>
        </div>
        <button type="button" aria-label={de ? 'Nächste Woche' : 'Next week'}
          onClick={() => setWeekOffset((o) => Math.min(MAX_WEEK_OFFSET, o + 1))} disabled={weekOffset >= MAX_WEEK_OFFSET}
          className="shrink-0 grid place-items-center rounded-full"
          style={{ width: 40, height: 40, background: weekOffset >= MAX_WEEK_OFFSET ? 'transparent' : 'var(--color-surface-2)', opacity: weekOffset >= MAX_WEEK_OFFSET ? 0.35 : 1, cursor: weekOffset >= MAX_WEEK_OFFSET ? 'default' : 'pointer' }}>
          <ChevronRight size={20} strokeWidth={2.2} style={{ color: 'var(--color-ink-2)' }} />
        </button>
      </div>

      {/* Week strip */}
      {days.length > 0 && (
        <div ref={stripRef} className="flex gap-1.5">
          {days.map((d) => {
            const dd = parseISO(d.date)
            const done = trainedDays.has(d.date.slice(0, 10))
            const isToday = d.is_today
            const isSelected = d.date === selectedDate
            const rest = d.category === 'rest'
            // Days outside the selected discipline fade back so the strip reads as this sport's week.
            const offSport = !rest && !sportMatch(d.sport)
            const dotColor = d.sport === 'running' ? 'var(--color-exercise)' : d.sport === 'gym' ? 'var(--color-amber)' : 'var(--color-strain)'
            const dark = isSelected
            return (
              <button key={d.date} type="button" onClick={() => selectDay(d.date)}
                className="flex-1 flex flex-col items-center gap-1.5 rounded-2xl py-2.5 transition-colors"
                style={{
                  background: isSelected ? 'var(--color-accent)' : 'var(--color-paper-2)',
                  border: isSelected ? 'none' : isToday ? '1px solid var(--color-accent)' : '1px solid var(--color-rule)',
                  opacity: offSport && !isSelected ? 0.4 : 1,
                }}>
                <span className="eyebrow" style={{ fontSize: 10, fontWeight: 600, color: dark ? 'rgba(10,12,15,0.65)' : isToday ? 'var(--color-accent)' : 'var(--color-muted)' }}>{formatDate(dd, de ? 'EEEEEE' : 'EEE', locale)}</span>
                <span className="num-display" style={{ fontSize: 15, color: dark ? '#0A0C0F' : 'var(--color-ink)' }}>{format(dd, 'd')}</span>
                {done ? <Check size={14} strokeWidth={3} style={{ color: dark ? '#0A0C0F' : 'var(--color-recovery)' }} />
                  : <span style={{ width: 7, height: 7, borderRadius: 999, background: dark ? '#0A0C0F' : rest || offSport ? 'var(--color-surface-3)' : dotColor }} />}
              </button>
            )
          })}
        </div>
      )}

      {/* Missed yesterday — small honest marker (the strip can't hold yesterday's
          row). Non-guilt; the AdaptiveCard below shows how the plan absorbs it. */}
      {missedYesterday && (
        <div className="flex items-center gap-2.5 rounded-2xl px-3.5 py-3" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
          <span className="shrink-0 rounded-full px-2 py-0.5" style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-amber)', background: 'color-mix(in srgb, var(--color-amber) 16%, transparent)' }}>{de ? 'Ausgefallen' : 'Missed'}</span>
          <span className="flex-1 min-w-0" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--color-ink)', lineHeight: 1.35 }}>
            <span style={{ fontWeight: 700 }}>{missedTitle}</span>
            <span style={{ color: 'var(--color-muted)' }}>{de ? ' gestern' : ' yesterday'}{missedHint ? ` — ${missedHint}` : ''}</span>
          </span>
        </div>
      )}

      {/* Violet AdaptiveCard (pen JnlgK) — live adaptation feed, newest rows +
          "Was sich geändert hat" timeline. Now-only: a future-week preview
          shows the plan, not the adaptation chrome. */}
      {!isFuture && <AdaptiveCard />}

      {/* Session Review lives on the Today tab ONLY (usability audit: one home
          per surface) — from here it's a one-line link, never a second mount. */}
      {selectedIsToday && review && (
        <Link to="/dashboard?tab=today" className="hover-card flex items-center gap-3 rounded-[20px] p-3.5" style={cardStyle}>
          <ListChecks size={18} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          <span className="flex-1 min-w-0 truncate" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>
            {de ? 'Session-Review von heute — auf „Heute“ ansehen' : 'Today’s session review — view it on Today'}
          </span>
          <ChevronRight size={16} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
        </Link>
      )}

      {/* Rest day — sport-agnostic recovery state; no Start button, no target chips. */}
      {selectedIsToday && workout && isRestDay && (
        <div className="rounded-[24px] p-5 flex items-center gap-3.5" style={cardStyle}>
          <div className="shrink-0 grid place-items-center rounded-full" style={{ width: 44, height: 44, background: 'var(--color-surface-2)' }}>
            <Moon size={22} strokeWidth={2} style={{ color: 'var(--color-recovery)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{de ? 'Ruhetag' : 'Rest day'}</div>
            <div style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>{de ? 'Erholung & Regeneration — keine Einheit geplant.' : 'Recovery & regeneration — no session prescribed.'}</div>
          </div>
        </div>
      )}

      {/* Einheit des Tages — the ONE shared session card (identical mount on
          the Today tab): same data source, same pixels, same "Anpassen" +
          "Rückgängig" flow. Mounted when today's session matches the sport
          toggle, or when the brief is unavailable (honest week-plan fallback
          renders inside the component). */}
      {/* Post-ride review — when today's selected and it's been trained, show
          the same "Einheit im Rückblick" card as Today. */}
      {selectedIsToday && review && <SessionReviewCard review={review} de={de} />}

      {selectedIsToday && !isRestDay && (workout ? wodMatches : true) && (
        <SessionOfTheDay />
      )}

      {/* No matching session today — sport-aware graceful state (never bike data under Lauf).
          Rest days are handled by their own card above, so exclude them here. */}
      {selectedIsToday && !isRestDay && (workout ? !wodMatches : fallback !== 'planned_session') && (
        <div className="rounded-[24px] p-5 flex items-center gap-3.5" style={cardStyle}>
          <div className="shrink-0 grid place-items-center rounded-full" style={{ width: 44, height: 44, background: 'var(--color-surface-2)' }}>
            {sport === 'run' ? <Footprints size={22} strokeWidth={2} style={{ color: 'var(--color-exercise)' }} />
              : sport === 'bike' ? <Bike size={22} strokeWidth={2} style={{ color: 'var(--color-strain)' }} />
              : <InfinityIcon size={22} strokeWidth={2} style={{ color: 'var(--color-muted)' }} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>
              {hasSportSessions
                ? (de ? `Heute keine ${sportWord}-Einheit` : `No ${sportWord.toLowerCase()} session today`)
                : (de ? `Keine ${sportWord}-Einheiten geplant` : `No ${sportWord.toLowerCase()} sessions planned`)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>
              {hasSportSessions
                ? (de ? 'Deine nächste steht unten in „Diese Woche“.' : 'Your next one is below in “This Week”.')
                : (de ? 'Wechsle die Sportart oben oder plane eine Einheit.' : 'Switch discipline above or add a session.')}
            </div>
          </div>
        </div>
      )}

      {/* Inline panel for a NON-today day tapped in the strip — no navigation, detail in place. */}
      {!selectedIsToday && (() => {
        const dLabel = formatDate(parseISO(selectedDate), de ? 'EEEE, d. MMM' : 'EEEE, MMM d', locale)
        // Rest ONLY when the day has no actual work — key off real intervals/TSS/
        // duration, not the category label, so a mislabeled day with a real
        // session never wrongly collapses to "Rest day".
        const hasWork = !!selDay && (dayDurSec(selDay) > 0 || (selDay.intervals?.length ?? 0) > 0 || (selDay.target_tss ?? 0) > 0)
        if (!hasWork) {
          return (
            <div className="rounded-[24px] p-5 flex items-center gap-3.5" style={cardStyle}>
              <div className="shrink-0 grid place-items-center rounded-full" style={{ width: 44, height: 44, background: 'var(--color-surface-2)' }}>
                <Moon size={22} strokeWidth={2} style={{ color: 'var(--color-recovery)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{de ? 'Ruhetag' : 'Rest day'}</div>
                <div style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>{dLabel} · {de ? 'Erholung & Regeneration' : 'Recovery & regeneration'}</div>
              </div>
            </div>
          )
        }
        const meta = SPORT_META[(selDay.sport as WorkoutSport)] ?? SPORT_META.cycling
        const ivs = selDay.intervals ?? []
        const ivFrac = (iv: DayPlan['intervals'][number]) => iv.power_target_pct_ftp ? Math.min(1, iv.power_target_pct_ftp / 1.25) : Math.min(1, iv.zone / 7)
        return (
          <div className="rounded-[24px] p-5 flex flex-col gap-4" style={cardStyle}>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center rounded-full px-3 py-1.5" style={{ background: 'var(--color-surface-2)', color: 'var(--color-ink-2)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em' }}>{de ? 'VORSCHAU' : 'PREVIEW'} · {formatDate(parseISO(selectedDate), de ? 'EEE, d. MMM' : 'EEE, MMM d', locale)}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ background: 'var(--color-surface-3)', fontSize: 12, color: 'var(--color-ink-2)' }}><meta.Icon size={13} style={{ color: meta.color }} /> {de ? meta.de : meta.en}</span>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)' }}>{selDay.title}</h2>
              {selDay.rationale && <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>{selDay.rationale}</p>}
            </div>

            {/* Effort profile — zone bars from the day's intervals (bike/run). */}
            {ivs.length > 0 && selDay.sport !== 'gym' && (
              <div className="rounded-2xl p-3.5 flex flex-col gap-2.5" style={{ background: 'var(--color-paper)' }}>
                <div className="flex items-center justify-between">
                  <span className="eyebrow" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-ink-2)' }}>{selDay.sport === 'running' ? (de ? 'PACE-/HF-PROFIL' : 'PACE / HR PROFILE') : (de ? 'LEISTUNGSPROFIL' : 'POWER PROFILE')}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-2)' }}>{ivs.length} {de ? 'Blöcke' : 'blocks'}</span>
                </div>
                <div className="flex items-end gap-[3px]" style={{ height: 72 }}>
                  {ivs.map((iv, i) => (
                    <div key={i} className="flex-1 rounded-t" style={{ height: `${Math.max(12, Math.min(72, ivFrac(iv) * 72))}px`, background: zoneBarColor(iv.zone) }} />
                  ))}
                </div>
              </div>
            )}

            {/* Key targets — mirror the WOD hero chips: duration, TSS, sport-framed peak. */}
            <div className="flex gap-2 flex-wrap">
              {([
                ...(selDay.duration_seconds_target ? [{ icon: Clock, t: fmtDur(selDay.duration_seconds_target) }] : []),
                ...(selDay.target_tss ? [{ icon: Zap, t: `${Math.round(selDay.target_tss)} TSS` }] : []),
                { icon: selDay.sport === 'running' ? Heart : Target, t: sessionMeta(selDay) },
              ]).map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 num-mono" style={{ background: 'var(--color-paper-2)', fontSize: 12, fontWeight: 600, color: 'var(--color-ink)' }}>
                  <c.icon size={13} style={{ color: 'var(--color-accent)' }} /> {c.t}
                </span>
              ))}
            </div>
            {sessionPeakSub(selDay) && (
              <p style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--color-muted)' }}>{sessionPeakSub(selDay)}</p>
            )}

            {/* Open the full detail page for THIS planned day (same layout as today). */}
            <Link to={`/workout/${selectedDate}`} className="inline-flex items-center justify-center gap-2 rounded-full py-3 min-h-[44px]" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)', fontSize: 14, fontWeight: 700 }}>
              <Target size={16} strokeWidth={2.4} /> {de ? 'Ganzes Workout ansehen' : 'View full workout'}
            </Link>
          </div>
        )
      })()}

      {/* Upcoming — the selected week's remaining sessions. On a future week each
          row selects that day's inline preview (no live "start" for a future day);
          this week keeps the workout link. */}
      {(upcoming.length > 0 || shadowSecondary.strength != null || shadowSecondary.runs != null) && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)' }}>{weekOffset === 0 ? (de ? 'Diese Woche' : 'This Week') : weekLabel}</span>
            {upcoming.length > 0 && (
              <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>{upcoming.length} {de ? 'Einheiten' : 'sessions'}</span>
            )}
          </div>
          {upcoming.map((d) => {
            const isRun = d.sport === 'running'
            const isGym = d.sport === 'gym'
            const Icon = isGym ? Dumbbell : isRun ? Footprints : Bike
            // Colour by INTENSITY, not by sport. Sport was the old key, which
            // in a bike-only app painted all five rows the same colour and hid
            // the only axis that distinguishes them. The sport still shows —
            // in the glyph — but the eye now reads the week's shape.
            const step = intensityStep(d.category)
            const col = step.color
            const zoneName = intensityLabel(d.category, de)
            const RowBody = (
              <>
                <div className="flex items-center gap-3.5">
                  <div className="shrink-0 grid place-items-center rounded-full" style={{ width: 44, height: 44, background: `color-mix(in srgb, ${col} 18%, transparent)`, border: `1px solid color-mix(in srgb, ${col} 40%, transparent)` }}>
                    <Icon size={20} strokeWidth={2} style={{ color: col }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* clamp-2 (textfit): session titles wrap, never truncate */}
                    <div className="num-display line-clamp-2" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{d.title}</div>
                    {zoneName && (
                      <span className="inline-flex items-center gap-1.5 rounded-full mt-1 mb-0.5" style={{ padding: '2px 8px', background: `color-mix(in srgb, ${col} 15%, transparent)`, border: `1px solid color-mix(in srgb, ${col} 35%, transparent)` }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', color: col }}>{step.zone ? `${step.zone} · ` : ''}{zoneName}</span>
                      </span>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{sessionMeta(d)}</div>
                    {sessionPeakSub(d) && (
                      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>{sessionPeakSub(d)}</div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{fmtDur(d.duration_seconds_target)}</span>
                    <span className="num-mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{formatDate(parseISO(d.date), 'EEE', locale)}</span>
                  </div>
                  <span className="hover-arrow"><ChevronRight size={16} style={{ color: 'var(--color-muted)' }} /></span>
                </div>
                <div className="hover-reveal">
                  <div className="flex items-center gap-3 pt-2" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-ink-2)' }}>
                    <span>{sessionMeta(d)}</span>
                    <span>{fmtDur(d.duration_seconds_target)}</span>
                    <span>{formatDate(parseISO(d.date), 'EEEE', locale)}</span>
                    <span className="ml-auto" style={{ fontWeight: 700, color: 'var(--color-accent)' }}>{de ? 'Öffnen →' : 'Open →'}</span>
                  </div>
                </div>
              </>
            )
            // Tapping any session row (this week or future) opens THAT day's
            // detail inline — never navigates to today's workout.
            return (
              <button key={d.date} type="button" onClick={() => selectDay(d.date)}
                className="flex flex-col rounded-[20px] p-3.5 hover-card text-left relative overflow-hidden" style={cardStyle}>
                {/* Intensity spine — a 3 px bar down the leading edge in the
                    session's colour. Scanning the stack top-to-bottom, these
                    spines ARE the week's shape: where the hard days fall, how
                    they're spaced, whether two sit back-to-back. No text can
                    be read that fast. */}
                <span
                  aria-hidden
                  style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                    background: col,
                    opacity: 0.9,
                  }}
                />
                {RowBody}
              </button>
            )
          })}
          {/* Shadowed dual-sport load — slim, neutral line items so the week's
              visible sessions add up to the header's planned_tss_total. */}
          {shadowSecondary.strength && (
            <div className="flex items-center gap-3 rounded-[16px] px-3.5 py-2.5" style={cardStyle}>
              <Dumbbell size={15} strokeWidth={2} style={{ color: 'var(--color-amber)', flexShrink: 0 }} />
              <span className="num-mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink-2)' }}>
                {de
                  ? `Kraft ×${shadowSecondary.strength.n} · ${shadowSecondary.strength.tss} TSS`
                  : `Strength ×${shadowSecondary.strength.n} · ${shadowSecondary.strength.tss} TSS`}
              </span>
            </div>
          )}
          {shadowSecondary.runs && (
            <div className="flex items-center gap-3 rounded-[16px] px-3.5 py-2.5" style={cardStyle}>
              <Footprints size={15} strokeWidth={2} style={{ color: 'var(--color-exercise)', flexShrink: 0 }} />
              <span className="num-mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink-2)' }}>
                {de
                  ? `Lauf ×${shadowSecondary.runs.n} · ${shadowSecondary.runs.tss} TSS`
                  : `Run ×${shadowSecondary.runs.n} · ${shadowSecondary.runs.tss} TSS`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Hinweise — plan changes / readiness stay VISIBLE outside the
          accordion (adaptation is never hidden, spec law 2); the calm/empty
          filler states are dropped (P2-13 de-clutter). Now-only. */}
      {!isFuture && (hasChangeNote || readiness?.reason) && (
        <div className="rounded-[24px] p-5 flex flex-col" style={{ ...cardStyle, gap: 10 }}>
          <div className="flex items-center gap-2">
            <Info size={14} style={{ color: 'var(--color-muted)' }} />
            <span className="eyebrow" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-muted)' }}>{de ? 'HINWEISE' : 'NOTES'}</span>
          </div>
          {hasChangeNote ? (
            <div className="flex items-start gap-3 rounded-2xl p-3.5" style={{ background: `color-mix(in srgb, ${noteColor} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${noteColor} 30%, transparent)` }}>
              <span className="shrink-0 grid place-items-center rounded-full" style={{ width: 28, height: 28, background: `color-mix(in srgb, ${noteColor} 20%, transparent)`, marginTop: 1 }}>
                <NoteIcon size={15} style={{ color: noteColor }} />
              </span>
              <div className="flex flex-col" style={{ gap: 2 }}>
                <span style={{ fontSize: 13, color: 'var(--color-ink)', lineHeight: 1.4 }}>{planChanges!.message}</span>
                {readiness?.reason && readiness.reason !== planChanges!.message && (
                  <span style={{ fontSize: 11.5, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>{readiness.reason}</span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-2xl p-3.5" style={{ background: `color-mix(in srgb, ${noteColor} 12%, transparent)` }}>
              <NoteIcon size={16} style={{ color: noteColor, flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13, color: 'var(--color-ink)', lineHeight: 1.4 }}>{readiness?.reason}</span>
            </div>
          )}
        </div>
      )}

      {/* Plan & goal — the natural way to reshape the plan or switch the goal.
          The 3-step interview handles less time / new event / no event / "too
          boring" / hours / days and rebuilds the weeks. Replaces the removed
          per-sport Focus picker. */}
      <button
        type="button"
        onClick={() => setInterviewOpen(true)}
        className="hover-card rounded-[24px] p-5 flex items-center gap-4 text-left w-full"
        style={{ ...cardStyle, cursor: 'pointer' }}
      >
        <span className="grid place-items-center rounded-full shrink-0" style={{ width: 48, height: 48, background: 'var(--color-accent-soft)' }}>
          <SlidersHorizontal size={22} style={{ color: 'var(--color-accent)' }} />
        </span>
        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="num-display" style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-ink)' }}>
            {de ? 'Plan & Ziel ändern' : 'Change plan & goal'}
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
            {de
              ? 'Neues Ziel-Event oder andere Präferenzen? Wähle deinen Weg — der Coach baut deine Wochen neu.'
              : 'A new target event or different preferences? Pick your path — the coach rebuilds your weeks.'}
          </span>
        </span>
        <ChevronRight size={18} className="hover-arrow shrink-0" style={{ color: 'var(--color-accent)' }} />
      </button>

      {/* Secondary plan tools: BYO plan import + custom-workout builder. */}
      <div className="flex flex-wrap gap-2">
        {/* Bring-your-own plan → PDF/image import + adaptation (P: plan-upload) */}
        <Link to="/plan/import" className="hover-card inline-flex items-center gap-2 rounded-full px-4 py-2" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', fontSize: 12.5, fontWeight: 700, color: 'var(--color-ink-2)', minHeight: 40 }}>
          <FileUp size={14} style={{ color: 'var(--color-accent)' }} />
          {de ? 'Eigenen Plan importieren (PDF/Bild)' : 'Import your own plan (PDF/image)'}
        </Link>
        {/* Custom structured-workout builder (Zwift-style block editor) */}
        <Link to="/workouts/builder" className="hover-card inline-flex items-center gap-2 rounded-full px-4 py-2" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', fontSize: 12.5, fontWeight: 700, color: 'var(--color-ink-2)', minHeight: 40 }}>
          <Plus size={14} style={{ color: 'var(--color-accent)' }} />
          {de ? 'Eigenes Workout erstellen' : 'Create custom workout'}
        </Link>
      </div>

      <PlanChangeInterview open={interviewOpen} onClose={() => setInterviewOpen(false)} />

      {/* Fortschritt & Potenzial — a single nav entry (not a second sport picker).
          Follows the toggle: it opens the progression screen for the active discipline. */}
      {(() => {
        const prog = sport === 'run'
          ? { to: '/progress/run', Icon: Footprints, color: 'var(--color-exercise)', label: de ? 'Lauf-Fortschritt' : 'Run progress' }
          : sport === 'all'
            ? { to: '/progress/bike', Icon: InfinityIcon, color: 'var(--color-accent)', label: de ? 'Fortschritt & Potenzial' : 'Progress & potential' }
            : { to: '/progress/bike', Icon: Bike, color: 'var(--color-strain)', label: de ? 'Rad-Fortschritt' : 'Bike progress' }
        return (
          <Link to={prog.to} className="rounded-[24px] p-4 flex items-center gap-3.5 hover-card" style={cardStyle}>
            <div className="shrink-0 grid place-items-center rounded-full" style={{ width: 44, height: 44, background: `color-mix(in srgb, ${prog.color} 18%, transparent)` }}>
              <prog.Icon size={22} strokeWidth={2} style={{ color: prog.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="eyebrow" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-muted)' }}>{de ? 'FORTSCHRITT & POTENZIAL' : 'PROGRESS & POTENTIAL'}</span>
              <div className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{prog.label}</div>
            </div>
            <span className="hover-arrow"><ChevronRight size={18} style={{ color: 'var(--color-muted)' }} /></span>
          </Link>
        )
      })()}
    </div>
  )
}
