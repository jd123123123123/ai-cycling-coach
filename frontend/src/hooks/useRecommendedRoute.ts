import { useQuery } from '@tanstack/react-query'
import {
  fetchMyRoutes, fetchRecommendedRoutes,
  type RouteLibrary, type RouteRecommendation, type RouteTarget,
} from '../api/routeRecommendation'

/**
 * Today's best-fitting road out of the rider's own history.
 *
 * `staleTime` is an hour: the ranking depends on today's planned session and on
 * a route library built from rides already ingested, and neither moves during a
 * morning. Re-asking on every focus would cost a scoring pass to be told the
 * same road.
 */
export function useRecommendedRoute(target?: RouteTarget, enabled = true) {
  // The target is part of the key, so each day of the week caches its own
  // answer instead of the last-selected one being served for all of them.
  return useQuery<RouteRecommendation>({
    queryKey: ['routes', 'recommended', target ?? null],
    queryFn: () => fetchRecommendedRoutes(target),
    staleTime: 60 * 60 * 1000,
    enabled,
  })
}

/** The rider's own route library. Only fetched when `enabled`, which the card
 *  sets from the recommendation having come back empty — so the ordinary path
 *  still costs exactly one request. */
export function useMyRoutes(enabled: boolean) {
  return useQuery<RouteLibrary>({
    queryKey: ['routes', 'mine'],
    queryFn: fetchMyRoutes,
    staleTime: 60 * 60 * 1000,
    enabled,
  })
}
