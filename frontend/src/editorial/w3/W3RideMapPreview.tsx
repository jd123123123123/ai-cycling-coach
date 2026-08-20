import W3RideMapView from './W3RideMapView'

/** TEMP preview — a synthetic Harz track, no backend. `/e/w3-ride-map-preview`
 *  is unguarded, like every other W3 preview route. */
const polyline: [number, number][] = Array.from({ length: 44 }, (_, i) => {
  const t = i / 43
  return [51.74 + 0.05 * Math.sin(t * 6.5) + t * 0.015, 10.6 + t * 0.11 + 0.03 * Math.cos(t * 5)]
})

export default function W3RideMapPreview() {
  return <W3RideMapView polyline={polyline} onBack={() => {}} />
}
