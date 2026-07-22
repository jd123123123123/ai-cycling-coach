import { useMemo } from 'react'

/**
 * RouteMini — a compact, self-contained SVG route line for a crew event's
 * uploaded GPX tour. Adapted from debrief/RouteMap.tsx's projection (equal
 * geographic aspect ratio, padded, start/finish dots) but drawn as a single
 * accent-coloured stroke — the crew card wants the shape of the route, not a
 * per-power heat map. Takes the `[[lat, lng], …]` polyline the backend caches
 * on the event. No tiles, no network.
 */

const VIEW_W = 300
const VIEW_H = 150
const PAD = 12

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
  const pts = useMemo(() => {
    if (!polyline || polyline.length < 2) return null
    const lats = polyline.map((p) => p[0])
    const lngs = polyline.map((p) => p[1])
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)
    const latSpan = maxLat - minLat || 1e-6
    const lngSpan = maxLng - minLng || 1e-6
    const scale = Math.min((VIEW_W - PAD * 2) / lngSpan, (VIEW_H - PAD * 2) / latSpan)
    const offX = (VIEW_W - lngSpan * scale) / 2
    const offY = (VIEW_H - latSpan * scale) / 2
    return polyline.map(
      (p) => [offX + (p[1] - minLng) * scale, offY + (maxLat - p[0]) * scale] as [number, number],
    )
  }, [polyline])

  if (!pts) return null
  const [sx, sy] = pts[0]
  const [ex, ey] = pts[pts.length - 1]
  const path = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      style={{ width: '100%', height, display: 'block' }}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel ?? 'Route'}
    >
      <polyline
        points={path}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <polyline
        points={path}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={sx} cy={sy} r={5} fill="var(--color-paper)" stroke="var(--color-recovery)" strokeWidth={2.5} />
      <circle cx={ex} cy={ey} r={5} fill="var(--color-paper)" stroke={color} strokeWidth={2.5} />
    </svg>
  )
}
