/**
 * useTodaySession — ONE source of truth for "Einheit des Tages".
 *
 * Today and Train (Plan) must render the SAME session card from the SAME
 * data: the coach brief's prescribed_workout (server-side coerced to the
 * plan's PlannedWorkout identity) + the ONE DailyDecision + the week plan as
 * the honest fallback. This hook owns that derivation; the shared
 * <SessionOfTheDay> component owns the pixels. Neither tab re-derives any of
 * it locally — that duplication is exactly what diverged once before.
 */
import { useCoachBrief } from './useCoachBrief'
import { useCurrentWeek } from './useCurrentWeek'
import {
  isActiveDecisionState,
  isSidelinedDecisionState,
  useDailyDecision,
} from './useDailyDecision'
import type { DayPlan } from '../api/weeks'
import type { CoachBriefResponse, DailyDecision, PrescribedWorkout } from '../api/coach'

// ── Brief-failure fallback (review finding #1, Jul 2026) ─────────────────────
/** What the session surface renders when the brief carries NEITHER a decision
 *  NOR a prescription (failed request, or an empty payload):
 *  - 'none'            → normal render paths (decision/workout present, or
 *                        everything is still loading — say nothing yet)
 *  - 'planned_session' → the week plan says today has work → honest reduced
 *                        card from the week data, no invented coaching prose
 *  - 'planned_rest'    → the week plan itself says today is rest
 *  - 'degraded'        → nothing loads → honest "can't load your plan" + retry.
 *  The celebratory rest card must NEVER appear from this path — a fabricated
 *  "Geplante Pause" over an error told a day-1 athlete to skip a real session. */
export type BriefFallback = 'none' | 'planned_session' | 'planned_rest' | 'degraded'
export function briefFallbackState(o: {
  briefFailed: boolean
  briefLoaded: boolean
  decisionState: string | null
  hasWorkout: boolean
  /** true/false = week plan knows today (has work / is rest); null = no week info (absent or still loading) */
  weekTodayHasWork: boolean | null
}): BriefFallback {
  if (o.decisionState != null || o.hasWorkout) return 'none'
  if (!o.briefFailed && !o.briefLoaded) return 'none' // still loading — no verdicts yet
  if (o.weekTodayHasWork === true) return 'planned_session'
  if (o.weekTodayHasWork === false) return 'planned_rest'
  return 'degraded'
}

// ── Session intensity badge (pure, shared) ───────────────────────────────────
/** The session's DEFINING effort: hardest zone held ≥90s across the
 *  prescribed blocks, so a 5×4' @ 115% VO₂ day is never labeled "Z3 · Tempo"
 *  by its duration-averaged IF. IF derivation remains only as fallback when
 *  no block zones exist (finding #5). */
export function sessionIntensity(
  workout: PrescribedWorkout | null | undefined,
  de: boolean,
): { z: string; t: string } | null {
  if (!workout) return null
  const label = (z: number) =>
    z >= 5 ? { z: `Z${Math.min(z, 7)}`, t: 'VO₂' }
      : z === 4 ? { z: 'Z4', t: de ? 'Schwelle' : 'Threshold' }
      : z === 3 ? { z: 'Z3', t: 'Tempo' }
      : z === 2 ? { z: 'Z2', t: de ? 'Grundlage' : 'Endurance' }
      : { z: 'Z1', t: de ? 'Erholung' : 'Recovery' }
  const blocks = workout.blocks ?? []
  if (blocks.length > 0) {
    const perZone = new Map<number, number>()
    blocks.forEach((b) => perZone.set(b.zone, (perZone.get(b.zone) ?? 0) + (b.duration_s ?? 0)))
    const sustained = [...perZone.entries()].filter(([, s]) => s >= 90).map(([z]) => z)
    const zDef = sustained.length > 0 ? Math.max(...sustained) : Math.max(...blocks.map((b) => b.zone))
    if (Number.isFinite(zDef) && zDef >= 1) return label(zDef)
  }
  const durHr = (workout.duration_minutes ?? 0) / 60
  if (durHr <= 0 || workout.predicted_tss == null) return null
  const iff = Math.sqrt(workout.predicted_tss / (durHr * 100))
  if (iff < 0.75) return label(2)
  if (iff < 0.85) return label(3)
  if (iff < 0.95) return label(4)
  return label(5)
}

export interface TodaySession {
  brief: CoachBriefResponse | undefined
  workout: PrescribedWorkout | null
  decision: DailyDecision | null
  decisionState: string | null
  /** sick / injured / break — outranks every training signal */
  sidelined: boolean
  /** Rest is only ever a PLAN statement (decision or week-plan fallback). */
  isRestDay: boolean
  /** A session is still on today's menu (recover / easy / quality / hard). */
  isActiveTrainingDay: boolean
  fallback: BriefFallback
  weekToday: DayPlan | null
  refetchBrief: () => void
}

export function useTodaySession(): TodaySession {
  const { data: brief, isError: briefFailed, refetch: refetchBrief } = useCoachBrief()
  const { decision } = useDailyDecision()
  const { data: weekPlan } = useCurrentWeek()

  const workout = brief?.prescribed_workout ?? null
  const decisionState = decision?.state ?? null
  const sidelined = isSidelinedDecisionState(decision?.state ?? null)

  // Brief-failure fallback (finding #1): when neither decision nor workout
  // exists, the WEEK PLAN is the honest source — never "no workout ⇒ rest".
  const weekToday = weekPlan?.days?.find((d) => d.is_today) ?? null
  const weekTodayHasWork = weekToday == null
    ? null
    : weekToday.category !== 'rest' && (
      (weekToday.duration_seconds_target ?? 0) > 0 ||
      (weekToday.intervals?.length ?? 0) > 0 ||
      (weekToday.target_tss ?? 0) > 0)
  const fallback = briefFallbackState({
    briefFailed,
    briefLoaded: brief !== undefined,
    decisionState,
    hasWorkout: !!workout,
    weekTodayHasWork,
  })

  const isRestDay = decisionState != null
    ? decisionState === 'planned_rest'
    : fallback === 'planned_rest'
  const isActiveTrainingDay = decisionState != null
    ? isActiveDecisionState(decision?.state ?? null)
    : (!!workout && !isRestDay)

  return {
    brief,
    workout,
    decision,
    decisionState,
    sidelined,
    isRestDay,
    isActiveTrainingDay,
    fallback,
    weekToday,
    refetchBrief,
  }
}
