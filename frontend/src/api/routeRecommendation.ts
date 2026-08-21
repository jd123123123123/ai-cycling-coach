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
  /** A Zwift/Rouvy ride. Kept on the ROUTE as well as on the match, because
   *  what to draw beside a name — a road or a screen — is a fact about the
   *  route, not about how it scored today. */
  is_virtual?: boolean
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

/** What session to rank against. Omitted entirely, the server answers about
 *  TODAY — which is what the Today card wants. The plan card asks once per day
 *  of the week, so it states the target instead. */
export interface RouteTarget {
  duration_minutes?: number | null
  target_tss?: number | null
  category?: string | null
  /** True ranks trainer routes first, false roads first. Undefined leaves the
   *  standing preference for roads, which is right when nobody said. */
  indoor?: boolean | null
}

export async function fetchRecommendedRoutes(target?: RouteTarget): Promise<RouteRecommendation> {
  const params: Record<string, string | number | boolean> = {}
  if (target?.duration_minutes != null) params.duration_minutes = target.duration_minutes
  if (target?.target_tss != null) params.target_tss = target.target_tss
  if (target?.category) params.category = target.category
  if (target?.indoor != null) params.indoor = target.indoor
  const res = await apiClient.get<RouteRecommendation>('/routes/recommended', { params })
  return res.data
}

export interface RouteLibrary {
  available: boolean
  n_gps_rides: number
  routes: RidableRoute[]
}

/**
 * Every road the rider has ridden, most-ridden first once sorted.
 *
 * Asked for ONLY when the ranked recommendation has nothing to say — a rest day,
 * or a plan with no target to match against. The card then falls back to the
 * road they ride most, which is a different and weaker claim ("your usual
 * loop") and is worded as one. A recommendation and a habit must not be dressed
 * the same way.
 */
export async function fetchMyRoutes(): Promise<RouteLibrary> {
  const res = await apiClient.get<RouteLibrary>('/routes/mine')
  return res.data
}
