import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import W3Loading from './W3Loading'
import W3RideMapView from './W3RideMapView'

/**
 * The full-screen route, wired. Owns the fetch so `W3RideMapView` stays a pure
 * function of its props and can be rendered from a preview route with a
 * synthetic track — the map is the one thing on this screen, so being able to
 * look at it without a login is worth the ten-line split.
 */
export default function W3RideMapPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const seasonStart = useMemo(() => new Date(new Date().getFullYear(), 0, 1), [])
  const { data: season, isLoading } = useActivitiesRange(seasonStart, new Date())
  const activity = useMemo(
    () => (season?.activities ?? []).find((a) => a.id === Number(id)) ?? null,
    [season, id],
  )

  if (isLoading) return <W3Loading label="Lade deine Route…" />
  return (
    <W3RideMapView
      polyline={activity?.route_polyline ?? null}
      grades={activity?.route_grades ?? null}
      onBack={() => navigate(-1)} />
  )
}
