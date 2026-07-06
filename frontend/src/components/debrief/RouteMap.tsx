import type { RoutePoint } from '../../api/debrief'

const VIEW_W = 320
const VIEW_H = 320
const PAD = 16

/** Self-contained SVG route map: projects lat/lng into a padded viewBox,
 * no external tiles/images/fetch. Mirrors the "draw it yourself" approach
 * used elsewhere in the app (Sparkline, GradeBadge rings). */
export default function RouteMap({ route }: { route: RoutePoint[] }) {
  if (route.length < 2) return null

  const lats = route.map((p) => p.lat)
  const lngs = route.map((p) => p.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)

  const latSpan = maxLat - minLat || 1e-6
  const lngSpan = maxLng - minLng || 1e-6

  const innerW = VIEW_W - PAD * 2
  const innerH = VIEW_H - PAD * 2

  // Project lng -> x, lat -> y (inverted: higher lat = smaller y = "up")
  const project = (p: RoutePoint): [number, number] => {
    const x = PAD + ((p.lng - minLng) / lngSpan) * innerW
    const y = PAD + (1 - (p.lat - minLat) / latSpan) * innerH
    return [x, y]
  }

  const points = route.map(project)
  const pointsAttr = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const [startX, startY] = points[0]
  const [endX, endY] = points[points.length - 1]

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="w-full h-auto"
      style={{ maxHeight: 340, aspectRatio: '1 / 1' }}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Route map"
    >
      <polyline
        points={pointsAttr}
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.85}
      />
      <circle cx={startX} cy={startY} r={5} fill="var(--color-good)" />
      <circle cx={endX} cy={endY} r={5} fill="var(--color-bad)" />
    </svg>
  )
}
