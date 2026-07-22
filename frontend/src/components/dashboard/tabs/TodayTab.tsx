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
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { COACH_BRIEF_KEY_ROOT } from '../../../hooks/useCoachBrief'
import { subDays } from 'date-fns'
import { formatDate } from '../../../utils/format'
import { Link } from 'react-router-dom'
import { Flag, Bike, MessageCircle, ChevronRight, TrendingUp, TrendingDown, CalendarCheck, Moon, Sparkles, RefreshCw } from 'lucide-react'
import { loggedReviewFromEvidence, streamCoachChat, workoutDisplayTitle, type ChatMessage } from '../../../api/coach'
import type { AthleteState } from '../../../api/athletes'
import SessionReviewCard from '../SessionReviewCard'
import SessionOfTheDay from '../SessionOfTheDay'
import WeatherWindowCard from '../WeatherWindowCard'
import FitnessFreshnessCard from '../FitnessFreshnessCard'
import ThisWeekCard from '../ThisWeekCard'
import ExtraSessionsCard from '../ExtraSessionsCard'
import ShaderCanvas from '../../wrapped/ShaderCanvas'
import BreakthroughCelebration from '../BreakthroughCelebration'
import WeeklyWrappedBanner from '../WeeklyWrappedBanner'
import AbsorptionCard from '../AbsorptionCard'
import MorningHealthCard from '../MorningHealthCard'
import { useStreak, useSetAthleteStatus, type WeekConsistency } from '../../../hooks/useStreak'
import { useCurrentWeek } from '../../../hooks/useCurrentWeek'
import { useTodaySession, sessionIntensity } from '../../../hooks/useTodaySession'
import { useDailyMetrics } from '../../../hooks/useDailyMetrics'
import { useTodaySnapshot } from '../../../hooks/useTodaySnapshot'
import { usePMC } from '../../../hooks/usePMC'
import { useActivitiesRange } from '../../../hooks/useActivitiesRange'
import { useGoalTrajectory } from '../../../hooks/useGoalTrajectory'
import { useAthleteProfile } from '../../../hooks/useAthleteProfile'
import { canonicalReadiness, computeReadiness } from '../../../utils/metrics'
import { latestLoad, daysToEvent, localDayKey } from '../../../utils/loadMetrics'
import ScoreRing from '../../ui/ScoreRing'
import { useLocale } from '../../../contexts/LocaleContext'
import { useAuth } from '../../../contexts/AuthContext'
import { tFor } from '../../../i18n/strings'

const CARD = 'rounded-[24px] p-5'
const cardStyle = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const

function readinessColor(score: number | null): string {
  if (score == null) return 'var(--color-muted)'
  if (score >= 66) return 'var(--color-recovery)'
  if (score >= 34) return 'var(--color-amber)'
  return 'var(--color-move)'
}

// WebGL shader tint for the readiness hero — an iridescent flow over a dark
// base, keyed to the readiness tier (green → teal/blue, amber → coral, low →
// magenta/violet). Concrete hex (shaders can't read CSS vars). Kept dark +
// low-opacity at the mount so the score/verdict text stays legible on top.
function readinessShaderUniforms(score: number | null): { u_a: string; u_b: string; u_c: string } {
  if (score == null) return { u_a: '#3A4450', u_b: '#2E6BFF', u_c: '#0A0E14' }
  if (score >= 66) return { u_a: '#1FBF7A', u_b: '#2E6BFF', u_c: '#08130E' }
  if (score >= 34) return { u_a: '#FFB020', u_b: '#FF5A3C', u_c: '#140F08' }
  return { u_a: '#FF3B5C', u_b: '#8B5CF6', u_c: '#120810' }
}

// ── P1-11 / P1-8 weekly rhythm — pure, testable helpers ─────────────────────

/** Audit P1-11 copy: the weekly-rhythm stat that replaced the daily streak.
 *  Null (→ hide entirely) while the backend hasn't sent consistency yet. */
