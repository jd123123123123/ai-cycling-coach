import { apiClient } from './client'
import type { ReactionState } from './crewReactions'

// ──────────────────────────────────────────────────────────────────────
// All-crew rides — every crew member's recent activities, newest first.
// `id` is the activity id (links to the ride-detail route). Mirrors the
// deployed GET /crews/me/rides endpoint.
// ──────────────────────────────────────────────────────────────────────

export interface CrewRide {
  id: number
  user_id: number
  handle: string
  display_name: string
  title: string
  started_at: string
  distance_m: number
  elevation_gain_m: number
  duration_seconds: number
  reactions: ReactionState
}

export async function fetchCrewRides(limit = 20): Promise<CrewRide[]> {
  const res = await apiClient.get<CrewRide[]>('/crews/me/rides', {
    params: { limit },
  })
  return res.data
}
