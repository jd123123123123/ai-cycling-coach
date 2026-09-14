import { useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { updateGoals } from '../../api/athletes'
import { applyPlanChange, buildPlan, type InterviewAnswers } from '../../api/plan'
import { WEEK_CURRENT_KEY_ROOT } from '../../hooks/useCurrentWeek'
import { COACH_BRIEF_KEY_ROOT } from '../../hooks/useCoachBrief'
import W3GoalSetter, { type GoalDraft, type GoalKind } from './W3GoalSetter'

/**
 * W3 · The goal setter, wired.
 *
 * EVERY BRANCH WRITES SOMEWHERE REAL — checked against the server before the
 * form was drawn, because a control whose value is silently dropped is the
 * defect this codebase keeps re-growing (the plan sheet's rest-cadence and
 * indoor-share pickers were exactly that, and were removed for it).
 *
 *   event  → POST /plan/change/apply   goal_changed / goal_new /
 *                                      target_event_date / target_priority
 *   hours  → POST /plan/change/apply   weekly_hours / days_available
 *   ftp    → PATCH /athletes/me        goals.target_ftp (+ the date beside it,
 *                                      because a target with no date is a wish)
 *
 * `?intent=event|ftp|hours` pre-selects the first question, so the three ways
 * in from the empty-plan page land on the right branch instead of all three
 * arriving at the same undifferentiated screen — which is what they used to do.
 */

const KIND_FROM_INTENT: Record<string, GoalKind> = {
  event: 'event', ftp: 'ftp', hours: 'hours',
}

export default function W3GoalSetterPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const { data: profile } = useAthleteProfile()

  const onSave = useCallback(async (d: GoalDraft): Promise<boolean> => {
    try {
      if (d.kind === 'event') {
        const answers: InterviewAnswers = {
          goal_changed: 'new_event',
          goal_new: d.eventType ?? undefined,
          target_event_type: d.eventType ?? undefined,
          target_event_date: d.dateISO ?? undefined,
          target_priority: d.priority ?? undefined,
        }
        await applyPlanChange(answers)
      } else if (d.kind === 'hours') {
        const [mo, tu, we, th, fr, sa, su] = d.days
        await applyPlanChange({
          weekly_hours: d.weeklyHours ?? undefined,
          days_available: { mon: mo, tue: tu, wed: we, thu: th, fri: fr, sat: sa, sun: su },
        } as InterviewAnswers)
      } else if (d.kind === 'ftp') {
        // Through the goals endpoint, not the plan interview: `InterviewAnswers`
        // has no threshold field, so writing it there would have dropped the
        // number on the floor. `target_event_date` doubles as the by-when here
        // — it is the date the plan periodises towards either way.
        await updateGoals({
          ...(profile?.goals ?? {}),
          target_ftp: d.targetFtp ?? undefined,
          target_event_date: d.dateISO ?? undefined,
        })
        await buildPlan('plan_change')
      } else {
        return false
      }
      void qc.invalidateQueries({ queryKey: ['plan', 'current'] })
      void qc.invalidateQueries({ queryKey: WEEK_CURRENT_KEY_ROOT })
      void qc.invalidateQueries({ queryKey: COACH_BRIEF_KEY_ROOT })
      // ['athlete','me'] is the real profile key (useAthleteProfile) — the old
      // ['athlete','profile'] matched nothing, so /e/w3-plan read a stale goal.
      void qc.invalidateQueries({ queryKey: ['athlete', 'me'] })
      navigate('/e/w3-plan?created=1')
      return true
    } catch {
      return false
    }
  }, [navigate, qc, profile])

  return (
    <W3GoalSetter
      vm={{
        currentFtp: profile?.ftp_watts ?? null,
        currentHours: profile?.weekly_hours_available ?? null,
        initialKind: KIND_FROM_INTENT[params.get('intent') ?? ''] ?? null,
      }}
      onCancel={() => navigate(-1)}
      onSave={onSave}
    />
  )
}
