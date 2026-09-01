import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { updateGoals } from '../../api/athletes'
import { applyPlanChange, type InterviewAnswers } from '../../api/plan'
import { WEEK_CURRENT_KEY_ROOT } from '../../hooks/useCurrentWeek'
import { COACH_BRIEF_KEY_ROOT } from '../../hooks/useCoachBrief'
import W3GoalSetter, { type GoalDraft } from './W3GoalSetter'

/**
 * W3 · Onboarding — WHAT ARE YOU TRAINING FOR. Route /e/w3-onboard-goal.
 *
 * THE GAP THIS CLOSES IS THE LARGEST ONE IN THE APP. Onboarding never asked
 * for the rider's event. It asked for an annual DISTANCE target — a number the
 * next step's own docblock admits has "NO backend column, LOCAL-ONLY by
 * design" — and for training days. So the single fact the whole periodisation
 * engine is built to plan backwards from was the one fact nobody collected.
 *
 * Everything downstream was already built and waiting for it: the terrain-aware
 * goal screen deriving targets from real elevation, `goal_trajectory`'s forward
 * CTL simulation with a Mujika taper band, `rehearsal/race_plan`'s pacing
 * chapters and fuel plan, wind-and-air-density weather. All of it sat behind a
 * target event that onboarding declined to ask about — finished machinery with
 * no door, which is this repository's most expensive recurring shape.
 *
 * IT REUSES THE SETTER RATHER THAN GROWING A SECOND ONE. Same component, same
 * three MECE branches, same persistence — a parallel onboarding-only goal form
 * would be two places to keep in step and one of them would drift.
 *
 * SKIPPABLE, AND THAT IS DELIBERATE. Mid-signup a rider may genuinely not have
 * a race yet. Forcing the question would collect a fabricated date, which is
 * worse than no date: the plan would then periodise towards a day that means
 * nothing. Skipping leaves `target_event_date` null, the plan runs as an open
 * fitness horizon, and the plan screen's dock keeps asking.
 */

const NEXT = '/e/w3-onboard-goals'

export default function W3OnboardGoalPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: profile } = useAthleteProfile()

  const onSave = useCallback(async (d: GoalDraft): Promise<boolean> => {
    try {
      if (d.kind === 'event') {
        await applyPlanChange({
          goal_changed: 'new_event',
          goal_new: d.eventType ?? undefined,
          target_event_type: d.eventType ?? undefined,
          target_event_date: d.dateISO ?? undefined,
          target_priority: d.priority ?? undefined,
        } as InterviewAnswers)
      } else if (d.kind === 'hours') {
        const [mo, tu, we, th, fr, sa, su] = d.days
        await applyPlanChange({
          weekly_hours: d.weeklyHours ?? undefined,
          days_available: { mon: mo, tue: tu, wed: we, thu: th, fri: fr, sat: sa, sun: su },
        } as InterviewAnswers)
      } else if (d.kind === 'ftp') {
        await updateGoals({
          ...(profile?.goals ?? {}),
          target_ftp: d.targetFtp ?? undefined,
          target_event_date: d.dateISO ?? undefined,
        })
      }
      void qc.invalidateQueries({ queryKey: WEEK_CURRENT_KEY_ROOT })
      void qc.invalidateQueries({ queryKey: COACH_BRIEF_KEY_ROOT })
      void qc.invalidateQueries({ queryKey: ['athlete', 'profile'] })
    } catch {
      // ONBOARDING NEVER TRAPS THE RIDER. A failed write here costs the goal,
      // not the signup — the plan dock asks again on the other side, and the
      // rest of onboarding is still worth finishing. Same rule the neighbouring
      // steps follow for their own best-effort writes.
    }
    navigate(NEXT)
    return true
  }, [navigate, qc, profile])

  return (
    <W3GoalSetter
      vm={{
        currentFtp: profile?.ftp_watts ?? null,
        currentHours: profile?.weekly_hours_available ?? null,
        initialKind: null,
      }}
      onCancel={() => navigate(-1)}
      onSave={onSave}
      onSkip={() => navigate(NEXT)}
      skipLabel="SPÄTER"
    />
  )
}