export function consistencyLabel(c: WeekConsistency | null | undefined, de: boolean): string | null {
  if (!c || c.planned <= 0) return null
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

// ── Honest readiness gating — "today's overnight data exists?" ───────────────
// (readiness-timing fix, Jul 2026) At local midnight the training day rolls
// over (the daily decision buckets by athlete-local date), but the athlete
// hasn't slept yet — so there is NO overnight recovery signal for the new day.
// A recovery metric only counts as "today's overnight data" when it is DATED to
// the athlete's current local day AND carries an overnight signal (sleep score,
// overnight HRV, or resting HR). A metric from a PREVIOUS local day (yesterday's
// morning sync) must NEVER be presented as today's readiness.

/** True when a recovery metric dated to the current local day carries an
 *  overnight signal. `todayKey` is the athlete-local yyyy-MM-dd (localDayKey). */
export function hasTodayOvernightRecovery(
  metrics:
    | { date?: string | null; sleep_score?: number | null; hrv_status?: number | null; resting_hr?: number | null }[]
    | null
    | undefined,
  todayKey: string,
): boolean {
  if (!metrics) return false
  return metrics.some(
    (m) => m.date === todayKey && (m.sleep_score != null || m.hrv_status != null || m.resting_hr != null),
  )
}

/** Whether the readiness card must show the calm PENDING state instead of a
 *  score. True ONLY in the "new local day, overnight sync hasn't landed yet"
 *  window: no today-overnight data, the athlete HAS a wearable history (an
 *  athlete with no wearable at all keeps the honest empty '—' state instead),
 *  they haven't trained today (a late/early session shows its post-ride review),
 *  and they're not self-reported sidelined (that card carries its own reason). */
export function isReadinessPending(opts: {
  hasTodayOvernight: boolean
  hasRecoveryHistory: boolean
  trainedToday: boolean
  sidelined: boolean
}): boolean {
  return !opts.hasTodayOvernight && opts.hasRecoveryHistory && !opts.trainedToday && !opts.sidelined
}

// ── Brief-failure fallback (review finding #1, Jul 2026) ─────────────────────
// The logic now lives in the SHARED useTodaySession hook (one source of truth
// for both tabs' session card). Re-exported here so existing consumers/tests
// keep importing from TodayTab — same function object, never a fork.
export { briefFallbackState, type BriefFallback } from '../../../hooks/useTodaySession'

export default function TodayTab() {
  const { locale } = useLocale()
  const { user } = useAuth()
  const de = locale === 'de'
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
  const { data: streakData } = useStreak()
  // Current week's plan — only read for planned_tss_total (quiet-week detection
  // gating the fitness-trend chip, audit P1-8). Shares PlanTab's query cache.
  const { data: weekPlan } = useCurrentWeek()
  const setStatus = useSetAthleteStatus()
  // Status changes that alter coaching (sick/injured/break) confirm first.
  const [confirmStatus, setConfirmStatus] = useState<Exclude<AthleteState, 'healthy'> | null>(null)

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
  const rColor = readinessColor(score ?? null)

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

  const pmcBio = evidence.biometrics as Record<string, unknown> | undefined
  const hrv = pmcBio?.hrv as Record<string, unknown> | undefined
  const hrvDelta = hrv?.delta_pct as number | null | undefined
  const sleepScore = latest?.sleep_score ?? null
  const bodyBattery = latest?.body_battery ?? null
  const restingHr = latest?.resting_hr ?? null
  const hrvNow = snapshot?.hrv_overnight_avg ?? latest?.hrv_status ?? null

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
  const todayKey = localDayKey(today)
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
  const athleteState: AthleteState = streakData?.status?.state ?? 'healthy'

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
  // Honest readiness gating (readiness-timing fix): does TODAY (athlete-local)
  // have overnight recovery data yet? Pre-dawn on a new day the answer is no —
  // yesterday's morning sync does NOT count — so the readiness card shows a
  // calm "updates after you sleep" PENDING state instead of fabricating a fresh
  // score from stale/partial inputs. Once the morning sync lands today's sleep /
  // overnight-HRV / RHR (the normal case), the real score returns.
  const hasTodayOvernight = useMemo(() => hasTodayOvernightRecovery(metrics, todayKey), [metrics, todayKey])
  const readinessPending = isReadinessPending({
    hasTodayOvernight,
    hasRecoveryHistory: latest != null, // wearable history exists (else keep empty '—')
    trainedToday,
    sidelined,
  })
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

  // DAY-STATE-AWARE decision pill — the one-glance "today's move". It must never
  // contradict the wrap-up line (or tell an athlete to "train" after they've
  // already trained). Priority: already trained today → session logged (+ a
  // recover nuance when depleted); rest day prescribed → rest day; otherwise the
  // readiness tier decides go-hard / go-controlled / recover.
  const { pillWord, pillColor } = (() => {
    // ONE decision, one pill — keyed 1:1 off DailyDecision.state (audit P0-3).
    if (decisionState != null) {
      switch (decisionState) {
        case 'sick': return { pillWord: tFor(locale, 'dd_pill_sick'), pillColor: 'var(--color-amber)' }
        case 'injured': return { pillWord: tFor(locale, 'dd_pill_injured'), pillColor: 'var(--color-amber)' }
        case 'break': return { pillWord: tFor(locale, 'dd_pill_break'), pillColor: 'var(--color-recovery)' }
        case 'trained_already':
          return roughRecovery
            ? { pillWord: tFor(locale, 'dd_pill_trained_recover'), pillColor: 'var(--color-amber)' }
            : { pillWord: tFor(locale, 'dd_pill_trained'), pillColor: 'var(--color-recovery)' }
        case 'planned_rest': return { pillWord: tFor(locale, 'dd_pill_rest'), pillColor: 'var(--color-recovery)' }
        case 'recover': return { pillWord: tFor(locale, 'dd_pill_recover'), pillColor: 'var(--color-amber)' }
        case 'easy': return { pillWord: tFor(locale, 'dd_pill_easy'), pillColor: rColor }
        case 'quality': return { pillWord: tFor(locale, 'dd_pill_quality'), pillColor: rColor }
        case 'hard': return { pillWord: tFor(locale, 'dd_pill_hard'), pillColor: rColor }
      }
    }
    // Fallback while the decision loads — self-reported status outranks every
    // readiness signal, then the client's weakest-honest-signal chain.
    if (athleteState === 'sick') return { pillWord: tFor(locale, 'dd_pill_sick'), pillColor: 'var(--color-amber)' }
    if (athleteState === 'injured') return { pillWord: tFor(locale, 'dd_pill_injured'), pillColor: 'var(--color-amber)' }
    if (athleteState === 'break') return { pillWord: tFor(locale, 'dd_pill_break'), pillColor: 'var(--color-recovery)' }
    if (trainedToday) {
      return roughRecovery
        ? { pillWord: tFor(locale, 'dd_pill_trained_recover'), pillColor: 'var(--color-amber)' }
        : { pillWord: tFor(locale, 'dd_pill_trained'), pillColor: 'var(--color-recovery)' }
    }
    if (isRestDay) return { pillWord: tFor(locale, 'dd_pill_rest'), pillColor: 'var(--color-recovery)' }
    if (tier === 'peak' || tier === 'ready') return { pillWord: tFor(locale, 'dd_pill_hard'), pillColor: rColor }
    if (tier === 'caution') return { pillWord: de ? 'Kontrolliert trainieren' : 'Train controlled', pillColor: rColor }
    if (tier === 'rest') return { pillWord: tFor(locale, 'dd_pill_recover'), pillColor: rColor }
    // Brief unavailable + no readiness signal: say what we know, never "Loading…" forever.
    if (fallback === 'planned_session') return { pillWord: de ? 'Einheit geplant' : 'Session planned', pillColor: 'var(--color-accent)' }
    if (fallback === 'degraded') return { pillWord: '—', pillColor: 'var(--color-muted)' }
    return { pillWord: de ? 'Lade…' : 'Loading…', pillColor: rColor }
  })()

  // ── MOMENT-ADAPTIVE HERO ───────────────────────────────────────────────────
  // The hero surfaces DIFFERENT, moment-relevant signals. Detected from real
  // data: whether a session is already logged today, and the wall-clock hour.
  //   • post    → trained today: session wrap-up (what you did + recover + next)
  //   • evening → not trained, ≥18:00: wind-down (recovery + tomorrow + sleep)
  //   • morning → not trained, else: overnight-recovery story + what's on deck
  const hour = today.getHours()
  const moment: 'post' | 'evening' | 'morning' = trainedToday ? 'post' : hour >= 18 ? 'evening' : 'morning'

  const sleepHours = latest?.sleep_detail?.total_s != null ? latest.sleep_detail.total_s / 3600 : null
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
      : (de ? ' nach dem gestrigen Ruhetag' : " after yesterday's rest day")

    // Sentence 1 — sleep in context of yesterday (falls back to yesterday-only
    // when no sleep data landed).
    const s1 = (() => {
      if (sN == null) {
        return yesterdayTrained
          ? (yesterdayTss > 0
              ? (de ? `${yesterdayTss} TSS von gestern stecken in den Beinen.` : `${yesterdayTss} TSS from yesterday are in the legs.`)
              : (de ? 'Die gestrige Einheit steckt noch in den Beinen.' : "Yesterday's session is still in the legs."))
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
  const consistencyText = consistencyLabel(consistency, de)
  const showFitnessTrend = shouldShowFitnessTrendChip(
    dCtl,
    decisionState,
    weekPlan?.planned_tss_total ?? null,
    fourWeekAvgWeeklyTss(pmc?.entries),
  )

  return (
    <div className="flex flex-col gap-6 pb-4">
      {/* 1 · Greeting Header (pen GyODe) — greeting + date + avatar ONLY. The
          V3 · Today frame (OwSbv → Greeting Header) carries NO weather chip
          here; the single coherent weather element is the hourly
          WeatherWindowCard mounted lower, near the session (below). The old
          full-width WeatherNudge chip was a V2 remnant not present in the pen
          and has been removed (user report: "old weather still on top"). */}
      <div className="flex flex-col gap-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <h1 className="num-display" style={{ fontSize: 24, color: 'var(--color-ink)', lineHeight: 1.1 }}>{greeting}</h1>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink-2)' }}>{formatDate(today, de ? 'EEEE, d. MMMM' : 'EEEE, MMMM d', locale)}</span>
          </div>
          <Link
            to="/power-profile"
            className="shrink-0 grid place-items-center rounded-full overflow-hidden"
            style={{ width: 46, height: 46, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}
            aria-label={de ? 'Power-Profil öffnen' : 'Open power profile'}
          >
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)' }}>{(athleteName ?? 'A').charAt(0).toUpperCase()}</span>
            )}
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

      {/* 2 · Race chip (pen m3IzG1) — compact goal countdown → /season */}
      {goalName && (
        <Link to="/season" className={`${CARD} hover-card flex items-center gap-3.5`} style={cardStyle}>
          <div className="shrink-0 grid place-items-center rounded-full" style={{ width: 40, height: 40, background: 'var(--color-surface-2)' }}>
            <Flag size={20} strokeWidth={2} style={{ color: 'var(--color-ink-2)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="eyebrow" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-ink-2)' }}>{de ? 'Nächstes Ziel' : 'Next goal'}</div>
            {/* clamp-2 (textfit): long event names wrap to two lines, never truncate */}
            <div className="num-display line-clamp-2" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{goalName}</div>
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

      {/* 3 · Recovery/readiness card — "here's exactly where you stand" hero:
          score ring + verdict, morning read, momentum cues and moment tiles.
          Gradient + glow are keyed to the readiness color. */}
      <div
        className="relative overflow-hidden rounded-[28px] p-5 flex flex-col gap-5"
        style={{
          background: `linear-gradient(150deg, color-mix(in srgb, ${readinessPending ? 'var(--color-muted)' : rColor} 15%, var(--color-paper-2)) 0%, var(--color-paper-2) 62%)`,
          border: `1px solid color-mix(in srgb, ${readinessPending ? 'var(--color-muted)' : rColor} 40%, var(--color-rule))`,
          boxShadow: `0 12px 34px -18px color-mix(in srgb, ${readinessPending ? 'var(--color-muted)' : rColor} 70%, transparent)`,
          isolation: 'isolate',
        }}
      >
        {/* WebGL readiness backdrop — animated iridescent flow tinted by tier,
            behind the content (z-index:-1 within the isolated stacking context;
            reduced-motion freezes it, offscreen pauses it). Pending → the calm
            neutral flow (null uniforms), never a tier-colored hint of a score. */}
        <ShaderCanvas
          variant="iri"
          uniforms={readinessShaderUniforms(readinessPending ? null : score)}
          style={{ position: 'absolute', inset: 0, zIndex: -1, opacity: 0.5, pointerEvents: 'none' }}
        />
        {readinessPending ? (
          /* PENDING — new local day, overnight sync hasn't landed yet. No score
             ring, no fabricated number; a calm "nach dem Schlaf" line. Keeps the
             card's place + shader background. The real score returns the moment
             today's overnight sleep / HRV / RHR lands (normal morning case). */
          <div className="flex items-center gap-5">
            <div
              className="shrink-0 grid place-items-center rounded-full"
              style={{ width: 104, height: 104, border: '1px solid var(--color-rule)', background: 'color-mix(in srgb, var(--color-muted) 10%, transparent)' }}
            >
              <Moon size={34} strokeWidth={1.8} style={{ color: 'var(--color-muted)' }} />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <span className="eyebrow" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-ink-2)' }}>{de ? 'Bereitschaft' : 'Readiness'}</span>
              <span className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)', lineHeight: 1.15 }}>{de ? 'Noch keine Nacht-Werte' : 'No overnight data yet'}</span>
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>
                {de
                  ? 'Deine Bereitschaft aktualisiert sich nach deinem Schlaf — für heute liegen noch keine Über-Nacht-Werte vor.'
                  : 'Your readiness updates after you sleep — no overnight data has landed for today yet.'}
              </p>
            </div>
          </div>
        ) : (
        /* Readiness ring + headline state + personalized one-liner */
        <Link to="/dashboard?tab=recovery" className="hover-card flex items-center gap-5">
          <ScoreRing score={score ?? 0} color={rColor} size={104}>
            <div className="flex flex-col items-center">
              <span className="num-display" style={{ fontSize: 32, color: rColor, lineHeight: 1 }}>{score != null ? Math.round(score) : '—'}</span>
              <span className="eyebrow" style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-muted)' }}>/ 100</span>
            </div>
          </ScoreRing>
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <span className="eyebrow" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-ink-2)' }}>{de ? 'Bereitschaft' : 'Readiness'}</span>
            <span className="inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1" style={{ background: `color-mix(in srgb, ${pillColor} 15%, transparent)` }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: pillColor }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: pillColor }}>{pillWord}</span>
            </span>
            <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-ink)', lineHeight: 1.4 }}>{wrapLine}</p>
          </div>
        </Link>
        )}

        {/* Morning read — compact deterministic synthesis of last night + today.
            Only renders in the morning moment and only from real signals. Never
            in the pending window (it would assert a stale sleep/HRV number). */}
        {!readinessPending && morningRead && (
          <div className="flex flex-col gap-1">
            <span className="eyebrow" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-muted)' }}>{tFor(locale, 'morning_read')}</span>
            <p style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.5 }}>{morningRead}</p>
          </div>
        )}

        {/* Momentum cues — weekly rhythm (consistency vs plan) + 7-day fitness
            trend, small neutral chips. No daily-streak framing (P1-11). */}
        {(consistencyText != null || showFitnessTrend) && (
          <div className="flex flex-wrap items-center gap-2">
            {consistencyText != null && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}>
                <CalendarCheck size={13} style={{ color: consistency != null && consistency.met > 0 ? 'var(--color-recovery)' : 'var(--color-muted)' }} />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-ink-2)' }}>{consistencyText}</span>
              </span>
            )}
            {showFitnessTrend && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}>
                {dCtl! >= 0 ? <TrendingUp size={13} style={{ color: 'var(--color-recovery)' }} /> : <TrendingDown size={13} style={{ color: 'var(--color-muted)' }} />}
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-ink-2)' }}>{de ? 'Fitness' : 'Fitness'} {dCtl! >= 0 ? '+' : ''}{dCtl} <span style={{ color: 'var(--color-muted)', fontWeight: 600 }}>(7d)</span></span>
              </span>
            )}
          </div>
        )}

        {!readinessPending && <div style={{ height: 1, background: 'var(--color-rule)' }} />}

        {/* Moment-adaptive metric row — the RIGHT signals for right now:
            morning = overnight recovery (HRV Δ / Sleep / RHR / on-deck);
            post-session = wrap-up (Duration / TSS / IF / Grade);
            evening = wind-down (Recovery / Tomorrow / Sleep target).
            Suppressed in the pending window — these tiles would show yesterday's
            overnight numbers as today's. */}
        {!readinessPending && (
        <div className="flex flex-col gap-2.5">
          <span className="eyebrow" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-muted)' }}>{momentLabel}</span>
          <div className="flex">
            {momentTiles.map((t, i) => (
              <div key={i} className="flex-1 flex items-stretch">
                {i > 0 && <div style={{ width: 1, background: 'var(--color-rule)' }} />}
                <div className="flex-1 flex flex-col items-center gap-1 px-1">
                  <span className="flex items-baseline gap-0.5">
                    <span className="num-display" style={{ fontSize: 19, color: t.color ?? 'var(--color-ink)', lineHeight: 1 }}>{t.value}</span>
                    {t.unit && <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{t.unit}</span>}
                  </span>
                  <span className="eyebrow" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--color-muted)', textAlign: 'center' }}>{t.label}</span>
                  {t.sub && <span style={{ fontSize: 10, fontWeight: 700, color: t.subColor ?? 'var(--color-ink-2)', lineHeight: 1 }}>{t.sub}</span>}
                </div>
              </div>
            ))}
          </div>
          {focusLine && (
            <div className="flex items-start gap-2" style={{ marginTop: 2 }}>
              <Sparkles size={13} strokeWidth={2.2} style={{ color: rColor, marginTop: 2, flexShrink: 0 }} />
              <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>{focusLine}</p>
            </div>
          )}
        </div>
        )}
      </div>

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
        <div className="rounded-[24px] p-5 flex items-center gap-3.5" style={cardStyle}>
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
        <div className="rounded-[24px] p-5 flex flex-col items-center text-center gap-3" style={cardStyle}>
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

      {/* Hourly WeatherWindow (pen "V3 · Explore Routes" IgqyH) — the SINGLE
          weather element on Today, mounted near the session card. Shown on
          EVERY day incl. rest days (explicit user decision, Jul 2026 — a rest
          day still wants to know the dry window if you ride anyway). Hides
          itself only when there's no real forecast data (honest absence). */}
      <WeatherWindowCard />

      {/* Einheit des Tages — the ONE shared session card (identical mount on
          the Train tab). Owns the active-session card, the honest
          planned_session fallback, the "Anpassen" sheet and "Rückgängig". */}
      <SessionOfTheDay />

      {/* 5 · Fitness & Frische — the pen's TSB form gauge (from V3 · Load &
          Form), bound to real CTL/ATL/TSB. Replaces the raw training-load card
          on Today; the deeper load story lives on /load-form. */}
      <FitnessFreshnessCard ctl={ctl} atl={atl} tsb={tsb} dCtl7={dCtl} />

      {/* Diese Woche — the full V3 · Load & Form "This Week" card (compliance %
          + TSS/sessions/left + Mon→Sun day-dots), mounted right after the load
          snapshot per the V3 · Today rhythm. Same real hooks + numbers as
          /load-form (one shared derivation). Supersedes the old slim day-dot
          link row (P2 dedupe: one "Diese Woche" block, not two). */}
      <ThisWeekCard />

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
        <Link to="/recap/week" className="hover-card rounded-[20px] p-3.5 flex items-center gap-3" style={{ ...cardStyle, borderColor: 'var(--color-accent)' }}>
          <Sparkles size={18} className="shrink-0" style={{ color: 'var(--color-accent)' }} />
          <span className="flex-1 min-w-0 truncate" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-ink)' }}>
            {de ? 'Deine Woche als Story' : 'Your week, as a story'}
          </span>
          <ChevronRight size={16} className="hover-arrow shrink-0" style={{ color: 'var(--color-accent)' }} />
        </Link>
      )}
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
