import { useParams, useNavigate } from 'react-router-dom'
import { useActivity } from '../../hooks/useActivity'
import W3Loading from './W3Loading'
import W3RideMapView from './W3RideMapView'

/**
 * The full-screen route, wired. Owns the fetch so `W3RideMapView` stays a pure
 * function of its props and can be rendered from a preview route with a
 * synthetic track — the map is the one thing on this screen, so being able to
 * look at it without a login is worth the ten-line split.
 *
 * IT ASKS FOR THIS RIDE, NOT FOR THE YEAR. It used to find the activity by
 * scanning the season list, and that list carries the SKETCH polyline — around
 * twenty points for a fifty-kilometre ride, which is a scribble that follows no
 * road and cannot be laid over a map. `/activities/{id}` carries the detail
 * route and its gradients, which is what a screen made entirely of a map needs.
 */
export default function W3RideMapPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { data: activity, isLoading } = useActivity(id ? Number(id) : undefined)

  if (isLoading) return <W3Loading label="Lade deine Route…" />
  return (
    <W3RideMapView
      polyline={activity?.route_polyline ?? null}
      grades={activity?.route_grades ?? null}
      onBack={() => navigate(-1)} />
  )
}
