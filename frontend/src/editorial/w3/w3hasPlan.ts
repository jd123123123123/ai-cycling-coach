import type { WeekResponse } from '../../api/weeks'
import type { AthleteProfile } from '../../types/athlete'

/**
 * DOES THIS RIDER HAVE A TRAINING PLAN — one rule, read by every screen that
 * changes shape because of the answer.
 *
 * Today swaps its session card for the composer on this; the plan route swaps
 * its whole apparatus for the one-pager on this. Two screens deciding the same
 * thing from two different derivations is a bug waiting for the one athlete
 * they disagree about, so the derivation lives here and neither page owns one.
 *
 * WHY THE OLD READ COULD NEVER SAY NO. Today computed
 * `meso != null || weekPlanned > 0`, and both halves are true for everybody:
 *
 *   · `meso_block` is NOT nullable. `api/weeks.py` constructs a
 *     `MesoBlockContext` unconditionally on every `/weeks/current` — a rider
 *     with no plan at all still gets a phase name and a block position.
 *   · `weekPlanned` counted week-strip days whose status is not 'upcoming',
 *     and the strip assigns `isToday ? 'today'` before it looks at anything
 *     else. Today is never 'upcoming', so the count was never below one.
 *
 * So `hasPlan` was a constant `true` wearing a condition. `W3PickGoalCard` —
 * the whole no-plan branch on Today, written and tested — could not render for
 * any athlete in any state. Found 2026-08-26 while giving the branch something
 * more to do.
 *
 * WHAT IS ACTUALLY EVIDENCE: `planned_tss_total`, which the schema documents as
 * "None when no plan rows exist" and `planned_week_total()` returns as None —
 * never 0 — when nothing estimates. The day rows corroborate it: a plan that
 * prescribes something writes a category, a duration or a template onto a day.
 * A week of bare rest rows is not a plan, and neither is an empty week.
 */
export function hasPlanFromWeek(week: WeekResponse | null | undefined): boolean {
  if (week == null) return false
  if ((week.planned_tss_total ?? 0) > 0) return true
  // A prescribed day with no TSS estimate is still a prescription — a plan the
  // estimator could not price is a plan the rider was given.
  return (week.days ?? []).some(
    (d) => d.category !== 'rest'
      && (d.target_tss != null || d.duration_seconds_target != null || d.template_id != null),
  )
}

/** A generated week is not a personal plan. The backend can return a
 * periodisation-shaped fallback before the rider has chosen a goal; Today must
 * keep that fallback out of the plan-phase card until there is an actual
 * target or planning input to coach against. */
export function hasPersonalPlan(profile: AthleteProfile | null | undefined): boolean {
  const goals = profile?.goals
  return Boolean(profile && (
    profile.target_event_type || profile.target_event_date ||
    profile.days_available || profile.weekly_hours_available ||
    goals?.target_ftp || goals?.target_event_name || goals?.target_event_date ||
    goals?.weekly_hours || goals?.days_per_week
  ))
}
