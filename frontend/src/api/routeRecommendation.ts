import { apiClient } from './client'

/**
 * The athlete's OWN ridden roads, ranked against today's plan.
 *
 * Backend: `GET /routes/recommended` (`services/route_recommendation.py`).
 * Nothing here is invented. Every route in this payload is a road this rider
 * has actually been down, clustered from their own GPS rides — so "ride this
 * today" points at somewhere they know rather than at a suggestion from a route
 * database they have no relationship with. That is also why `times_ridden`
 * belongs on the card: it is the difference between a recommendation and a
 * reminder.
 *
 * `available: false` is a first-class answer with a machine-readable `reason`;
 * the wording lives in the client, never on the wire.
 */
export type RouteUnavailableReason =
  | 'no_planned_ride_today'
  | 'no_route_history'
  | 'no_target_to_match'

export interface RidableRoute {
  name: string
  /** How many times this rider has been down this road. */
  times_ridden: number
  distance_km: number
  elevation_m: number | null
  best_time_s: number | null
  avg_time_s: number | null
  avg_tss: number | null
  last_ridden: string | null
  start_lat: number
  start_lng: number
  polyline?: [number, number][] | null
  longest_climb_m?: number | null
  max_gradient_pct?: number | null
  climb_share_pct?: number | null
}

export interface RouteMatch {
  route: RidableRoute
  score: number
  /** The unpenalised shape match, so a surface can say "right shape, thin
   *  evidence" instead of collapsing both into one number. */
  raw_fit: number
  duration_fit: number | null
  tss_fit: number | null
  terrain_fit: number | null
  climb_fit: number | null
  is_low_confidence: boolean
  is_virtual: boolean
  is_recently_ridden: boolean
}

export interface RouteRecommendation {
  available: boolean
  reason?: RouteUnavailableReason
  planned?: {
    title: string | null
    target_tss: number | null
    duration_minutes: number | null
    category: string | null
  }
  matches?: RouteMatch[]
  top?: RouteMatch
  alternatives?: RouteMatch[]
}

export async function fetchRecommendedRoutes(): Promise<RouteRecommendation> {
  const res = await apiClient.get<RouteRecommendation>('/routes/recommended')
  return res.data
}
