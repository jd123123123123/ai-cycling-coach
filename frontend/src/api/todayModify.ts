import { apiClient } from './client'

// The audited one-tap workout modifier (workout_modifier vocabulary). This is
// the PERSISTING adapt — unlike the `/coach/plan/preview` dry-run, POST
// /workouts/today/modify writes the new session server-side, so the refreshed
// /weeks/current + coach-brief reflect it. Undo restores the original.
// `rest` joined the set once the SERVER could persist it. It used to be faked
// on the plan screen — a hand-written success object returned before any
// request — so the type deliberately did not carry it. See
// `workout_modifier._apply_rest`.
export type TodayModificationType = 'shorten' | 'lengthen' | 'easier' | 'harder' | 'indoor' | 'rest'

export interface TodayModifyResult {
  success: boolean
  found?: boolean
  reason: string
  title?: string | null
  duration_min?: number
  predicted_tss?: number
  template_id?: string
  rails_downgraded?: boolean
}

/** Persist a one-tap modification to today's prescribed workout. `duration_min`
 *  only applies to `shorten` / `lengthen`. */
export async function modifyTodayWorkout(
  modificationType: TodayModificationType,
  durationMin?: number,
): Promise<TodayModifyResult> {
  const res = await apiClient.post<TodayModifyResult>('/workouts/today/modify', {
    modification_type: modificationType,
    ...(durationMin != null ? { duration_min: durationMin } : {}),
  })
  return res.data
}

/** Undo the most recent modification, restoring the original prescribed session. */
export async function undoTodayModify(): Promise<{ success?: boolean; found?: boolean; reason?: string }> {
  const res = await apiClient.post<{ success?: boolean; found?: boolean; reason?: string }>(
    '/workouts/today/modify/undo',
  )
  return res.data
}
