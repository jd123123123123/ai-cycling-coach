import { useMemo } from 'react'
import { useAthleteProfile } from './useAthleteProfile'
import { useCoachBrief } from './useCoachBrief'
import { useCurrentWeek } from './useCurrentWeek'
import { seasonArc, type SeasonArc } from '../utils/seasonArc'

/**
 * The one derivation of the season arc, shared by every chapter's ChapterBar.
 *
 * Before this hook existed, each of the four tabs built its own SeasonArc
 * inline, and two of them never read the brief's goal_event_date at all —
 * so an athlete whose event lived in the legacy `goals` JSONB (not yet
 * migrated to the `target_event_date` column) could see a real countdown on
 * Today/Plan and "no event booked" on Body/History, permanently, for the
 * same moment in time. All three source hooks are already React-Query
 * cached (`['athlete','me']`, the coach-brief key, `['week', weekOffset]`),
 * so four call sites of this hook are four reads of three cache entries,
 * not new fetches.
 *
 * This ALWAYS describes the CURRENT week — PlanTab's own paged view
 * (weekOffset) stays separate and continues to drive its plan card, exactly
 * as before; only the spine is unified.
 */
export function useSeasonArc(): SeasonArc {
  const { data: profile } = useAthleteProfile()
  const { data: brief } = useCoachBrief()
  const { data: week } = useCurrentWeek()
  const evidence = (brief?.evidence as Record<string, unknown> | undefined) ?? {}
  const athlete = (evidence.athlete as Record<string, unknown> | undefined) ?? {}
  return useMemo(() => seasonArc({
    targetEventDate: profile?.target_event_date ?? null,
    goalEventDate: typeof athlete.goal_event_date === 'string' ? athlete.goal_event_date : null,
    meso: week?.meso_block ?? null,
  }), [profile?.target_event_date, athlete.goal_event_date, week?.meso_block])
}
