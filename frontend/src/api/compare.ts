import { apiClient } from './client'

export type Winner = 'self' | 'rival' | 'tie'

export interface RiderRef { user_id: number; display_name: string; is_self: boolean }

export interface ClimbDuel {
  label: string; distance_m: number; elev_gain_m: number
  self_time_s: number; rival_time_s: number
  self_vam: number | null; rival_vam: number | null
  self_wkg: number | null; rival_wkg: number | null; winner: Winner
}

export interface PowerDuel { duration_s: number; self_watts: number; rival_watts: number; winner: Winner }

export interface PacingDuel {
  metric: string; self_value: number; rival_value: number; better: 'higher' | 'lower'; winner: Winner
}

export interface RideComparison {
  activity_id: number; me: RiderRef; rival: RiderRef
  overall_winner: Winner; self_points: number; rival_points: number; headline: string
  climb_duels: ClimbDuel[]; power_duels: PowerDuel[]; pacing_duels: PacingDuel[]; lang: string
}

export async function fetchRideComparison(
  activityId: number, locale: string,
): Promise<RideComparison | null> {
  const res = await apiClient.get<RideComparison>(
    `/analytics/activity-debrief/${activityId}/compare`, { params: { lang: locale } })
  if (res.status === 204 || !res.data) return null
  return res.data
}
