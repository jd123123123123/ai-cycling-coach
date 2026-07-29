/**
 * TodayTab — V3 order from pencil-new.pen "V3 · Today" (OwSbv, Content u15pVY):
 * 1 Greeting Header (greeting + the WeatherNudge chip, full-width beneath) →
 * 2 Race chip (goal countdown → /season) → 3 Recovery/readiness card (hero) →
 * 4 Workout card (decision-keyed; honest "Workout ansehen" CTA — no Start
 *   button, user decision) or the V3 Rest Card (pen JhT2g) on planned_rest →
 * 5 Load snapshot (TheRoadCard: Fitness/Fatigue/Form + plain words).
 * Below the V3 five: Diese-Woche and "Woche als Story" as one slim link row
 * each, plus the athlete-status control (feeds the coach interlock).
 * Removed mounts (P2 dedupe): HRV/Ruhepuls/Strain tile row (Recovery owns
 * them), RecoveryEtaCard (Recovery owns the outlook), LevelStripCard
 * (Achievements/History own progress). Every value is real Garmin/backend data.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { COACH_BRIEF_KEY_ROOT } from '../../../hooks/useCoachBrief'
import { subDays } from 'date-fns'
import { formatDate } from '../../../utils/format'
import { Link } from 'react-router-dom'
import { Bike, MessageCircle, ChevronRight, TrendingUp, TrendingDown, CalendarCheck, Moon, Sparkles, RefreshCw, Sun, Activity, HeartPulse, BrainCircuit, Info } from 'lucide-react'
import { loggedReviewFromEvidence, streamCoachChat, workoutDisplayTitle, type ChatMessage, type ResolvedBlock } from '../../../api/coach'
import SessionReviewCard from '../SessionReviewCard'
import SessionOfTheDay from '../SessionOfTheDay'
import WeatherWindowCard from '../WeatherWindowCard'
import FitnessFreshnessCard from '../FitnessFreshnessCard'
import ThisWeekCard from '../ThisWeekCard'
import ExtraSessionsCard from '../ExtraSessionsCard'
import { useAura, type RoadPayload } from '../AuraContext'
import { buildRoadProfile, steadyBlock, type RoadProfile } from '../../../utils/roadProfile'
import { roadMode, type RoadMode } from '../../../utils/roadMode'
import { usePowerProfile } from '../../../hooks/usePowerProfile'
import BreakthroughCelebration from '../BreakthroughCelebration'
import WeeklyWrappedBanner from '../WeeklyWrappedBanner'
import AbsorptionCard from '../AbsorptionCard'
import MorningHealthCard from '../MorningHealthCard'
import { useStreak, type WeekConsistency } from '../../../hooks/useStreak'
import { useCurrentWeek } from '../../../hooks/useCurrentWeek'
import { usePlanAdaptations } from '../../../hooks/usePlanAdaptations'
import { useTodaySession, sessionIntensity } from '../../../hooks/useTodaySession'
import { useTodayWeather } from '../../../hooks/useTodayWeather'
import { useDailyMetrics } from '../../../hooks/useDailyMetrics'
import { useTodaySnapshot } from '../../../hooks/useTodaySnapshot'
import { usePMC } from '../../../hooks/usePMC'
import { useActivitiesRange } from '../../../hooks/useActivitiesRange'
import { useGoalTrajectory } from '../../../hooks/useGoalTrajectory'
import { useAthleteProfile } from '../../../hooks/useAthleteProfile'
import { canonicalReadiness, computeReadiness } from '../../../utils/metrics'
import { readinessFreshness, withholdReadiness } from '../../../utils/readinessGate'
import ReadinessFreshnessNote from '../today/ReadinessFreshnessNote'
import { latestLoad, daysToEvent, localDayKey } from '../../../utils/loadMetrics'
import ScoreRing from '../../ui/ScoreRing'
import { useLocale } from '../../../contexts/LocaleContext'
import { useAuth } from '../../../contexts/AuthContext'
import { tFor } from '../../../i18n/strings'
import { useMethods } from '../../ui/MethodsDrawer'
import { buildReadinessMethod } from '../../../utils/methodsContent'
import { glassCardStyle, GLASS_CARD_MARKER } from '../glassCard'
import { useSeasonArc } from '../../../hooks/useSeasonArc'
import ChapterBar from '../../narrative/ChapterBar'

// Glass, not solid: Today's Road sits behind these cards (DashboardShell),
// so the terrain reads through. `glassCardStyle` is the ONE shared token
// (frontend/src/components/dashboard/glassCard.ts) also used by every other
// Today card component (SessionOfTheDay, FitnessFreshnessCard,
// WeatherWindowCard, ExtraSessionsCard, MorningHealthCard, AbsorptionCard,
// ThisWeekCard, SessionReviewCard) so the whole page reads as one glass
// system, not a patchwork of a few translucent cards among solid ones. Falls
// back to a solid surface when backdrop-filter isn't supported.
const cardStyle = glassCardStyle

// ── Flagship "Morning Readiness Moment" — state resolution ───────────────────
// The Today tab is a single screen with FIVE faces (pencil-new.pen flagship
// frames): ready (green) / controlled (amber) / rest-recommended (orange) /
// post-ride (coral) / planned-rest (teal), plus the existing pending face. The
// face is derived from the SAME real signals the rest of the tab already uses
// (decision state, readiness tier/score, trained-today, planned-rest) — never
// hardcoded. Pure + exported so it's unit-testable.
export type FlagshipState = 'ready' | 'controlled' | 'rest' | 'post' | 'planned-rest' | 'pending'

export function flagshipState(opts: {
  readinessPending: boolean
  trainedToday: boolean
  isPlannedRest: boolean
  sidelined: boolean
  decisionState: string | null
  tier: string | null
  score: number | null
}): FlagshipState {
  // Precedence note (Jul 2026). `readinessPending` used to outrank everything,
  // which painted the whole screen dead grey on days the app knew exactly what
  // it wanted the athlete to do — a planned rest day with a late wearable sync
  // lost its reassuring teal face and its answer. Readiness is only ONE input
  // to the day's face: the three states that are known WITHOUT it (you already
  // rode, the plan says rest, you told us you're sidelined) now come first.
  // 'pending' remains for the genuinely unresolved case — a training day whose
  // recommendation really does hinge on a score we don't have.
  if (opts.trainedToday) return 'post'
  if (opts.isPlannedRest) return 'planned-rest'
  if (opts.sidelined) return 'rest'
  if (opts.readinessPending) return 'pending'
  if (opts.decisionState === 'recover' || opts.tier === 'rest') return 'rest'
  if (
    opts.decisionState === 'hard' || opts.decisionState === 'quality' ||
    opts.tier === 'peak' || opts.tier === 'ready'
  ) return 'ready'
  if (opts.decisionState === 'easy' || opts.tier === 'caution') return 'controlled'
  if (opts.score != null && opts.score >= 66) return 'ready'
  if (opts.score != null && opts.score < 34) return 'rest'
  return 'controlled'
}

/** Aura (full-screen shader tint) + ring colours per flagship state, matching
 *  the pen frames' u_aura + RingFill angular gradients. `ring` is the flat
 *  fallback colour; `gradient` is the pen's multi-stop angular sweep (the
 *  signature element) and `glow` the arc's outer-glow colour. */
export function flagshipColors(state: FlagshipState): {
  aura: string; ring: string; gradient: string[]; glow: string
} {
  switch (state) {
    // ZnwNp — ready (green→blue→teal)
    case 'ready': return { aura: '#16E08A', ring: '#16E08A', gradient: ['#16E08A', '#38B6FF', '#7CF5C0'], glow: '#16E08A' }
    // amber controlled (no dedicated pen frame — amber family)
    case 'controlled': return { aura: '#FFB020', ring: '#FFB020', gradient: ['#FFB020', '#FF9E3D', '#FFD166'], glow: '#FFB020' }
    // w3oJHa — stats rest (amber→coral→pink, cautionary)
    case 'rest': return { aura: '#FF9E3D', ring: '#FF7A3C', gradient: ['#FFB020', '#FF7A3C', '#FA1E55'], glow: '#FF9E3D' }
    // ci0e7 — post-ride (coral→amber→gold)
    case 'post': return { aura: '#FF5A3C', ring: '#FF5A3C', gradient: ['#FF5A3C', '#FFB020', '#FFD166'], glow: '#FF5A3C' }
    // MPMY2 — planned rest (blue→green→blue, reassuring)
    case 'planned-rest': return { aura: '#3E9BFF', ring: '#38B6FF', gradient: ['#38B6FF', '#16E08A', '#59C3FF'], glow: '#3E9BFF' }
    case 'pending': return { aura: '#3A4450', ring: '#5C6570', gradient: ['#5C6570', '#3A4450', '#5C6570'], glow: '#3A4450' }
  }
}

/** CP/W′ may only be used when the power model is valid (audit rule: a manual
 *  FTP that disagrees with the model by >10% invalidates the model). Without a
 *  valid model the road draws terrain but no waterline and no matches. */
export function roadPowerInputs(
  p: { model_valid?: boolean; cp_watts?: number; w_prime_j?: number } | null | undefined,
): { cp: number | null; wPrime: number | null } {
  if (!p || p.model_valid !== true) return { cp: null, wPrime: null }
  if (p.cp_watts == null || p.w_prime_j == null) return { cp: null, wPrime: null }
  return { cp: p.cp_watts, wPrime: p.w_prime_j }
}

/** finding 5: the aura-vs-road gate. 'bare' is the pending/loading state and
 *  the ready/controlled state with no real profile — nothing honest to draw.
 *  Publishing a road unconditionally would permanently retire DashboardShell's
 *  plain-aura branch (TodayTab is the only setAura caller), silently deleting
 *  readiness-aura.glsl's warm sunrise bloom from every state. Returning null
 *  here lets the aura (published unconditionally, separately) remain the
 *  visible backdrop whenever the road has nothing to show. */
export function buildRoadPayload(
  mode: RoadMode,
  profile: RoadProfile,
  blocks: ResolvedBlock[],
  color: string,
): RoadPayload | null {
  if (mode === 'bare') return null
  return { profile, mode, color, blocks }
}

// ── P1-11 / P1-8 weekly rhythm — pure, testable helpers ─────────────────────

/** Audit P1-11 copy: the weekly-rhythm stat that replaced the daily streak.
 *  Null (→ hide entirely) while the backend hasn't sent consistency yet.
 *
 *  `met`/`planned` count the WHOLE week, so early in the week the ratio is
 *  necessarily 0-of-n and reads as a score the athlete is losing — on Monday
 *  it is unwinnable by construction. For the first two days the same two
 *  numbers are stated forward instead ("5 Trainingstage diese Woche geplant"),
 *  which carries strictly more information than being told you have completed
 *  none of them yet. From midweek on the ratio is a real progress report and
 *  is shown as one. `todayIdx` is 0=Mon … 6=Sun; omitted → always the ratio. */
export function consistencyLabel(
  c: WeekConsistency | null | undefined,
  de: boolean,
  todayIdx?: number,
): string | null {
  if (!c || c.planned <= 0) return null
  if (c.met === 0 && todayIdx != null && todayIdx <= 1) {
    return de
      ? `${c.planned} Trainingstage diese Woche geplant`
      : `${c.planned} training days planned this week`
  }
  return de
    ? `Konstanz: ${c.met} von ${c.planned} geplanten Tagen`
    : `Consistency: ${c.met} of ${c.planned} planned days`
}

/** Trailing 4-week average weekly TSS from real PMC daily loads. Null while
 *  history is too thin (< 14 days) to honestly call anything an average. */
export function fourWeekAvgWeeklyTss(
  entries: { tss?: number | null; daily_tss: number | null }[] | undefined | null,
): number | null {
  if (!entries || entries.length < 14) return null
  const window = entries.slice(-28)
  const total = window.reduce((s, e) => s + (e.tss ?? e.daily_tss ?? 0), 0)
  return Math.round((total / window.length) * 7)
}

/** A planned week materially below the recent average is a deliberate quiet
 *  week — a fitness dip during it is the plan working, not a failure. */
const QUIET_WEEK_RATIO = 0.8

/** P1-8: the greeting's "Fitness −4 (7d)" chip renders ONLY when a decline is
 *  NOT plan-intended. Planned rest / recover days and deliberately quiet weeks
 *  hide it; rises (and flat) always render. Tone stays neutral-muted either way. */
export function shouldShowFitnessTrendChip(
  dCtl: number | null,
  decisionState: string | null,
  plannedWeekTss: number | null,
  fourWeekAvg: number | null,
): boolean {
  if (dCtl == null) return false
  if (dCtl >= 0) return true
  if (decisionState === 'planned_rest' || decisionState === 'recover') return false
  if (
    plannedWeekTss != null && fourWeekAvg != null && fourWeekAvg > 0 &&
    plannedWeekTss < QUIET_WEEK_RATIO * fourWeekAvg
  ) return false
  return true
}

