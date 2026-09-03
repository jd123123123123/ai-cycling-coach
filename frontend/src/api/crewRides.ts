import { apiClient } from './client'
import type { ReactionState } from './crewReactions'

// ──────────────────────────────────────────────────────────────────────
// All-crew rides — every crew member's recent activities, newest first,
// plus the comment thread that hangs under one of them. `id` is the
// activity id (links to the ride-detail route). Mirrors the deployed
// GET /crews/me/rides and /crews/me/rides/{id}/comments endpoints.
//
// WHAT IS DELIBERATELY ABSENT: there is no polyline, no start point, no
// GPS of any kind on a crew ride. The server does not send it (see
// app/api/crew_chat.py) — telling the crew you rode 82 km is the point,
// handing them the track that starts at your front door is not.
// ──────────────────────────────────────────────────────────────────────

/** A personal best a ride set, against that rider's own 90-day history. */
export interface CrewRideRecord {
  duration_s: number
  value_w: number
  prior_best_w: number
  gain_pct: number
  /** "20-Minuten" — the server's word, so a duration added on the backend
   *  needs no change here. */
  label: string
  /** The day the old best was set. Null when the ride that held it has aged
   *  out of the 90-day window — the card prints the number without a date
   *  rather than inventing one. */
  prior_best_at: string | null
}

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
  /** Every one of these is nullable on the wire: a ride imported without a
   *  power meter has no TSS and no average watts, and the card prints "—"
   *  for it rather than a padded zero. */
  sport: string | null
  tss: number | null
  avg_power_w: number | null
  avg_hr: number | null
  calories: number | null
  is_mine: boolean
  reactions: ReactionState
  comment_count: number
  /** What the rider wrote after the ride, and the pictures they attached.
   *  Empty for every ride nobody filled in — which is most of them, and is why
   *  the feed has two post shapes rather than one shape with a hole in it. */
  description: string | null
  photo_urls: string[]
  /** The ride's own shape over time, downsampled: altitude for a ride that
   *  climbed, power for one on a trainer. Raw units — a card scales them
   *  against their own series, never a fixed axis. Null where the ride carries
   *  no such stream, and the card then draws no chart. */
  elevation_profile: number[] | null
  power_profile: number[] | null
  /** Set when this ride beat the rider's own 90-day best at one of the key
   *  durations. Null for the overwhelming majority of rides, which is the
   *  point — a badge everybody has is not a badge. */
  record: CrewRideRecord | null
  /** The ride's own shape as `[[lat, lng], ...]`, downsampled for a feed
   *  thumbnail — the crew post projects it with `projectRouteShape`. Null when
   *  the ride carries no usable GPS track (indoor, trainer, satellite off), and
   *  the post then draws no map rather than inventing one. */
  route?: [number, number][] | null
}

export interface CrewRideComment {
  id: number
  activity_id: number
  user_id: number
  handle: string
  display_name: string
  text: string
  created_at: string
  is_mine: boolean
}

export async function fetchCrewRides(limit = 20): Promise<CrewRide[]> {
  const res = await apiClient.get<CrewRide[]>('/crews/me/rides', {
    params: { limit },
  })
  return res.data
}

/** One ride's thread, oldest-first — a conversation is read downwards. */
export async function fetchCrewRideComments(activityId: number): Promise<CrewRideComment[]> {
  const res = await apiClient.get<CrewRideComment[]>(`/crews/me/rides/${activityId}/comments`)
  return res.data
}

export async function postCrewRideComment(
  activityId: number,
  text: string,
): Promise<CrewRideComment> {
  const res = await apiClient.post<CrewRideComment>(
    `/crews/me/rides/${activityId}/comments`,
    { text },
  )
  return res.data
}
