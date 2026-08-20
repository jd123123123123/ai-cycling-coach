import { useQuery } from '@tanstack/react-query'
import { fetchRecommendedRoutes, type RouteRecommendation } from '../api/routeRecommendation'

/**
 * Today's best-fitting road out of the rider's own history.
 *
 * `staleTime` is an hour: the ranking depends on today's planned session and on
 * a route library built from rides already ingested, and neither moves during a
 * morning. Re-asking on every focus would cost a scoring pass to be told the
 * same road.
 */
export function useRecommendedRoute(enabled = true) {
  return useQuery<RouteRecommendation>({
    queryKey: ['routes', 'recommended'],
    queryFn: fetchRecommendedRoutes,
    staleTime: 60 * 60 * 1000,
    enabled,
  })
}
