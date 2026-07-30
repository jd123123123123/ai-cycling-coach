import { useMemo } from 'react'

/**
 * RouteSketch — a ride's actual GPS track as a plain SVG line, no tiles.
 *
 * One implementation, three callers (history thumbnails, the routes page, the
 * crew card). It replaces HistoryTab's generative "intensity terrain" ridge,
 * which was seeded from a hash of the activity id and encoded nothing about the
 * ride it decorated.
 *
 * The projection is the one the three call sites already shared: normalise
 * lat/lng into the box, scale by the LARGER span so the geographic aspect
 * survives, and centre the smaller one. Latitude grows northward while SVG y
 * grows downward, so y is flipped — without that every route renders mirrored.
 *
 * The optional halo / endpoint dots / background exist because the three
 * callers genuinely looked different before this merge, and unifying the
 * projection is not a licence to restyle their surfaces.
 */
export default function RouteSketch({
  polyline,
  width,
  height,
  color,
  strokeWidth = 2,
  pad = 6,
  halo = false,
  endpoints = false,
  background,
  radius = 0,
  fluid = false,
  renderHeight,
  ariaLabel,
}: {
  polyline: [number, number][] | null
  /** Viewbox width. With `fluid`, also the aspect the SVG scales within. */
  width: number
  height: number
  color: string
  strokeWidth?: number
  pad?: number
  /** Wider translucent stroke behind the line, for busy backgrounds. */
  halo?: boolean
  /** Start (recovery-green) and finish (line colour) dots. */
  endpoints?: boolean
  /** Rounded backing rect drawn inside the SVG. */
  background?: string
  radius?: number
  /** Render at 100% width rather than a fixed pixel width. */
  fluid?: boolean
  /** CSS height when `fluid` — the viewBox keeps using `height`, so this
   *  scales the drawing rather than re-projecting it. */
  renderHeight?: number
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
    const scale = Math.min((width - pad * 2) / lngSpan, (height - pad * 2) / latSpan)
    const offX = (width - lngSpan * scale) / 2
    const offY = (height - latSpan * scale) / 2
    return polyline.map(
      (p) => [offX + (p[1] - minLng) * scale, offY + (maxLat - p[0]) * scale] as [number, number],
    )
  }, [polyline, width, height, pad])

  // Fewer than two points is not a route. Callers render their own neutral
  // mark rather than receive a line that means nothing.
  if (!pts) return null

  const path = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const [sx, sy] = pts[0]
  const [ex, ey] = pts[pts.length - 1]

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={fluid
        ? { width: '100%', height: renderHeight ?? height, display: 'block' }
        : { width, height, flexShrink: 0 }}
      preserveAspectRatio="xMidYMid meet"
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      {background && (
        <rect x="0" y="0" width={width} height={height} rx={radius} fill={background} />
      )}
      {halo && (
        <polyline
          points={path}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth * 2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      <polyline
        points={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {endpoints && (
        <>
          <circle cx={sx} cy={sy} r={strokeWidth * 1.7} fill="var(--color-paper)" stroke="var(--color-recovery)" strokeWidth={strokeWidth * 0.85} />
          <circle cx={ex} cy={ey} r={strokeWidth * 1.7} fill="var(--color-paper)" stroke={color} strokeWidth={strokeWidth * 0.85} />
        </>
      )}
    </svg>
  )
}