// ── Honest readiness gating ──────────────────────────────────────────────────
// Lives in `utils/readinessGate` now, so RecoveryTab resolves the SAME gate
// from the SAME data and the two tabs can never again disagree about whether
// today's readiness is knowable. See that module for the full rationale; the
// short version is that it also distinguishes the pre-sync morning ('pending',
// self-resolving) from a wearable that stopped syncing days ago ('stale',
// actionable) — one message reassures, the other needs a Sync button.

// ── Brief-failure fallback (review finding #1, Jul 2026) ─────────────────────
// The logic now lives in the SHARED useTodaySession hook (one source of truth
// for both tabs' session card). Re-exported here so existing consumers/tests
// keep importing from TodayTab — same function object, never a fork.
export { briefFallbackState, type BriefFallback } from '../../../hooks/useTodaySession'

export default function TodayTab() {
  const { locale } = useLocale()
  const { user } = useAuth()
  const de = locale === 'de'
  // Methods drawer — the "how is this calculated?" transparency sheet for the
  // readiness score (backlog 02·K3). Tiny isolated affordance; owns its own
  // portal, so it never perturbs the flagship aura.
  const methods = useMethods()
  const today = useMemo(() => new Date(), [])
  // ONE source of truth for the session of the day (shared with PlanTab):
  // brief coerced to the plan row + ONE DailyDecision + honest week fallback.
  const {
    brief, workout, decision, decisionState, sidelined, isRestDay,
    isActiveTrainingDay, fallback, weekToday, refetchBrief,
  } = useTodaySession()
  const { data: metricsResp } = useDailyMetrics(useMemo(() => subDays(today, 30), [today]), today)
  const { data: snapshot } = useTodaySnapshot()
  const { data: pmc } = usePMC(90)
  const { data: acts } = useActivitiesRange(useMemo(() => subDays(today, 8), [today]), today)
  const { data: trajectory } = useGoalTrajectory()
  const { data: profile } = useAthleteProfile()
  const { data: powerProfile } = usePowerProfile()
  const { data: streakData } = useStreak()
  // Current week's plan — only read for planned_tss_total (quiet-week detection
  // gating the fitness-trend chip, audit P1-8). Shares PlanTab's query cache.
  const { data: weekPlan } = useCurrentWeek()
  // Live adaptation feed — the authoritative source for HOW a missed ride is
  // absorbed (key session reflowed to a free day / easy ride absorbed). Shares
  // the AdaptiveCard's query cache.
  const { data: adaptationsFeed } = usePlanAdaptations()
  const metrics = metricsResp?.metrics ?? []
  const latest = [...metrics].reverse().find((m) => m.hrv_status != null || m.resting_hr != null || m.sleep_score != null) ?? null
  const evidence = (brief?.evidence as Record<string, unknown> | undefined) ?? {}
  // ONE readiness story across surfaces (5-reviewer gate, Jul 2026): the
  // canonical score is the one the daily decision actually consumes —
  // DailyDecision.readiness from the backend multi-factor engine, the same
  // number GET /coach/adaptive reports. Recovery resolves through the exact
  // same selector, so Today, Recovery and the adaptive endpoint can never
  // show three different readiness numbers again. The Garmin snapshot /
  // client composite are only the fallback while the decision loads.
  const { score, tier } = canonicalReadiness(
    decision?.readiness,
    snapshot?.training_readiness
      ?? computeReadiness(latest?.hrv_status ?? null, latest?.body_battery ?? null, latest?.sleep_score ?? null),
  )
  const athlete = evidence.athlete as Record<string, unknown> | undefined
  const goalName = athlete?.goal_target as string | undefined
  // P0-5: days-to-event comes from the shared selector over the LIVE profile
  // event date; the cacheable brief evidence is only a last-resort fallback.
  const daysToGoal = daysToEvent(profile?.target_event_date)
    ?? (athlete?.days_to_goal as number | undefined)
    ?? null
  // Prefer the coach evidence name; fall back to the logged-in user's email local
  // part (e.g. "jannis.deters@…" → "Jannis") so the greeting is always personal.
  const nameFromEmail = (email: string | undefined | null): string | undefined => {
    const local = (email ?? '').split('@')[0]?.split(/[._-]/)[0]
    return local ? local.charAt(0).toUpperCase() + local.slice(1) : undefined
  }
  const athleteName = ((athlete?.name as string | undefined)?.split(' ')[0]) || nameFromEmail(user?.email)

  // ChapterBar's arc — the ONE shared hook every chapter calls, so the
  // phase/week/countdown line can never disagree between chapters (it reads
  // the same three cached queries PlanTab/RecoveryTab/HistoryTab read).
  const arc = useSeasonArc()

  // Athlete-local day key. Declared here because the overnight-freshness gate
  // just below needs it, and every wearable-derived value on this tab flows
  // through that gate.
  const todayKey = localDayKey(today)
  // Is the newest wearable night actually last night? `latest` is simply the
  // newest row carrying ANY signal, which on a watch that stopped syncing is a
  // week old — and every tile below is captioned as if it were this morning's
  // ("Erholung über Nacht", "AUSKLANG · 33 % ERHOLUNG"). Nulling the four raw
  // readings at the source is what makes the rest of the tab honest for free:
  // the tiles, drivers, morning-read paragraph and methods drawer all already
  // render "—" for a missing signal, so none of them needs its own gate.
  const overnightIsToday = useMemo(
    () => readinessFreshness(metrics, todayKey).gate === 'fresh',
    [metrics, todayKey],
  )
  const pmcBio = evidence.biometrics as Record<string, unknown> | undefined
  const hrv = pmcBio?.hrv as Record<string, unknown> | undefined
  const hrvDelta = overnightIsToday ? (hrv?.delta_pct as number | null | undefined) : null
  const sleepScore = overnightIsToday ? (latest?.sleep_score ?? null) : null
  const bodyBattery = overnightIsToday ? (latest?.body_battery ?? null) : null
  const restingHr = overnightIsToday ? (latest?.resting_hr ?? null) : null
  const hrvNow = overnightIsToday ? (snapshot?.hrv_overnight_avg ?? latest?.hrv_status ?? null) : null

  // P0-5: ONE producer for CTL/ATL/TSB — the shared latestLoad selector over
  // live PMC. Never the brief's evidence.pmc snapshot (60-day window, cacheable
  // for far longer than a day) — the Form chip must always equal the displayed
  // CTL − the displayed ATL.
  const load = latestLoad(pmc?.entries)
  const ctl = load?.ctl ?? null
  const atl = load?.atl ?? null
  const tsb = load?.tsb ?? null
  const dCtl = load?.dCtl7 ?? null

  // Day-state flags (workout / decisionState / sidelined / isRestDay /
  // isActiveTrainingDay / fallback / weekToday) all come from useTodaySession
  // above — ONE derivation shared with PlanTab, never re-derived here.
  // Sport-honest review: graded reviews arrive typed; sport-gated "logged"
  // reviews are rescued from the raw evidence (their empty compliance pairs
  // fail server-side validation, but the facts are real and renderable).
  const review = brief?.post_ride_review ?? loggedReviewFromEvidence(evidence)

  // Workout intensity badge — the shared derivation (finding #5) from
  // useTodaySession's module, so the badge here always equals the card's.
  const wIntensity = useMemo(() => sessionIntensity(workout, de), [workout, de])

  // Today's training snapshot — real activity channels only (no steps).
  // P0-2: activities are bucketed onto BROWSER-LOCAL days via the shared
  // localDayKey selector — never a UTC `.slice(0, 10)` prefix.
  const todayActs = (acts?.activities ?? []).filter((a) => localDayKey(a.started_at ?? a.date ?? '') === todayKey)
  const moveLoad = Math.round(todayActs.reduce((s, a) => s + (a.tss ?? 0), 0))
  const exMin = Math.round(todayActs.reduce((s, a) => s + (a.duration_seconds ?? 0) / 60, 0))
  const hasTss = todayActs.some((a) => a.tss != null)

  // Daily training-load target: meso plan (weekly/7) → today's prescribed TSS → default.
  const dailyTssTarget = Math.max(
    60,
    Math.round(
      trajectory?.weekly_tss_required && trajectory.weekly_tss_required > 0
        ? trajectory.weekly_tss_required / 7
        : workout?.predicted_tss ?? 120,
    ),
  )

  const hasSessionToday = todayActs.length > 0
  const loadPct = Math.min(100, Math.round((moveLoad / dailyTssTarget) * 100))

  const greeting = (() => {
    const h = today.getHours()
    const base = de ? (h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend') : (h < 11 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening')
    return athleteName ? `${base}, ${athleteName}` : base
  })()

  // "Why this?" input chips + science frameworks now render inside the shared
  // <SessionOfTheDay> card (one derivation for both tabs).

  // Week rhythm dots — forgiving, plan-aware (server: trained + planned-rest
  // days count as kept, sick/injured/break days pause, only skipped sessions
  // miss). Day dots fall back to client activity-presence while loading.
  const trainedSet = useMemo(() => new Set((acts?.activities ?? []).map((a) => localDayKey(a.started_at ?? a.date ?? ''))), [acts])
  // P1-11: the daily streak number no longer renders on Today — the weekly
  // rhythm (consistency: met/planned days) is the honest cadence stat. The
  // full Mon→Sun day-dots now live in <ThisWeekCard /> (V3 · Load & Form).
  const consistency = streakData?.consistency ?? null

  // Refreshingly-funny, always-true day wrap-up — synthesizes today's move
  // (already-trained / rest / prescribed session) against the real readiness
  // tier + HRV/sleep signals. Every line cites a REAL signal and today's real
  // move; nothing fabricated. Variants are picked deterministically by day of
  // month (no Math.random) so the line varies day-to-day but is stable today.
  // Sport-aware "already trained" — the decision only flips to trained_already
  // when today's completed work matches the planned sport family (a gym log on
  // a bike-plan day keeps the bike plan as the instruction). Client signals
  // are only the fallback while the decision loads.
  const trainedToday = decisionState != null
    ? decisionState === 'trained_already'
    : (!!review || hasSessionToday)
  // Honest readiness gating — the shared gate, so Recovery reads the same
  // verdict from the same rows. `gate` says WHY the score is or isn't today's:
  // 'fresh' (show it), 'pending' (this morning's sync is still in flight),
  // 'stale' (the wearable hasn't produced a night in days — needs a sync), or
  // 'none' (no wearable at all; the honest empty '—' state, not a promise).
  const freshness = useMemo(() => readinessFreshness(metrics, todayKey), [metrics, todayKey])
  const readinessPending = withholdReadiness({ gate: freshness.gate, trainedToday, sidelined })
  // Human date of the last night we DO have, for the stale copy ("Letzte
  // Messung 20. Juli"). Parsed at UTC midnight to match the day-key convention.
  const lastOvernightLabel = useMemo(() => {
    if (!freshness.lastOvernightKey) return null
    const d = new Date(`${freshness.lastOvernightKey}T00:00:00`)
    return Number.isNaN(d.getTime()) ? null : formatDate(d, de ? 'd. MMMM' : 'MMMM d', locale)
  }, [freshness.lastOvernightKey, de, locale])
  const hrvDown = typeof hrvDelta === 'number' && hrvDelta <= -3
  const hrvUp = typeof hrvDelta === 'number' && hrvDelta >= 3
  const sleptWell = typeof sleepScore === 'number' && sleepScore >= 80
  const sleptShort = typeof sleepScore === 'number' && sleepScore < 65
  const green = tier === 'peak' || tier === 'ready'
  const roughRecovery = hrvDown || tier === 'rest' || sleptShort
  // Locale-honest display title (German template field under de) — the hero
  // prose must name the SAME session the shared card shows.
  const wTitle = workout ? workoutDisplayTitle(workout, de) : undefined
  const hrvPct = typeof hrvDelta === 'number' ? `${hrvDelta >= 0 ? '+' : ''}${Math.round(hrvDelta)}%` : null
  // Sleep buckets for sleep-specific copy: >=85 earns a genuine compliment
  // naming the number, 65–84 is neutral-positive, <65 (sleptShort above) gets
  // a concrete recommendation + expectation-setting. sN is the real score.
  const sN = sleepScore != null ? Math.round(sleepScore) : null
  const sleptGreat = sN != null && sN >= 85
  const sleptOk = sN != null && sN >= 65 && sN < 85

  // Strongest TRUE positive signal, phrased as a lowercase mid-sentence clause.
  const goodReason = hrvUp && hrvPct ? (de ? `die HRV brummt (${hrvPct})` : `HRV's humming (${hrvPct})`)
    : sleptWell ? (de ? `der Schlaf lag bei ${Math.round(sleepScore!)}` : `sleep landed at ${Math.round(sleepScore!)}`)
    : green ? (de ? 'die Bereitschaft steht auf Grün' : 'readiness is green')
    : (de ? 'die Werte sind ruhig' : 'the signals are calm')
  // Strongest TRUE cautionary signal, same lowercase clause form.
  const badReason = hrvDown && hrvPct ? (de ? `die HRV lahmt (${hrvPct})` : `HRV's dragging its feet (${hrvPct})`)
    : sleptShort ? (de ? `der Schlaf war dünn (${Math.round(sleepScore!)})` : `sleep came up light (${Math.round(sleepScore!)})`)
    : (de ? 'du bist sichtlich platt' : "you're clearly cooked")
  const badReasonCap = badReason.charAt(0).toUpperCase() + badReason.slice(1)
  const namePart = athleteName ? `, ${athleteName}` : ''
  const pick = (arr: string[]) => arr[today.getDate() % arr.length]

  const heroLine = (() => {
    // Self-reported sick / injured / break — the decision's own explanation is
    // the only honest line; no witty training flavor on a sidelined day.
    if (decision && sidelined) return decision.reason
    if (trainedToday) {
      if (roughRecovery) return pick(de ? [
        `Solide Einheit, aber ${badReason} — heute Abend zählt Schlaf, nicht Strava.`,
        `Arbeit erledigt; jetzt ${badReason}, also sei nett zu dir und bleib horizontal.`,
        `Training drin, aber ${badReason}. Erholungsmodus: voll aktiviert.`,
        `Arbeit im Kasten, aber ${badReason} — die klügsten Watt heute Abend sind null.`,
        `Für heute fertig; ${badReason} — also Abendessen, Licht runter, Schluss.`,
        `Einheit gespeichert, aber ${badReason} — heute Abend ist aggressives Ausruhen dran.`,
      ] : [
        `Solid work logged, but ${badReason} — tonight's about sleep, not Strava.`,
        `You did the work; now ${badReason}, so be kind to yourself and horizontal.`,
        `Session's in, but ${badReason}. Recovery mode: fully engaged.`,
        `Work's banked, but ${badReason} — the smartest watts tonight are zero.`,
        `Done for today; ${badReason} — so it's dinner, dim lights, done.`,
        `Session logged. Since ${badReason}, tonight's job is aggressive resting.`,
      ])
      return pick(de ? [
        `Einheit im Kasten und ${goodReason} — jetzt darfst du grandios faul sein.`,
        `Training sitzt, ${goodReason}. Erlaubnis zum Nichtstun: erteilt.`,
        `Abgeliefert, ${goodReason} — Beine hoch und ruhig ein bisschen stolz sein.`,
        `Trainiert, und ${goodReason} — so einen Tag unterschreibst du zweimal.`,
        `Arbeit erledigt und ${goodReason}. Sofa verdient, Form folgt.`,
        `Haken dran, ${goodReason} — die Anpassung übernimmt die Nachtschicht.`,
      ] : [
        `You banked the work and ${goodReason} — go be gloriously lazy.`,
        `Session's done and ${goodReason}. Permission to do absolutely nothing: granted.`,
        `Work's in the bank, ${goodReason} — put your legs up and gloat a little.`,
        `Trained, and ${goodReason} — that's a day you'd sign for twice.`,
        `The work's done and ${goodReason}. Sofa earned, form pending.`,
        `Boxes ticked, ${goodReason} — let the adaptation work the night shift.`,
      ])
    }
    // Brief-failure fallbacks (finding #1) — plain, honest lines only; the
    // witty rest-day prose below is reserved for a REAL planned_rest decision.
    if (fallback === 'planned_session') {
      return de
        ? 'Der Coach-Brief lädt gerade nicht — unten steht deine geplante Einheit aus dem Wochenplan.'
        : "The coach brief isn't loading — your planned session from the week plan is below."
    }
    if (fallback === 'planned_rest') {
      return de ? 'Laut Wochenplan ist heute Ruhetag.' : 'Per the week plan, today is a rest day.'
    }
    if (fallback === 'degraded') {
      return de ? 'Wir können deinen Plan gerade nicht laden.' : "We can't load your plan right now."
    }
    if (isRestDay) {
      // Sleep-specific rest-day lines: a great night doubles the recovery win,
      // a thin night gets a concrete tonight-plan while the rest day absorbs it.
      if (sleptGreat) return pick(de ? [
        `Schlaf ${sN} am Ruhetag — doppelte Erholung eingesackt. Wunderschön.`,
        `Ruhetag plus Schlaf bei ${sN}: die Anpassung macht Überstunden, du bist der Chef.`,
        `Schlaf ${sN} an dem Tag, an dem der Plan nichts wollte — Erholung mit Zinseszins.`,
        `Score ${sN} im Schlaf und null Trainingsstress — heute baut sich von selbst.`,
        `Schlaf ${sN} + Ruhetag = das leise Duo, das Saisons gewinnt. Bleib liegen.`,
        `Ruhetag, und du hast ${sN} geschlafen. Nichts zu reparieren — heute Nacht wiederholen.`,
      ] : [
        `Sleep ${sN} on a rest day — that's how you double-dip recovery. Beautiful.`,
        `Rest day plus sleep at ${sN}: adaptation is working overtime and you're the boss.`,
        `Sleep ${sN} on the one day the plan asked for nothing — recovery compounding nicely.`,
        `A ${sN} sleep score and zero training stress — today literally builds itself.`,
        `Sleep ${sN} + rest day = the quiet combo that wins seasons. Keep lounging.`,
        `Rest day, and you slept a ${sN}. Nothing to fix here — do it again tonight.`,
      ])
      if (sleptShort) return pick(de ? [
        `Ruhetag, und der Schlaf lag bei ${sN} — gutes Timing. Heute Abend: früher runterfahren, Bildschirme aus.`,
        `Schlaf bei ${sN}; gut, dass heute nichts ansteht. Koffein früh stoppen, echte Nacht nachlegen.`,
        `Schlaf ${sN} am Ruhetag — der Plan rettet dich gerade. Zahl's mit einer frühen Nacht zurück.`,
        `Schlaf ${sN} — dünn. Der Ruhetag fängt das auf; heute Abend deutlich früher abschalten.`,
        `Nur ${sN} beim Schlaf; der Ruhetag deckt dich. Kein Koffein nach dem Mittag wirkt Wunder.`,
        `Schlaf ${sN}. Kein Training, keine Schuld — mach heute Nacht die Korrektur, nicht die Fortsetzung.`,
      ] : [
        `Rest day, and sleep was ${sN} — perfect timing. Tonight: earlier wind-down, screens off.`,
        `Sleep came in at ${sN}; good thing today asks nothing. Cut caffeine early, bank a real night.`,
        `A ${sN} sleep on a rest day is the plan saving you. Repay it with an early night.`,
        `Sleep ${sN} — thin. The rest day absorbs it; tonight, start winding down well before you're tired.`,
        `Only ${sN} on sleep; the rest day has you covered. No caffeine after lunch works wonders.`,
        `Sleep ${sN}. Zero guilt, zero training — just make tonight the fix, not the sequel.`,
      ])
      return pick(de ? [
        `Ruhetag${namePart}. Deine Beine schicken gerade ein Dankeschön — tu nichts, aber brillant.`,
        `Keine Einheit heute${namePart} — Erholung ist das Training, und du glänzt im Liegen.`,
        `Ruhetag verdient${namePart}. Schuldgefühle nicht inklusive, Fortschritt schon.`,
        `Ruhetag${namePart} — der Plan sagt damit: die Arbeit wirkt.`,
        `Heutige Aufgabe: nichts. Wer Ruhetage kann, peakt mit Absicht.`,
        `Ruhetag. Fitness entsteht in den Lücken — du stehst gerade in einer.`,
      ] : [
        `Rest day${namePart}. Your legs just sent a thank-you note — do nothing, brilliantly.`,
        `No session today${namePart} — recovery is the workout, and you're crushing it lying down.`,
        `Rest day earned${namePart}. Guilt not included; gains are.`,
        `Rest day${namePart} — the plan's way of saying the work is working.`,
        `Today's assignment: nothing. Athletes who nail rest days peak on purpose.`,
        `Rest day. Fitness is built in the gaps — you're standing in one.`,
      ])
    }
    if (wTitle) {
      // Sleep outranks the readiness tier: a short night caps today at
      // maintenance no matter how green the composite looks. At most TWO
      // signals per line — sleep plus (optionally) the HRV delta.
      if (sleptShort) {
        const up = hrvUp && hrvPct != null
        return pick(de ? [
          up ? `Schlaf ${sN}, aber HRV ${hrvPct} — der Motor will. ${wTitle} ehrlich fahren, heute früher runterfahren.`
             : `Schlaf ${sN} — heute zählt als Erhalt, nicht als Aufbau. ${wTitle} ehrlich halten, früher runterfahren.`,
          `Eine ${sN}er-Nacht deckelt den Tag: ${wTitle} nach Plan, keine Bonus-Watt, Koffein ab Mittag streichen.`,
          `Schlaf ${sN}. Fahr ${wTitle}, aber benote dich auf Zurückhaltung — die echte Einheit ist heute Nacht.`,
          up ? `Dünner Schlaf (${sN}), willige HRV (${hrvPct}) — ${wTitle} zählt heute als Erhalt, auch das ein Sieg.`
             : `Kurze Nacht (${sN}) — ${wTitle} geht trotzdem, als Erhalt. Heute Abend: Bildschirme aus, früher Licht aus.`,
          `Schlaf ${sN} heißt: heute erhalten, morgen aufbauen. ${wTitle} locker-ehrlich, 30 Min früher runterfahren.`,
          `Schlaf bei ${sN} — ${wTitle} im Plauderton fahren; das Comeback kaufst du mit einer frühen Nacht.`,
        ] : [
          up ? `Sleep ${sN}, but HRV ${hrvPct} — the engine's willing. Ride ${wTitle} honest, wind down earlier tonight.`
             : `Sleep ${sN} — today counts as maintenance, not building. Keep ${wTitle} honest, wind down earlier.`,
          `A ${sN} night caps the ceiling: ${wTitle} to plan, no bonus watts, caffeine off by mid-afternoon.`,
          `Sleep ${sN}. Do ${wTitle}, but grade yourself on restraint — the real session tonight is in bed.`,
          up ? `Thin sleep (${sN}), willing HRV (${hrvPct}) — ${wTitle} counts as maintenance today. Still a win.`
             : `Short night (${sN}) — ${wTitle} still works as maintenance. Tonight: screens down, lights out early.`,
          `Sleep ${sN} means today maintains, tomorrow builds. ${wTitle} easy-honest, wind-down 30 min earlier.`,
          `Sleep hit ${sN} — keep ${wTitle} conversational; the comeback gets bought with an early night.`,
        ])
      }
      if (decisionState === 'recover' || tier === 'rest' || hrvDown) {
        // Great sleep + dragging HRV: recovery is half-done — say both, crisply.
        if (sleptGreat && hrvDown && hrvPct != null) return pick(de ? [
          `Schlaf ${sN} hat geliefert, die HRV (${hrvPct}) zieht noch nach — ${wTitle} kontrolliert fahren.`,
          `Starke Nacht (${sN}), maulige HRV (${hrvPct}) — nimm die Mitte: ${wTitle} nach Plan, keine Show-Sprints.`,
          `Schlaf ${sN} vs. HRV ${hrvPct}: Erholung halb fertig. ${wTitle} ruhig — der Rest kommt heute Nacht.`,
          `${sN} geschlafen; die HRV (${hrvPct}) sieht's anders. ${wTitle} locker starten, nur pushen, wenn die Beine ja sagen.`,
          `Schlaf ${sN} kauft dir die Einheit; HRV ${hrvPct} setzt das Tempolimit. ${wTitle}, kontrolliert.`,
          `Schlaf ${sN}, HRV bei ${hrvPct} — der Körper sortiert noch Papierkram. ${wTitle} sauber halten.`,
        ] : [
          `Sleep ${sN} did its job, but HRV ${hrvPct} hasn't caught up — ride ${wTitle} controlled and let it.`,
          `Great night (${sN}), grumpy HRV (${hrvPct}) — take the middle: ${wTitle} to plan, no sprints for glory.`,
          `Sleep ${sN} vs HRV ${hrvPct}: recovery's half-done. ${wTitle} steady — the other half comes tonight.`,
          `You slept a ${sN}; HRV ${hrvPct} disagrees. Start ${wTitle} easy and only push if the legs vote yes.`,
          `Sleep ${sN} bought you the session; HRV ${hrvPct} sets the speed limit. ${wTitle}, controlled.`,
          `A ${sN} sleep with HRV at ${hrvPct} — the body's still filing paperwork. Keep ${wTitle} tidy.`,
        ])
        return pick(de ? [
          `Achtung: ${badReason}, halt ${wTitle} also locker — Heldenmodus kann warten.`,
          `${badReasonCap} heute — nimm ${wTitle} als lockere Runde, nicht als Duell.`,
          `Der Körper zeigt Gelb (${badReason}); ${wTitle} locker fahren oder gegen Erholung tauschen.`,
          `Kein rotes Licht, aber ${badReason} — ${wTitle} im Gesprächstempo hält die Woche am Leben.`,
          `${badReasonCap} — also ${wTitle} wie ein Warm-up fahren. Fitness ist geduldig; Ermüdung merkt sich alles.`,
          `Vorsichtstag: ${badReason}. ${wTitle} locker heute schlägt die Zwangspause nächste Woche.`,
        ] : [
          `Heads-up: ${badReason}, so keep ${wTitle} chill — hero mode can wait.`,
          `${badReasonCap} today — treat ${wTitle} as a gentle spin, not a duel.`,
          `Body's waving a yellow flag (${badReason}); do ${wTitle} easy or swap for rest.`,
          `Not a red light, but ${badReason} — ${wTitle} at conversation pace keeps the week alive.`,
          `Since ${badReason}, ride ${wTitle} like a warm-up. Fitness is patient; fatigue keeps receipts.`,
          `Careful day: ${badReason}. ${wTitle} easy now beats a forced week off later.`,
        ])
      }
      if (sleptGreat) {
        const up = hrvUp && hrvPct != null
        return pick(de ? [
          `Schlaf ${sN} — genau da passiert Anpassung. Löse es bei ${wTitle} ein.`,
          up ? `Schlaf ${sN}, HRV ${hrvPct} — grüner wird's nicht. ${wTitle} gehört heute dir.`
             : `Schlaf ${sN} — der Körper hat die Nachtschicht geliefert. ${wTitle} gehört heute dir.`,
          `Eine ${sN}er-Nacht ist Geld auf dem Konto — gib es für ${wTitle} aus, nicht fürs Scrollen.`,
          `Schlaf ${sN}: Erholung voll bezahlt. ${wTitle} ist der Tag, um Zinsen einzusammeln.`,
          up ? `${sN} geschlafen, HRV bei ${hrvPct} — der Motor ist warm. Richte ihn auf ${wTitle}.`
             : `${sN} geschlafen — der Motor ist ausgeruht und warm. Richte ihn auf ${wTitle}.`,
          `Schlaf-Score ${sN}. Aus solchen Nächten werden Athleten gebaut — nutz das für ${wTitle}.`,
        ] : [
          `Sleep ${sN} — that's where adaptation happens. Cash it in on ${wTitle}.`,
          up ? `Sleep ${sN}, HRV ${hrvPct} — it doesn't get greener. ${wTitle} is yours today.`
             : `Sleep ${sN} — the body did its overnight shift. ${wTitle} is yours today.`,
          `A ${sN} night is money in the bank — spend it on ${wTitle}, not on scrolling.`,
          `Sleep ${sN}: recovery paid in full. ${wTitle} is the day to collect interest.`,
          up ? `Slept ${sN} with HRV at ${hrvPct} — the engine is warm. Point it at ${wTitle}.`
             : `Slept a ${sN} — the engine is rested and warm. Point it at ${wTitle}.`,
          `Sleep score ${sN}. Nights like that build athletes — go make ${wTitle} count.`,
        ])
      }
      if (green) return pick(de ? [
        `Du bist bereit und ${wTitle} ist heute die Einheit zum Abliefern — ${goodReason}.`,
        `Grünes Licht: ${goodReason}, also wartet ${wTitle} nur darauf, zerlegt zu werden.`,
        `Beine geladen und ${goodReason} — mach ${wTitle} zu deinem Spielplatz.`,
        `Alles zeigt nach oben — ${goodReason}. ${wTitle} weiß nicht, was gleich passiert.`,
        `Heute ist der Tag, für den der Plan geplant hat: ${goodReason}. ${wTitle} abliefern.`,
        `Komplett grünes Brett — ${goodReason}. ${wTitle} verdient deine guten Beine.`,
      ] : [
        `You're primed and today's ${wTitle} is the one to nail — ${goodReason}.`,
        `Green light: ${goodReason}, so ${wTitle} is begging to be crushed.`,
        `Legs are loaded and ${goodReason} — go make ${wTitle} regret nothing.`,
        `Everything's pointing up — ${goodReason}. ${wTitle} won't know what hit it.`,
        `Today's the day the plan planned for: ${goodReason}. Go execute ${wTitle}.`,
        `Full green board — ${goodReason}. ${wTitle} deserves your good legs.`,
      ])
      // 65–84: neutral-positive, still naming the real number.
      if (sleptOk) return pick(de ? [
        `Schlaf ${sN} — solide, nicht spektakulär. ${wTitle} nach Plan ist heute genau richtig.`,
        `Eine ${sN}er-Nacht: genug Sprit für ${wTitle}, nicht genug für Improvisation. Fahr den Plan.`,
        `Schlaf ${sN} hält alles im Spiel — ${wTitle} wie geplant, dann schauen, wie es läuft.`,
        `Ordentliche Nacht (${sN}). Mehr braucht ${wTitle} nicht — abliefern und erholen.`,
        `Schlaf ${sN}: die ruhige Mitte. ${wTitle} im Soll-Tempo erledigt heute den Job.`,
        `Solide ${sN} beim Schlaf — passt zum Tag: ${wTitle}, ruhig, fertig, früh ins Bett.`,
      ] : [
        `Sleep ${sN} — solid, not spectacular. ${wTitle} at plan is exactly right today.`,
        `A ${sN} night: enough fuel for ${wTitle}, not enough for improvisation. Ride the plan.`,
        `Sleep ${sN} keeps everything on the table — ${wTitle} as written, then see how it flows.`,
        `Decent night (${sN}). ${wTitle} won't need more than that — execute and recover.`,
        `Sleep ${sN}: the quiet middle. ${wTitle} at prescribed effort does its job today.`,
        `A workmanlike ${sN} on sleep — matches today: ${wTitle}, steady, done, early night.`,
      ])
      return pick(de ? [
        `Mittlere Signale heute — geh ${wTitle} kontrolliert an und schau, wie's läuft.`,
        `Nicht Topform, nicht kaputt — ${wTitle} vernünftig fahren und die Beine entscheiden lassen.`,
        `Gelbliche Bereitschaft: ${wTitle} ist ein Go, nur nicht das Internet gewinnen wollen.`,
        `Die Signale zucken mit den Schultern — ${wTitle} nach Plan, die ersten 20 Minuten entscheiden.`,
        `Keine roten Flaggen, kein Feuerwerk: ${wTitle} wie verschrieben ist heute die kluge Wette.`,
        `Die Daten sind unentschieden — fahr ${wTitle} nach Gefühl: locker starten, Steigerung verdienen.`,
      ] : [
        `Middling signals today — take ${wTitle} at a controlled effort and see how it flows.`,
        `Not peak, not wrecked — run ${wTitle} sensibly and let the legs vote.`,
        `Amber-ish readiness: ${wTitle} is a go, just don't try to win the internet.`,
        `Signals are shrugging — ${wTitle} at plan, and let the first 20 minutes decide.`,
        `No red flags, no fireworks: ${wTitle} as prescribed is the smart money today.`,
        `The data's undecided, so ride ${wTitle} by feel — start easy, earn the upgrades.`,
      ])
    }
    return pick(de ? [
      'Die Zahlen trudeln noch ein — gleich hast du deinen Read.',
      'Signale werden synchronisiert… dein Spielplan ist in Sekunden da.',
    ] : [
      "Numbers are still landing — hang tight and I'll have your read in a moment.",
      'Syncing your signals… your game plan is seconds away.',
    ])
  })()
  // Human wrap-up line — the brief's LLM verdict is FLAVOR and may only render
  // while the brief's own day-shape agrees with the fresh decision (the backend
  // now guarantees agreement on fresh generations; this guard catches a stale
  // cached brief). On disagreement the decision's verdict wins — chat, Today
  // and the pill can never tell different stories.
  // Canned EN verdicts from the backend's simple-mode fallback maps — a cached
  // brief can serve them into a German UI ("Rest day — legs up" under German
  // chrome, finding #6). In de mode they're dropped so the localized
  // deterministic heroLine speaks instead.
  const CANNED_EN_VERDICTS = new Set([
    'Hard intervals — you’re fresh', "Hard intervals — you're fresh",
    'Hard ride — quality day', 'Focused effort today', 'Steady push today',
    'Easy hour on the bike', 'Easy spin — just move', 'Rest day — legs up',
    'Rest up — let your body heal', 'Take it easy today',
    'Steady effort — nothing crazy', "You're good to go", 'You’re good to go',
  ])
  const rawVerdict = brief?.verdict?.trim()
  const verdictLine = de && rawVerdict && CANNED_EN_VERDICTS.has(rawVerdict) ? undefined : rawVerdict
  const briefAgreesWithDecision = (() => {
    if (!decision) return true
    if (decision.state === 'trained_already') return !!review
    if (decision.state === 'planned_rest' || sidelined) {
      return !workout || (workout.template_id ?? '').toLowerCase().startsWith('rest')
    }
    return !!workout // active states need a prescription to talk about
  })()
  const wrapLine = decision && !briefAgreesWithDecision
    ? decision.verdict
    : (verdictLine && verdictLine.length > 0 ? verdictLine : heroLine)

  // ── MOMENT-ADAPTIVE HERO ───────────────────────────────────────────────────
  // The hero surfaces DIFFERENT, moment-relevant signals. Detected from real
  // data: whether a session is already logged today, and the wall-clock hour.
  //   • post    → trained today: session wrap-up (what you did + recover + next)
  //   • evening → not trained, ≥18:00: wind-down (recovery + tomorrow + sleep)
  //   • morning → not trained, else: overnight-recovery story + what's on deck
  const hour = today.getHours()
  const moment: 'post' | 'evening' | 'morning' = trainedToday ? 'post' : hour >= 18 ? 'evening' : 'morning'

  // Through the same gate as its four neighbours (hrvNow / sleepScore /
  // restingHr / bodyBattery). Missing it left the overnight tile row reading
  // "HRV —, Ruhepuls —, Schlaf 7,2 h": three honest dashes next to one
  // confident week-old number, which is a worse lie than all four being wrong.
  const sleepHours = overnightIsToday && latest?.sleep_detail?.total_s != null
    ? latest.sleep_detail.total_s / 3600
    : null
  // Session IF — prefer the review's measured intensity factor, else derive it
  // from today's real TSS + moving time (same IF math as the prescribed card).
  const sessionIF = review?.intensity_factor?.actual
    ?? (exMin > 0 && moveLoad > 0 ? Math.sqrt(moveLoad / ((exMin / 60) * 100)) : null)
  // Compact letter grade only (A+…F) — the tile is narrow, so no descriptor.
  const gradeInfo = (g: NonNullable<typeof review>['grade']) => {
    switch (g) {
      case 'perfect': return { t: 'A+', c: 'var(--color-recovery)' }
      case 'strong': return { t: 'A', c: 'var(--color-recovery)' }
      case 'okay': return { t: 'B', c: 'var(--color-stand)' }
      case 'overcooked': return { t: 'C', c: 'var(--color-amber)' }
      case 'undercooked': return { t: 'D', c: 'var(--color-amber)' }
      default: return { t: '—', c: 'var(--color-ink)' }
    }
  }
  const tomorrow = brief?.tomorrow_plan ?? null
  const chipLabel = (c: string | undefined): string | undefined => {
    if (!c) return undefined
    const en: Record<string, string> = { recovery: 'Recovery', endurance: 'Endurance', tempo: 'Tempo', threshold: 'Threshold', vo2: 'VO₂', race: 'Race' }
    const dede: Record<string, string> = { recovery: 'Erholung', endurance: 'Grundlage', tempo: 'Tempo', threshold: 'Schwelle', vo2: 'VO₂', race: 'Rennen' }
    return (de ? dede : en)[c] ?? c
  }

  interface Tile { label: string; value: string; unit?: string; sub?: string; subColor?: string; color?: string }
  const momentLabel = moment === 'post'
    ? (de ? 'Einheit abgeschlossen' : 'Session wrap-up')
    : moment === 'evening'
      ? (de ? 'Ausklang' : 'Wind-down')
      : (de ? 'Erholung über Nacht' : 'Overnight recovery')

  const hrvSub = typeof hrvDelta === 'number'
    ? { text: `${hrvDelta >= 0 ? '+' : ''}${Math.round(hrvDelta)}%`, color: hrvDelta >= 0 ? 'var(--color-recovery)' : 'var(--color-amber)' }
    : null

  const momentTiles: Tile[] = (() => {
    if (moment === 'post') {
      const g = review ? gradeInfo(review.grade) : null
      return [
        { label: de ? 'Dauer' : 'Duration', value: exMin > 0 ? `${exMin}` : '—', unit: exMin > 0 ? 'min' : '' },
        { label: 'TSS', value: (hasTss || moveLoad > 0) ? `${moveLoad}` : '—', sub: (hasTss || moveLoad > 0) ? `${loadPct}% ${de ? 'Ziel' : 'goal'}` : undefined },
        { label: de ? 'Intensität' : 'Intensity', value: sessionIF != null ? sessionIF.toFixed(2) : (wIntensity ? wIntensity.z : '—'), unit: sessionIF != null ? 'IF' : '', sub: wIntensity ? wIntensity.t : undefined },
        { label: de ? 'Note' : 'Grade', value: g ? g.t : '—', color: g ? g.c : undefined },
      ]
    }
    if (moment === 'evening') {
      const sleepTarget = roughRecovery ? '8.5' : '8'
      return [
        { label: de ? 'Erholung' : 'Recovery', value: bodyBattery != null ? `${Math.round(bodyBattery)}` : '—', unit: bodyBattery != null ? '%' : '', color: 'var(--color-recovery)' },
        { label: de ? 'Morgen' : 'Tomorrow', value: tomorrow?.predicted_tss != null ? `${Math.round(tomorrow.predicted_tss)}` : (isRestDay ? (de ? 'Ruhe' : 'Rest') : '—'), unit: tomorrow?.predicted_tss != null ? 'TSS' : '', sub: chipLabel(tomorrow?.intensity_chip) },
        { label: de ? 'Schlafziel' : 'Sleep target', value: sleepTarget, unit: 'h', color: 'var(--color-stand)' },
      ]
    }
    // morning
    const tiles: Tile[] = [
      { label: 'HRV', value: hrvNow != null ? `${Math.round(hrvNow)}` : '—', unit: hrvNow != null ? 'ms' : '', sub: hrvSub?.text, subColor: hrvSub?.color, color: 'var(--color-recovery)' },
      { label: de ? 'Schlaf' : 'Sleep', value: sleepHours != null ? sleepHours.toFixed(1) : (sleepScore != null ? `${Math.round(sleepScore)}` : '—'), unit: sleepHours != null ? 'h' : '', sub: sleepScore != null ? `Score ${Math.round(sleepScore)}` : undefined, color: 'var(--color-stand)' },
      { label: de ? 'Ruhepuls' : 'Resting HR', value: restingHr != null ? `${Math.round(restingHr)}` : '—', unit: restingHr != null ? 'bpm' : '', color: 'var(--color-move)' },
    ]
    if (isActiveTrainingDay && workout) {
      tiles.push({ label: de ? 'Heute' : 'On deck', value: workout.predicted_tss != null ? `${Math.round(workout.predicted_tss)}` : '—', unit: workout.predicted_tss != null ? 'TSS' : '', sub: wIntensity ? wIntensity.z : undefined, color: 'var(--color-accent)' })
    }
    return tiles
  })()

  // "One thing that matters now" — a single moment-specific, real-signal line.
  const focusLine: string | null = (() => {
    if (moment === 'post') {
      const nudge = review?.next_session_nudge?.trim() || brief?.regeneration?.bullets?.[0]?.trim()
      if (nudge) return nudge
      return de ? 'Priorität jetzt: auffüllen, dehnen, früh ins Bett.' : 'Priority now: refuel, stretch, early night.'
    }
    // Sidelined (sick / injured / break) — the decision's explanation IS the focus.
    if (decision && sidelined) return decision.reason
    if (moment === 'evening') {
      if (tomorrow?.description?.trim()) return `${de ? 'Morgen' : 'Tomorrow'}: ${tomorrow.description.trim()}`
      if (isActiveTrainingDay && wTitle) return `${de ? 'Morgen wartet' : 'Up next'}: ${wTitle}`
      return de ? 'Heute Abend zählt Schlaf — er baut die Form von morgen.' : "Tonight, sleep is the work — it builds tomorrow's form."
    }
    // morning
    if (isActiveTrainingDay && wTitle) return `${de ? 'Fokus heute' : "Today's focus"}: ${wTitle}`
    // Brief unavailable: name the week plan's session (real data) or stay quiet —
    // never claim "recovery is the assignment" over an error (finding #1).
    if (fallback === 'planned_session') {
      return weekToday?.title
        ? `${de ? 'Laut Wochenplan' : 'Per the week plan'}: ${weekToday.title}`
        : null
    }
    if (fallback === 'degraded') return null
    return de ? 'Fokus heute: Erholung ist die Aufgabe.' : "Today's focus: recovery is the assignment."
  })()

  // ── "Morning read" — a compact deterministic paragraph under the hero line.
  // Synthesizes ONLY real signals: last night's sleep (hours + score), the HRV
  // delta vs baseline, whether yesterday was trained or rested, and today's
  // prescribed session. Every clause is conditionally built — a missing signal
  // simply drops its sentence, nothing is ever invented — and each language
  // gets its own word order (no templated Denglish). Variant phrasing is picked
  // deterministically with the same day-of-month `pick` as the hero line.
  const yKey = localDayKey(subDays(today, 1))
  const yesterdayTrained = trainedSet.has(yKey)
  // Yesterday's planned-but-MISSED bike ride — the backend flags a real planned
  // ride whose actual TSS fell below the "attempted" floor (planned rest days
  // and ridden days never surface). Non-guilt: the plan works FOR the athlete.
  const missedYesterday = weekPlan?.missed_yesterday ?? null
  const missedTitle = de ? (missedYesterday?.title_de || missedYesterday?.title) : missedYesterday?.title
  // How the plan absorbs it — the real outcome from the adaptation feed (key
  // session reflowed to {day} / easy ride absorbed). Falls back to an honest
  // by-kind default until the hourly engine has logged the outcome row.
  const weekdayLabel = (iso: string): string => {
    const d = new Date(`${iso}T00:00:00`)
    return d.toLocaleDateString(de ? 'de-DE' : 'en-US', { weekday: 'long' })
  }
  const missedOutcome: string | null = (() => {
    if (!missedYesterday) return null
    const row = (adaptationsFeed?.adaptations ?? []).find(
      (a) => (a.evidence?.missed_date as string | undefined) === missedYesterday.date
        && (a.signal === 'missed_key_session' || a.signal === 'missed_ride_absorbed'),
    )
    if (row?.signal === 'missed_key_session') {
      const movedTo = row.evidence?.moved_to as string | undefined
      return movedTo
        ? (de ? `auf ${weekdayLabel(movedTo)} verschoben` : `moved to ${weekdayLabel(movedTo)}`)
        : (de ? 'auf einen freien Tag verschoben' : 'moved to a free day')
    }
    if (row?.signal === 'missed_ride_absorbed') {
      return de ? 'absorbiert — kein Nachholen nötig' : 'absorbed — no make-up needed'
    }
    // No feed row yet: honest default keyed to the ride kind.
    return missedYesterday.is_quality
      ? (de ? 'wird auf einen freien Tag gelegt' : 'moves to a free day')
      : (de ? 'absorbiert — kein Nachholen nötig' : 'absorbed — no make-up needed')
  })()
  const yesterdayTss = Math.round(
    (acts?.activities ?? [])
      .filter((a) => localDayKey(a.started_at ?? a.date ?? '') === yKey)
      .reduce((s, a) => s + (a.tss ?? 0), 0),
  )
  const morningRead: string | null = (() => {
    if (moment !== 'morning') return null
    if (sN == null && typeof hrvDelta !== 'number') return null

    const hStr = sleepHours != null ? (de ? `${sleepHours.toFixed(1).replace('.', ',')} h` : `${sleepHours.toFixed(1)}h`) : null
    const yCtx = yesterdayTrained
      ? (yesterdayTss > 0
          ? (de ? ` nach ${yesterdayTss} TSS gestern` : ` after yesterday's ${yesterdayTss} TSS`)
          : (de ? ' nach der gestrigen Einheit' : " after yesterday's session"))
      : missedYesterday
        ? (de ? ' nach dem gestern ausgefallenen Training' : " after yesterday's missed session")
        : (de ? ' nach dem gestrigen Ruhetag' : " after yesterday's rest day")

    // Sentence 1 — sleep in context of yesterday (falls back to yesterday-only
    // when no sleep data landed).
    const s1 = (() => {
      if (sN == null) {
        return yesterdayTrained
          ? (yesterdayTss > 0
              ? (de ? `${yesterdayTss} TSS von gestern stecken in den Beinen.` : `${yesterdayTss} TSS from yesterday are in the legs.`)
              : (de ? 'Die gestrige Einheit steckt noch in den Beinen.' : "Yesterday's session is still in the legs."))
          : missedYesterday
            ? (de ? 'Gestern ist die Einheit ausgefallen — der Plan fängt es ruhig auf.' : "Yesterday's ride slipped — the plan absorbs it calmly.")
            : (de ? 'Gestern war Ruhetag — die Beine sollten ruhig sein.' : 'Yesterday was a rest day — the legs should be quiet.')
      }
      const base = hStr
        ? (de ? `${hStr} Schlaf (Score ${sN})` : `Slept ${hStr} (${sN})`)
        : (de ? `Schlaf-Score ${sN}` : `Sleep score ${sN}`)
      const q = sleptGreat
        ? pick(de ? ['eine richtige Nacht', 'Erholung sauber verbucht', 'so sieht Aufbau aus'] : ['a proper night', 'recovery banked in full', 'the kind training pays for'])
        : sleptShort
          ? pick(de ? ['etwas dünn', 'eher kurz', 'weniger, als der Plan mag'] : ['a bit thin', 'on the short side', 'less than the plan would like'])
          : pick(de ? ['ordentlich, brauchbar', 'solide genug', 'kein Drama'] : ['decent and workable', 'solid enough', 'no drama there'])
      return de ? `${base}${yCtx} — ${q}.` : `${base} — ${q}${yCtx}.`
    })()

    // Sentence 2 — the HRV delta vs baseline, only when real.
    const s2 = typeof hrvDelta === 'number' && hrvPct != null
      ? (hrvUp
          ? pick(de
              ? [`Die HRV ist bei ${hrvPct} — der Motor will.`, `HRV ${hrvPct} — der Motor sagt ja.`, `Die HRV (${hrvPct}) hält zu dir.`]
              : [`HRV is ${hrvPct}, so the engine is willing.`, `HRV sits at ${hrvPct} — the engine says yes.`, `HRV ${hrvPct} has your back.`])
          : hrvDown
            ? pick(de
                ? [`Die HRV liegt bei ${hrvPct} — das Ego bleibt heute in der Garage.`, `HRV ${hrvPct} bittet um Zurückhaltung.`, `HRV ${hrvPct} — der Motor will es ruhig.`]
                : [`HRV is ${hrvPct}, so keep the ego parked.`, `HRV at ${hrvPct} asks for restraint.`, `HRV ${hrvPct} — the engine wants an easy one.`])
            : pick(de
                ? [`Die HRV ist stabil (${hrvPct}).`, `Die HRV hält die Linie (${hrvPct}).`]
                : [`HRV is steady (${hrvPct}).`, `HRV is holding its line (${hrvPct}).`]))
      : null

    // Sentence 3 — today's move, keyed to the same decision state as the hero.
    const s3 = (() => {
      if (sidelined) return null // the decision's reason carries the day; no workout talk
      if (isRestDay) return pick(de
        ? ['Ruhetag wie geplant — lass ihn arbeiten.', 'Nichts im Plan; die Erholung ist die Einheit.', 'Heute wird geruht — nimm den Sieg mit.']
        : ['Rest day as planned — let it do its job.', 'Nothing on the plan; recovery is the session.', 'Today rests — take the win.'])
      if (!wTitle || !isActiveTrainingDay) return null
      if (decisionState === 'recover' || sleptShort || hrvDown) return pick(de
        ? [`${wTitle} steht — locker starten, die Beine haben das letzte Wort.`, `${wTitle} bleibt im Plan; wenn die Beine meckern, kleiner dosieren.`, `${wTitle} wie geplant, aber ehrlich bleiben — kürzer ist heute auch eine Antwort.`]
        : [`${wTitle} is on — start easy and let the legs cast the deciding vote.`, `${wTitle} stays on the plan; scale it down if the legs argue.`, `${wTitle} as planned, but keep it honest — shorter is a fine answer today.`])
      if (green || sleptGreat) return pick(de
        ? [`${wTitle} steht an — ein guter Tag, es richtig zu machen.`, `Grünes Licht für ${wTitle}; fahr es mit Absicht.`, `${wTitle} wie geplant — die Lage spricht für vollen Wert.`]
        : [`${wTitle} is on deck — a good day to do it properly.`, `Green light for ${wTitle}; ride it like you mean it.`, `${wTitle} as planned — conditions point to full value.`])
      return pick(de
        ? [`${wTitle} wie geplant — ruhig fahren, keine Heldentaten nötig.`, `${wTitle} ist der Job heute; nach Plan fahren, danach neu bewerten.`, `${wTitle} im Soll-Bereich macht genau, was es soll.`]
        : [`${wTitle} as planned — steady effort, no heroics needed.`, `${wTitle} is today's job; ride to plan, reassess after.`, `${wTitle} at prescribed effort does exactly what it should.`])
    })()

    return [s1, s2, s3].filter(Boolean).join(' ')
  })()

  // Momentum cues — the weekly rhythm (consistency vs plan, P1-11) + a real
  // 7-day fitness (CTL) trend. Both honest, real-data cues; never hype. The
  // fitness chip hides when a decline is plan-intended (planned rest/recover
  // day or a deliberately quiet week) so a working plan never reads as failure.
  // 0=Mon … 6=Sun — lets the label state the week forward on Mon/Tue rather
  // than as a 0-of-n score nobody can win that early.
  const consistencyText = consistencyLabel(consistency, de, (today.getDay() + 6) % 7)
  const showFitnessTrend = shouldShowFitnessTrendChip(
    dCtl,
    decisionState,
    weekPlan?.planned_tss_total ?? null,
    fourWeekAvgWeeklyTss(pmc?.entries),
  )

  // ── FLAGSHIP "Morning Readiness Moment" derivations ────────────────────────
  const { data: weather } = useTodayWeather()
  // Nearest real hourly temp at the athlete's riding location (honest absence:
  // no forecast → no weather pill). Matches the current wall-clock hour first.
  const currentTemp = (() => {
    if (!weather?.available || !weather.hours?.length) return null
    const target = today.getHours()
    const atHour = weather.hours.find((h) => new Date(h.time).getHours() === target && h.temp_c != null)
    const anyTemp = weather.hours.find((h) => h.temp_c != null)
    return (atHour ?? anyTemp)?.temp_c ?? null
  })()

  // The face of the screen — one of five, from real signals (never hardcoded).
  const fState = flagshipState({
    readinessPending, trainedToday, isPlannedRest: isRestDay, sidelined,
    decisionState, tier, score: score ?? null,
  })
  const fColors = flagshipColors(fState)
  const auraColor = fColors.aura
  // Publish the state-keyed aura colour up to DashboardShell, which paints it
  // full-screen behind <main> (header bar included). Cleared on unmount so the
  // aura only shows on Today.
  const { setAura, setRoad } = useAura()
  useEffect(() => {
    setAura(auraColor)
    return () => setAura(null)
  }, [auraColor, setAura])

  // Today's Road — the day's terrain, ground level at Critical Power.
  // Real blocks when the plan has them; otherwise a single honest steady block
  // synthesized from the planned duration and an average target derived the
  // same way sessionIntensity() already derives IF (IF = √(TSS / (hours×100)),
  // watts = IF × threshold). Needs duration, TSS and a threshold — missing any
  // of them yields no road at all rather than a guessed one (spec §6).
  const roadBlocks = useMemo(() => {
    const blocks = workout?.blocks ?? []
    if (blocks.length > 0) return blocks
    const hours = (workout?.duration_minutes ?? 0) / 60
    const threshold = powerProfile?.threshold_watts
    if (!workout || hours <= 0 || workout.predicted_tss == null || threshold == null) return []
    const iff = Math.sqrt(workout.predicted_tss / (hours * 100))
    const synth = steadyBlock(workout.duration_minutes, Math.round(iff * threshold), threshold)
    return synth ? [synth] : []
  }, [workout, powerProfile])

  const roadProfile = useMemo(
    () => buildRoadProfile(roadBlocks, roadPowerInputs(powerProfile)),
    [roadBlocks, powerProfile],
  )
  const roadModeValue = useMemo(
    () => roadMode(fState, { hasProfile: roadProfile.samples.length > 0, hasRidden: false }),
    [fState, roadProfile],
  )

  // hasRidden: false is deliberate — the 'ridden' mode needs a real power
  // stream and is out of scope for this plan (spec §10 keeps stream-backed
  // post-ride terrain for a follow-up). 'flat-done' is the honest post-ride
  // landscape until then.
  //
  // buildRoadPayload (finding 5, unit-tested in roadPayload.test.ts) is the
  // aura-vs-road gate: null on 'bare' lets the aura (published above,
  // unconditionally) remain the visible backdrop whenever the road has
  // nothing honest to show.
  // KILL SWITCH (2026-07-27): Today's Road is disabled in production after a
  // client-side render crash on the Today tab (top-level ErrorBoundary, "the
  // app hit an unexpected error"). Root cause NOT yet identified — the
  // exception is only console.error'd, with no external reporting, so the
  // stack exists solely in the reporting user's browser. Three hypotheses were
  // tested and disproved: Math.min spread over the 1 Hz W'bal array (21 600
  // elements spread fine), an unstable powerProfile identity driving the
  // render-time travel reset into an infinite loop (it reads react-query
  // `.data`, which is reference-stable), and a negative String.repeat count in
  // the matches pip bar (wPrimeBalance caps bal at W', so matches <= 1).
  //
  // Setting ROAD_ENABLED = false makes setRoad publish null, which unmounts
  // BOTH <TodayRoad> and <RoadHud> in DashboardShell and restores the plain
  // readiness aura — the exact backdrop that shipped on 2026-07-24. Everything
  // else in this build stays live. Flip back to true once the crash is
  // reproduced and fixed; the feature code is otherwise untouched.
  const ROAD_ENABLED = false
  useEffect(() => {
    setRoad(
      ROAD_ENABLED ? buildRoadPayload(roadModeValue, roadProfile, roadBlocks, fColors.aura) : null,
    )
    return () => setRoad(null)
  }, [ROAD_ENABLED, setRoad, roadProfile, roadModeValue, fColors.aura, roadBlocks])

  const ringColor = fColors.ring
  const ringGradient = fColors.gradient
  const ringGlow = fColors.glow

  // Gate kicker — the question the screen answers.
  const gateKicker = fState === 'post' ? tFor(locale, 'gate_how_today')
    : fState === 'planned-rest' ? tFor(locale, 'gate_rest_day')
    : tFor(locale, 'gate_ride_today')
  // Ring centre label.
  const ringLabel = fState === 'post' ? tFor(locale, 'ring_execution')
    : fState === 'planned-rest' ? tFor(locale, 'ring_recovered')
    : tFor(locale, 'ring_readiness')
  // Big verdict headline (short) — the wittier, data-driven wrapLine is the
  // supporting sentence beneath it.
  // 'pending' gets a headline too. It used to fall through to null, which was
  // harmless while the pending branch replaced the whole hero — but now that
  // the hero survives a withheld score, a null headline left the face with a
  // medallion, one pill and a small grey line, and no answer at the size the
  // answer belongs. Readiness is unknown here; the PLAN is not, so the
  // headline is plan-anchored and stays true either way.
  const verdictHead = fState === 'ready' ? tFor(locale, 'verdict_go_ride')
    : fState === 'controlled' ? tFor(locale, 'verdict_controlled')
    : fState === 'rest' ? tFor(locale, 'verdict_rest')
    : fState === 'post' ? tFor(locale, 'verdict_banked')
    : fState === 'planned-rest' ? tFor(locale, 'verdict_rest_session')
    : fState === 'pending'
      ? (isActiveTrainingDay && wIntensity
          ? (de ? `${wIntensity.t} steht an` : `${wIntensity.t} on deck`)
          : (de ? 'Dein Plan steht' : 'Your plan stands'))
    : null
  // Section kicker above the session/rest block.
  const sessionKicker = fState === 'rest' ? tFor(locale, 'kicker_instead')
    : fState === 'post' ? tFor(locale, 'kicker_recover')
    : fState === 'planned-rest' ? tFor(locale, 'kicker_rest')
    : tFor(locale, 'kicker_session')
  // First readiness pill (state word) — colour keyed to state.
  const statePill = fState === 'ready' ? { word: tFor(locale, 'pill_primed'), color: '#16E08A' }
    : fState === 'controlled' ? { word: tFor(locale, 'pill_strong'), color: '#FFB020' }
    : fState === 'rest' ? { word: tFor(locale, 'pill_ease'), color: '#FF7A3C' }
    : fState === 'post' ? { word: tFor(locale, 'pill_banked'), color: '#16E08A' }
    : { word: tFor(locale, 'pill_fresh'), color: '#38B6FF' }
  // Readiness drivers — real overnight signals, honest "—" when absent.
  const driverChips: { icon: typeof HeartPulse; label: string; value: string; unit?: string; delta?: string | null; deltaColor?: string }[] = [
    {
      icon: Activity, label: tFor(locale, 'driver_hrv'),
      value: hrvNow != null ? `${Math.round(hrvNow)}` : '—', unit: hrvNow != null ? 'ms' : undefined,
      delta: hrvPct, deltaColor: typeof hrvDelta === 'number' ? (hrvDelta >= 0 ? '#16E08A' : '#FF9E3D') : undefined,
    },
    {
      icon: HeartPulse, label: tFor(locale, 'driver_rhr'),
      value: restingHr != null ? `${Math.round(restingHr)}` : '—', unit: restingHr != null ? 'bpm' : undefined,
    },
    {
      icon: Moon, label: tFor(locale, 'driver_sleep'),
      value: sleepScore != null ? `${Math.round(sleepScore)}` : '—',
    },
  ]
  // Coach card message — prefer the brief's own rationale; else the
  // localized focus line; else the wrap line. The brief is fetched with an
  // explicit locale param and the query is keyed on it, so a returned brief
  // is already in the requested locale — no separate locale check needed.
  const rationaleMatches = !!brief?.rationale?.trim()
  // Drop the robotic "Fokus heute:" / "Focus today:" label — the coach card's
  // own header already frames it; a human sentence (or just the session) reads
  // warmer than a data label.
  const humanFocus = focusLine?.replace(/^\s*(Fokus heute|Focus today)\s*[:·—-]\s*/i, '').trim() || null
  const coachMessage = (rationaleMatches ? brief!.rationale.trim() : null) ?? humanFocus ?? wrapLine

  return (
    <div className="relative flex flex-col gap-6 pb-4">
      <ChapterBar chapter="today" arc={arc} de={de} />
      {/* FLAGSHIP AURA — the "Morning Readiness Moment" backdrop (pen frames'
          readiness-aura.glsl fill). A full-bleed, state-keyed WebGL aura fixed
          to the viewport behind ALL Today content; the page bg (#0A0C0F) equals
          the shader's u_bg so it blends seamlessly with the app chrome. Pending
          → the calm muted aura. Freezes under reduced-motion, pauses offscreen
          (ShaderCanvas contract). */}
      {/* The readiness aura is painted full-screen by DashboardShell (behind the
          header bar too); TodayTab just publishes its state colour via useAura. */}

      {/* 1 · Header (pen Header) — greeting + date (+ race-in-N-days) + weather
          pill. Avatar → power-profile is kept as a real nav affordance. */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="flex flex-col gap-0.5 min-w-0">
          {/* nowrap on the greeting: it is the athlete's name and must not
              break across lines to make room for two utility chips. The date
              line below is allowed to wrap instead. */}
          <h1 className="num-display" style={{ fontSize: 20, fontWeight: 800, color: '#FFFFFF', lineHeight: 1.15, whiteSpace: 'nowrap' }}>{greeting}</h1>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#FFFFFF99' }}>
            {formatDate(today, de ? 'EEEE, d. MMMM' : 'EEEE, MMMM d', locale)}
            {daysToGoal != null && daysToGoal > 0 ? ` · ${de ? `Rennen in ${daysToGoal} Tagen` : `race in ${daysToGoal} days`}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {currentTemp != null && (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5" style={{ height: 34, background: '#FFFFFF12', border: '1px solid #FFFFFF1F' }}>
              <Sun size={14} style={{ color: '#FFD166' }} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#FFFFFFE6' }}>{Math.round(currentTemp)}°</span>
            </span>
          )}
          {/* Entry to the power profile. This was a SECOND avatar — the same
              circle, the same initial, the same size as the profile avatar
              sitting 40px above it in the masthead — pointing somewhere
              completely different. Two identical affordances, two
              destinations, is a coin flip every time the athlete reaches for
              one. It now shows what actually lives behind it: the threshold
              the whole plan is prescribed against. Honest "—" when the power
              model has nothing to report. */}
          <Link
            to="/power-profile"
            className="inline-flex items-center justify-center rounded-full px-2.5"
            style={{ height: 34, background: '#FFFFFF12', border: '1px solid #FFFFFF1F' }}
            aria-label={de ? 'Power-Profil öffnen' : 'Open power profile'}
          >
            <span className="num-display" style={{ fontSize: 12.5, fontWeight: 700, color: '#FFFFFFE6', whiteSpace: 'nowrap' }}>
              {powerProfile?.threshold_watts != null ? `${Math.round(powerProfile.threshold_watts)} W` : '— W'}
            </span>
          </Link>
        </div>
      </div>

      {/* Morning-health early-warning — illness / significant-downturn cluster
          from the morning wearable vitals (GET /health/morning-check). Renders
          ONLY when the detector flags a real cluster vs the athlete's baseline;
          a normal morning shows nothing. Placed high so a health warning is the
          first thing seen. Self-contained — owns its own data + null-render. */}
      <MorningHealthCard />

      {/* Weekly Wrapped — the once-a-week high-dopamine banner (localStorage-
          gated per ISO week; self-hides when there's no ridden week to show). */}
      <WeeklyWrappedBanner />

      {/* Race chip moved into the flagship flow, below the verdict. */}

      {/* 3 · Recovery/readiness card — "here's exactly where you stand" hero:
          score ring + verdict, morning read, momentum cues and moment tiles.
          Gradient + glow are keyed to the readiness color. */}
      {(
        <>
          {/* GateKicker — the question the screen answers (pen GateKicker).
              Now a dark glass chip rather than bare state-coloured text.
              `readiness-aura.glsl` paints a deliberately luminous crown at
              r < 0.6 around (0.5, 0.34) — exactly where this line sits — and
              state-coloured text on that bloom fails contrast outright on the
              light faces (planned-rest #3E9BFF and ready #16E08A both wash out
              to near-invisible). The chip gives the type its own dark ground so
              the bloom can stay as bright as it was designed to be. */}
          <div className="flex justify-center -mb-1">
            <span
              className="eyebrow inline-flex rounded-full"
              style={{
                fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', textAlign: 'center',
                padding: '5px 13px',
                color: `color-mix(in srgb, ${auraColor} 40%, #FFFFFF)`,
                background: '#0A0C0F99',
                border: `1px solid color-mix(in srgb, ${auraColor} 40%, transparent)`,
                backdropFilter: 'blur(8px)',
                textShadow: `0 0 14px ${auraColor}66`,
              }}
            >{gateKicker}</span>
          </div>

          {/* Readiness ring (pen Ring) — big gauge, state-coloured, score in the
              centre with the state label; two status pills beneath.

              When readiness is withheld (`readinessPending`) the gauge is
              replaced by a MEDALLION, not drawn empty. Two earlier attempts
              both failed for the same reason: a 224 px circle with nothing in
              it is the loudest element on the screen saying the least. (The
              version before that went further and replaced the entire hero —
              verdict, pills, plan and all — with a grey moon disc.) The
              medallion is deliberately small and deliberately dark: it cedes
              the visual weight to the verdict below, which IS the answer on a
              day the app can still call, and its dark ground survives the
              aura's luminous crown where a translucent one dissolves. */}
          <div className="flex flex-col items-center gap-4">
            {readinessPending ? (
              <Link
                to="/dashboard?tab=recovery"
                className="grid place-items-center rounded-full"
                aria-label={de ? 'Erholung öffnen' : 'Open recovery'}
                style={{
                  width: 128, height: 128,
                  background: '#0A0C0FB8',
                  border: `2px dashed color-mix(in srgb, ${auraColor} 55%, transparent)`,
                  backdropFilter: 'blur(10px)',
                  boxShadow: `0 0 30px ${auraColor}33`,
                }}
              >
                {/* Glyph only. A caption here ("kein Wert · nicht
                    synchronisiert") wrapped to three cramped lines and merely
                    pre-announced the amber note directly beneath it — the
                    dashed edge already reads as "not measured". */}
                {fState === 'planned-rest' || fState === 'rest'
                  ? <Moon size={40} strokeWidth={1.5} style={{ color: `color-mix(in srgb, ${auraColor} 25%, #FFFFFF)` }} />
                  : <Bike size={40} strokeWidth={1.5} style={{ color: `color-mix(in srgb, ${auraColor} 25%, #FFFFFF)` }} />}
              </Link>
            ) : (
            <Link to="/dashboard?tab=recovery" className="grid place-items-center" aria-label={de ? 'Erholung öffnen' : 'Open recovery'}>
              <ScoreRing score={score ?? 0} color={ringColor} gradient={ringGradient} glow={ringGlow} size={224} stroke={14} trackColor="#FFFFFF14">
                <div className="flex flex-col items-center gap-1">
                  <span className="eyebrow" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', color: `color-mix(in srgb, ${ringColor} 55%, #FFFFFF)` }}>{ringLabel}</span>
                  <span className="num-display" style={{ fontSize: 62, fontWeight: 800, color: '#FFFFFF', lineHeight: 0.95 }}>{score != null ? Math.round(score) : '—'}</span>
                </div>
              </ScoreRing>
            </Link>
            )}
            {/* Status pill — state word only now. It used to carry a second
                pill for raw TSB ("FORM +19"), which put a training-load number
                above the verdict it was supposed to support — on a screen
                whose whole promise (per review, Jul 2026) is "tell me what to
                do in one sentence, not a number I have to interpret." TSB
                itself isn't gone: Fitness & Frische below already shows it
                with the words that explain what it means, so showing it twice
                — once bare, once explained — only bought confusion. */}
            {fState !== 'pending' && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ background: '#0A0C0F99', border: `1px solid color-mix(in srgb, ${statePill.color} 50%, transparent)`, backdropFilter: 'blur(8px)' }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: statePill.color, boxShadow: `0 0 8px ${statePill.color}` }} />
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: `color-mix(in srgb, ${statePill.color} 78%, #FFFFFF)` }}>{statePill.word}</span>
              </span>
            )}
          </div>

          {/* Verdict (pen Verdict) — big state headline + the real, data-driven
              supporting sentence (wrapLine). */}
          <div className="flex flex-col items-center text-center gap-1.5 px-2">
            {verdictHead && <h2 className="num-display" style={{ fontSize: 26, fontWeight: 800, color: '#FFFFFF', lineHeight: 1.1 }}>{verdictHead}</h2>}
            <p style={{ fontSize: 14, fontWeight: 500, color: '#FFFFFFB3', lineHeight: 1.4 }}>{wrapLine}</p>
          </div>

          {/* Why the ring is empty — and, when a sync would fix it, the button
              that does. Renders only while readiness is withheld. */}
          {readinessPending && (
            <ReadinessFreshnessNote
              gate={freshness.gate}
              ageDays={freshness.ageDays}
              lastLabel={lastOvernightLabel}
            />
          )}

          {/* Morning read — deterministic synthesis of last night + today (real
              signals only; morning moment only). */}
          {morningRead && (
            <div className="flex flex-col gap-1">
              <span className="eyebrow" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: '#FFFFFF80' }}>{tFor(locale, 'morning_read')}</span>
              <p style={{ fontSize: 12.5, fontWeight: 500, color: '#FFFFFFB3', lineHeight: 1.5 }}>{morningRead}</p>
            </div>
          )}

          {/* Missed yesterday — honest, non-guilt acknowledgment that a planned
              ride went unridden, tied to the real plan outcome (reflowed to a
              free day / absorbed). Adaptation is never hidden (spec law). */}
          {missedYesterday && (
            <div className="flex flex-col gap-1 rounded-[14px] p-3" style={{ background: '#14181DCC', border: '1px solid #FFFFFF14', backdropFilter: 'blur(10px)' }}>
              <span className="eyebrow" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: '#FFFFFF80' }}>{de ? 'Gestern ausgefallen' : 'Missed yesterday'}</span>
              <p style={{ fontSize: 12.5, fontWeight: 500, color: '#FFFFFFB3', lineHeight: 1.5 }}>
                <span style={{ fontWeight: 700, color: '#FFFFFF' }}>{missedTitle}</span>
                {missedOutcome ? ` — ${missedOutcome}.` : ''}
              </p>
            </div>
          )}

          {/* (Pen keeps "race in N days" in the header line and the race card
              at the BOTTOM as "WHERE THIS LEADS" — no duplicate mid-flow race
              chip here.) */}

          {/* Section kicker — introduces the session / rest block directly
              below (reordered Jul 2026: this used to sit at the END of the
              hero, after Drivers/Coach/Momentum, so the actual session — the
              answer to "should I ride today?" — rendered 1.7 screens below
              the question on a 390px viewport. Session, weather, coach and
              drivers now follow immediately; Drivers/Coach/Momentum moved
              below the weather card, see there). */}
          <span className="eyebrow" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', color: '#FFFFFF99' }}>{sessionKicker}</span>
        </>
      )}

      {/* 4 · Session Review — recommendation vs. what the athlete actually did */}
      {review && <SessionReviewCard review={review} de={de} />}

      {/* 4 · V3 Rest Card (pen JhT2g / iBIGi) — green, never punitive: the
          decision's own reason, tomorrow preview, "Warum Pause?" → AI coach and
          a manual-override link to the workout view, no-guilt footer. */}
      {decisionState === 'planned_rest' && (
        <div
          className="rounded-[24px] p-5 flex flex-col gap-4"
          style={{
            background: 'linear-gradient(125deg, color-mix(in srgb, var(--color-recovery) 14%, var(--color-paper-2)) 0%, var(--color-paper-2) 75%)',
            border: '1px solid var(--color-recovery)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Moon size={16} strokeWidth={2.2} style={{ color: 'var(--color-recovery)' }} />
              <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-recovery)' }}>{de ? 'Heutiger Plan' : "Today's plan"}</span>
            </div>
            <span className="rounded-full px-2.5 py-1" style={{ background: 'color-mix(in srgb, var(--color-recovery) 15%, transparent)', fontSize: 11, fontWeight: 700, color: 'var(--color-recovery)' }}>
              {de ? 'Geplante Pause' : 'Planned rest'}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)' }}>{de ? 'Erholungstag' : 'Recovery Day'}</h2>
            <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
              {(decision?.reason?.trim() || (de ? 'Erholung ist heute die Einheit — der Plan verwandelt die Arbeit der Woche in Fitness.' : 'Recovery is the session today — the plan is turning this week’s work into fitness.'))}
              {(() => {
                const tp = tomorrow?.description?.trim()
                  ? tomorrow.description.trim()
                  : tomorrow?.predicted_tss != null
                    ? `~${Math.round(tomorrow.predicted_tss)} TSS${chipLabel(tomorrow.intensity_chip) ? ` · ${chipLabel(tomorrow.intensity_chip)}` : ''}`
                    : null
                return tp ? ` ${de ? 'Morgen' : 'Tomorrow'}: ${tp}` : null
              })()}
            </p>
          </div>
          <RideAnywayZ1 de={de} />
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)', lineHeight: 1.4 }}>
            {de ? 'Kein schlechtes Gewissen, nichts ausgegraut — der Plan hat diesen Tag mitgezählt.' : 'No guilt, no grey-outs — the plan already counted this day.'}
          </p>
        </div>
      )}

      {/* Brief-failure fallbacks (finding #1) — the honest reduced states.
          (a) week plan says rest → slim factual rest row (no celebratory prose)
          (b) week plan has a session → render THAT session from real week data
          (c) nothing loads → degraded state + retry. Never the green rest card. */}
      {fallback === 'planned_rest' && (
        <div className="rounded-[24px] p-5 flex items-center gap-3.5" style={cardStyle} {...GLASS_CARD_MARKER}>
          <div className="shrink-0 grid place-items-center rounded-full" style={{ width: 44, height: 44, background: 'var(--color-surface-2)' }}>
            <Moon size={22} strokeWidth={2} style={{ color: 'var(--color-recovery)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{de ? 'Ruhetag' : 'Rest day'}</div>
            <div style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>
              {de ? 'Laut Wochenplan — Erholung & Regeneration.' : 'Per the week plan — recovery & regeneration.'}
            </div>
          </div>
        </div>
      )}
      {/* planned_session fallback now renders inside <SessionOfTheDay /> below. */}
      {fallback === 'degraded' && (
        <div className="rounded-[24px] p-5 flex flex-col items-center text-center gap-3" style={cardStyle} {...GLASS_CARD_MARKER}>
          <div className="grid place-items-center rounded-full" style={{ width: 44, height: 44, background: 'var(--color-surface-2)' }}>
            <RefreshCw size={20} strokeWidth={2.2} style={{ color: 'var(--color-muted)' }} />
          </div>
          <div className="flex flex-col gap-1">
            <div className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>
              {de ? 'Wir können deinen Plan gerade nicht laden' : "We can't load your plan right now"}
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
              {de ? 'Kurz durchatmen und neu versuchen — deine Daten sind sicher.' : 'Take a breath and retry — your data is safe.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => refetchBrief()}
            className="inline-flex items-center justify-center gap-1.5 rounded-full min-h-[44px] px-6"
            style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', fontSize: 13, fontWeight: 700, color: 'var(--color-ink)' }}
          >
            <RefreshCw size={14} /> {de ? 'Neu versuchen' : 'Try again'}
          </button>
        </div>
      )}

      {/* Einheit des Tages — the ONE shared session card (identical mount on
          the Train tab). Owns the active-session card, the honest
          planned_session fallback, the "Anpassen" sheet and "Rückgängig".
          Reordered ahead of WeatherWindow (Jul 2026): the section kicker above
          reads "DEINE HEUTIGE EINHEIT" and weather used to render before this,
          so the heading's own promise was answered by something else first. */}
      <SessionOfTheDay />

      {/* Hourly WeatherWindow (pen "V3 · Explore Routes" IgqyH) — the SINGLE
          weather element on Today, mounted near the session card, now AFTER
          it: weather is a when-to-go modifier on the session, not the session
          itself, and belongs after the thing it modifies. Shown on EVERY day
          incl. rest days (explicit user decision, Jul 2026 — a rest day still
          wants to know the dry window if you ride anyway). Hides itself only
          when there's no real forecast data (honest absence). */}
      <WeatherWindowCard />

      {/* Drivers / Coach card / Momentum — moved here from the top of the hero
          (Jul 2026 review): they were rendering the coach's read and the
          overnight signal breakdown for a session the reader hadn't seen yet,
          1.7 screens before the session card itself. Reading the coach's
          "why" now follows having already seen the "what". */}
          {/* Drivers (pen Drivers) — the overnight signals moving the score, as
              honest chips; morning moment. Post/evening keep the adaptive tile
              row (session wrap-up / wind-down). */}
          {moment === 'morning' ? (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="eyebrow" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', color: '#FFFFFF99' }}>{tFor(locale, 'drivers_label')}</span>
                <button
                  type="button"
                  onClick={() => methods.open(buildReadinessMethod(locale, { hrv: hrvNow, rhr: restingHr, sleep: sleepScore, tsb, score: score ?? null }))}
                  aria-label={de ? 'Wie wird das berechnet?' : 'How is this calculated?'}
                  className="inline-flex items-center gap-1 rounded-full"
                  style={{ padding: '4px 10px', background: '#FFFFFF10', border: '1px solid #FFFFFF1F', color: '#FFFFFFB3' }}
                >
                  <Info size={12} />
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.02em' }}>{de ? 'Wie berechnet?' : 'How?'}</span>
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {driverChips.map((d, i) => {
                  const Icon = d.icon
                  return (
                    <div key={i} className="flex flex-col gap-1.5 rounded-[16px] p-3" style={{ background: '#14181DCC', border: '1px solid #FFFFFF14', backdropFilter: 'blur(10px)' }}>
                      <span className="inline-flex items-center gap-1.5">
                        <Icon size={12} style={{ color: '#9BA4AF' }} />
                        <span className="eyebrow" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', color: '#9BA4AF' }}>{d.label}</span>
                      </span>
                      <span className="flex items-baseline gap-1">
                        <span className="num-display" style={{ fontSize: 20, fontWeight: 700, color: '#FFFFFF', lineHeight: 1 }}>{d.value}</span>
                        {d.unit && <span style={{ fontSize: 10, color: '#5C6570' }}>{d.unit}</span>}
                      </span>
                      {d.delta && <span style={{ fontSize: 10.5, fontWeight: 700, color: d.deltaColor ?? '#9BA4AF' }}>{d.delta}</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <span className="eyebrow" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', color: '#FFFFFF99' }}>{momentLabel}</span>
              <div className="flex rounded-[16px] p-3" style={{ background: '#14181DCC', border: '1px solid #FFFFFF14', backdropFilter: 'blur(10px)' }}>
                {momentTiles.map((t, i) => (
                  <div key={i} className="flex-1 flex items-stretch">
                    {i > 0 && <div style={{ width: 1, background: '#FFFFFF14' }} />}
                    <div className="flex-1 flex flex-col items-center gap-1 px-1">
                      <span className="flex items-baseline gap-0.5">
                        <span className="num-display" style={{ fontSize: 19, fontWeight: 700, color: t.color ?? '#FFFFFF', lineHeight: 1 }}>{t.value}</span>
                        {t.unit && <span style={{ fontSize: 10, color: '#5C6570' }}>{t.unit}</span>}
                      </span>
                      <span className="eyebrow" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', color: '#9BA4AF', textAlign: 'center' }}>{t.label}</span>
                      {t.sub && <span style={{ fontSize: 10, fontWeight: 700, color: t.subColor ?? '#9BA4AF', lineHeight: 1 }}>{t.sub}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Coach card (pen CoachCard) — the coach's read for today, purple
              tint + gradient avatar orb. → /coach. */}
          {coachMessage && (
            /* A 10 %-purple wash (#8B5CF61A) let the aura through, which on the
               light faces — planned-rest blue, ready green — turned the card
               into pale lavender with near-white body text and a #C4B5FD
               eyebrow that vanished completely. This card carries the coach's
               actual voice, the thing the whole product is for, so it gets a
               dark glass ground that holds on every aura. The purple identity
               moves to the border, the orb and the eyebrow, where it reads. */
            <Link to="/coach" className="hover-card flex gap-3 rounded-[20px] p-3.5" style={{ background: 'color-mix(in srgb, #8B5CF6 12%, #0A0C0FCC)', border: '1px solid #8B5CF659', backdropFilter: 'blur(10px)' }}>
              <div className="shrink-0 grid place-items-center rounded-full" style={{ width: 38, height: 38, background: 'linear-gradient(45deg, #8B5CF6, #59C3FF)', boxShadow: '0 0 12px #8B5CF666' }}>
                <BrainCircuit size={20} strokeWidth={2} style={{ color: '#FFFFFF' }} />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="eyebrow" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: '#C4B5FD' }}>{tFor(locale, 'coach_label')}</span>
                <p style={{ fontSize: 13.5, fontWeight: 500, color: '#FFFFFFF2', lineHeight: 1.4 }}>{coachMessage}</p>
              </div>
            </Link>
          )}

          {/* Momentum cues — weekly rhythm (consistency vs plan) + 7-day fitness
              trend, small neutral chips. No daily-streak framing (P1-11). */}
          {(consistencyText != null || showFitnessTrend) && (
            <div className="flex flex-wrap items-center gap-2">
              {consistencyText != null && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: '#14181DCC', border: '1px solid #FFFFFF14' }}>
                  <CalendarCheck size={13} style={{ color: consistency != null && consistency.met > 0 ? '#16E08A' : '#9BA4AF' }} />
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#9BA4AF' }}>{consistencyText}</span>
                </span>
              )}
              {showFitnessTrend && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: '#14181DCC', border: '1px solid #FFFFFF14' }}>
                  {dCtl! >= 0 ? <TrendingUp size={13} style={{ color: '#16E08A' }} /> : <TrendingDown size={13} style={{ color: '#9BA4AF' }} />}
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#9BA4AF' }}>{de ? 'Fitness' : 'Fitness'} {dCtl! >= 0 ? '+' : ''}{dCtl} <span style={{ color: '#5C6570', fontWeight: 600 }}>(7d)</span></span>
                </span>
              )}
            </div>
          )}

          {/* (The standalone "Fokus heute:" line was removed — its content now
              lives once, humanised, inside the coach card above.) */}


      {/* Diese Woche (pen WeekProgress) — mounted directly after the WorkoutCard
          to match the pen's FlowColumn order (WorkoutCard → WeekProgress → Load
          → RaceLeads). Full V3 · Load & Form "This Week" card (compliance % +
          TSS/sessions/left + Mon→Sun day-dots). Same real hooks + numbers as
          /load-form (one shared derivation). */}
      <ThisWeekCard />

      {/* 5 · Fitness & Frische (pen Load Card) — the pen's TSB form gauge (from
          V3 · Load & Form), bound to real CTL/ATL/TSB. Replaces the raw
          training-load card on Today; the deeper load story lives on /load-form. */}
      <FitnessFreshnessCard ctl={ctl} atl={atl} tsb={tsb} dCtl7={dCtl} />

      {/* WHERE THIS LEADS (pen RaceLeads) — amber gradient card tying today's
          work to the target event. All real trajectory data: event name, days
          out, weekly-load progress toward what the goal requires, and the
          backend's own narrative hook. Hidden when there's no goal to lead to. */}
      {goalName && trajectory && (() => {
        const req = trajectory.weekly_tss_required ?? null
        const act = trajectory.weekly_tss_actual ?? null
        const pct = req != null && req > 0 && act != null ? Math.max(0, Math.min(100, Math.round((act / req) * 100))) : null
        const line = trajectory.narrative_hook?.trim() || null
        return (
          <Link
            to="/season"
            className="hover-card flex flex-col gap-2.5 rounded-[18px] p-4"
            style={{ background: 'linear-gradient(60deg, #14181DCC 0%, #2A2010CC 100%)', border: '1px solid #FFD1662E' }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="eyebrow" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: '#FFD166' }}>{tFor(locale, 'raceleads_label')}</span>
              <ChevronRight size={16} className="hover-arrow" style={{ color: '#FFD166' }} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFFE6' }} className="line-clamp-1">{trajectory.event_name ?? goalName}</span>
              {daysToGoal != null && daysToGoal > 0 && (
                <span style={{ fontSize: 12, fontWeight: 700, color: '#FFD166', whiteSpace: 'nowrap' }}>{daysToGoal} {de ? 'Tage' : 'days'}</span>
              )}
            </div>
            {pct != null && (
              <div className="rounded-full overflow-hidden" style={{ height: 8, background: '#FFFFFF1A' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: '#FFD166', boxShadow: '0 0 6px #FFD16666', borderRadius: 999 }} />
              </div>
            )}
            {line && <p style={{ fontSize: 13, fontWeight: 500, color: '#FFFFFFD9', lineHeight: 1.35 }}>{line}</p>}
          </Link>
        )
      })()}

      {/* Zusätzliche Einheiten — non-primary / cross-training sessions (2nd ride,
          gym, run, padel-or-other) over the last 7 days, with the load they add
          and its share of the window total. ThisWeekCard sums ALL sports into the
          weekly TSS; this card breaks out the non-bike contribution so the full
          training picture (load + recovery cost) is visible, not just the plan. */}
      <ExtraSessionsCard />

      {/* Breakthrough celebration — only when the detector found a real one (P1.2) */}
      <BreakthroughCelebration />

      {/* Absorb-and-replan disclosure — the plan bent around your riding (P1.4) */}
      <AbsorptionCard />

      {/* Woche als Story — ONE slim link row, Monday + Tuesday (P1.3) */}
      {(today.getDay() === 1 || today.getDay() === 2) && (
        <Link to="/recap/week" className="hover-card rounded-[20px] p-3.5 flex items-center gap-3" style={{ ...cardStyle, borderColor: 'var(--color-accent)' }} {...GLASS_CARD_MARKER}>
          <Sparkles size={18} className="shrink-0" style={{ color: 'var(--color-accent)' }} />
          <span className="flex-1 min-w-0 truncate" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-ink)' }}>
            {de ? 'Deine Woche als Story' : 'Your week, as a story'}
          </span>
          <ChevronRight size={16} className="hover-arrow shrink-0" style={{ color: 'var(--color-accent)' }} />
        </Link>
      )}

      {/* Methods drawer — "Wie wird das berechnet?" for the readiness score. */}
      {methods.sheet}
    </div>
  )
}

// ── Rest-card actions: "Warum Pause?" + "Trotzdem fahren · Z1" ───────────────
// Finding #4: the Z1 button was a dead-end Link to /workout/today ("No workout
// for today."). It now flows through the AUDITED modifier path: one request to
// the coach chat tool loop (the same modify_planned_workout rails + audit row
// + undo window as every chat modification), asking for a short Z1 spin. The
// coach's streamed answer is narrated verbatim — rails may refuse; that
// refusal is honest and shown. On success the brief cache is invalidated so
// the day re-renders with the audited alternate.
function RideAnywayZ1({ de }: { de: boolean }) {
  const qc = useQueryClient()
  const [phase, setPhase] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [reply, setReply] = useState('')

  const request = async () => {
    if (phase === 'busy') return
    setPhase('busy')
    setReply('')
    const msg: ChatMessage = {
      role: 'user',
      content: de
        ? 'Heute ist laut Plan Ruhetag, aber ich möchte trotzdem ganz locker fahren. Bitte plane mir für heute eine kurze Z1-Ausfahrt (ca. 30–45 Minuten) ein — nur, wenn das aus Coach-Sicht vertretbar ist.'
        : "Today is a planned rest day, but I'd like an easy spin anyway. Please schedule a short Z1 ride (about 30–45 minutes) for today — only if that's defensible from a coaching standpoint.",
    }
    try {
      let text = ''
      for await (const chunk of streamCoachChat([msg])) {
        if (chunk.type === 'delta') text += chunk.text ?? ''
        else if (chunk.type === 'replace') text = chunk.text ?? ''
        else if (chunk.type === 'error') throw new Error(chunk.message)
        setReply(text)
      }
      setPhase('done')
      // The chat tool may have mutated today's plan — refresh brief + decision.
      qc.invalidateQueries({ queryKey: COACH_BRIEF_KEY_ROOT })
    } catch {
      setPhase('error')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Link
          to="/coach"
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full min-h-[44px] px-3"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}
        >
          <MessageCircle size={15} style={{ color: 'var(--color-ink-2)' }} /> {de ? 'Warum Pause?' : 'Why rest?'}
        </Link>
        <button
          type="button"
          disabled={phase === 'busy'}
          onClick={request}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full min-h-[44px] px-3"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', fontSize: 13, fontWeight: 600, color: 'var(--color-ink)', opacity: phase === 'busy' ? 0.6 : 1, cursor: phase === 'busy' ? 'default' : 'pointer' }}
        >
          <Bike size={15} style={{ color: 'var(--color-ink-2)' }} /> {phase === 'busy' ? (de ? 'Coach prüft…' : 'Coach is checking…') : (de ? 'Trotzdem fahren · Z1' : 'Ride anyway · Z1')}
        </button>
      </div>
      {(reply || phase === 'error') && (
        <div className="rounded-[12px] flex items-start gap-2" style={{ background: `color-mix(in srgb, ${phase === 'error' ? 'var(--color-amber)' : 'var(--color-recovery)'} 12%, transparent)`, padding: '9px 11px' }}>
          <Sparkles size={13} style={{ color: phase === 'error' ? 'var(--color-amber)' : 'var(--color-recovery)', flexShrink: 0, marginTop: 2 }} />
          <span className="flex-1 min-w-0" style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
            {phase === 'error'
              ? (de ? 'Der Coach ist gerade nicht erreichbar — frag ihn direkt im Chat.' : 'The coach is unreachable right now — ask directly in chat.')
              : reply}
          </span>
        </div>
      )}
    </div>
  )
}
