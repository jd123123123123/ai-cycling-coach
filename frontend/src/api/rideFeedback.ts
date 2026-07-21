import { apiClient } from './client'

// The 4-tap RPE scale on the Ride Recap "How hard did that feel?" card.
export type RpeValue = 'easy' | 'moderate' | 'hard' | 'all_out'

export interface RideFeedbackRead {
  activity_id: number
  rpe: RpeValue | null
  updated_at: string | null
}

/** Read the athlete's persisted post-ride RPE for an activity (null if never set). */
export async function fetchRideRpe(activityId: number): Promise<RideFeedbackRead> {
  const res = await apiClient.get<RideFeedbackRead>(`/activities/${activityId}/rpe`)
  return res.data
}

/** Record (or update) the athlete's post-ride RPE — the persisted side of the
 *  planned-vs-actual RPE loop. Upserts server-side. */
export async function putRideRpe(activityId: number, rpe: RpeValue): Promise<RideFeedbackRead> {
  const res = await apiClient.put<RideFeedbackRead>(`/activities/${activityId}/rpe`, { rpe })
  return res.data
}
