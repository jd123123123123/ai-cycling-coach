import RouteSketch from '../ui/RouteSketch'

/**
 * RouteMini — a compact, self-contained SVG route line for a crew event's
 * uploaded GPX tour: the shape of the route, not a per-power heat map. Takes
 * the `[[lat, lng], …]` polyline the backend caches on the event. No tiles, no
 * network.
 *
 * Since Jul 2026 the projection itself lives in ui/RouteSketch — this file, the
 * routes page and the history thumbnails each carried their own copy of the
 * same normalise-and-flip maths. The halo and the start/finish dots stay,
 * because unifying the projection is not a licence to restyle the card.
 */
const VIEW_W = 300
const VIEW_H = 150

export default function RouteMini({
  polyline,
  height = 116,
  color = 'var(--color-accent)',
  ariaLabel,
}: {
  polyline: [number, number][]
  height?: number
  color?: string
  ariaLabel?: string
}) {
  return (
    <RouteSketch
      polyline={polyline}
      width={VIEW_W}
      height={VIEW_H}
      pad={12}
      strokeWidth={3}
      halo
      endpoints
      fluid
      renderHeight={height}
      color={color}
      ariaLabel={ariaLabel ?? 'Route'}
    />
  )
}
