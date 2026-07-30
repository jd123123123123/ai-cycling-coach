import { useMemo } from 'react'
import type { RehearsalSegment } from '../../api/rehearsal'
import { downsampleIndices, zoneColorForGradient } from './profileMath'

/** Cap on the points actually drawn — see `downsampleIndices` for why. */
const MAX_DRAWN_POINTS = 200

/**
 * RehearsalProfile — the scrubbable elevation silhouette for a route
 * rehearsal. Sibling of `RouteSketch`: same "normalise into the box" idea,
 * but 1D (distance progress → x, elevation → y) rather than lat/lng, and
 * filled per-band instead of a bare line, because the gradient IS the story
 * here — it's what the backend paces power against.
 *
 * The API can hand back ~1300 segments for a long alpine route. Drawing
 * every one of them buys nothing visually (a screen is a few hundred
 * pixels wide) and costs real paint time at 390×844, so this downsamples
 * for drawing only. The pointer handler maps x straight back to the TRUE
 * segment index — same reasoning as `HoverBars` using pointer events for
 * touch — so the scrub readout (Task 11) always shows a real measurement,
 * never a value interpolated from a thinned-out point.
 */
export default function RehearsalProfile({
  segments,
  elevations,
  width,
  height,
  onScrub,
}: {
  segments: RehearsalSegment[]
  elevations: number[]
  width: number
  height: number
  onScrub: (index: number | null) => void
}) {
  const pad = 6

  const bands = useMemo(() => {
    const n = segments.length
    if (n === 0) return null

    const idxs = downsampleIndices(n, MAX_DRAWN_POINTS)
    const elevAt = (i: number) => elevations[Math.min(i, elevations.length - 1)] ?? 0

    const elevs = idxs.map(elevAt)
    const minElev = Math.min(...elevs)
    const maxElev = Math.max(...elevs)
    const span = maxElev - minElev || 1e-6

    const xAt = (i: number) => (n <= 1 ? width / 2 : (i / (n - 1)) * width)
    const yAt = (elev: number) =>
      pad + (1 - (elev - minElev) / span) * (height - pad * 2)

    const points = idxs.map((i) => [xAt(i), yAt(elevAt(i))] as [number, number])
    const outline = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

    const fills = idxs.slice(0, -1).map((i, k) => {
      const [x0, y0] = points[k]
      const [x1, y1] = points[k + 1]
      const color = zoneColorForGradient(segments[i].gradient_pct)
      const poly = `${x0.toFixed(1)},${y0.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${height} ${x0.toFixed(1)},${height}`
      return { key: i, poly, color }
    })

    return { outline, fills }
  }, [segments, elevations, width, height, pad])

  if (!bands) return null

  const n = segments.length

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0
    const clamped = Math.min(1, Math.max(0, frac))
    const idx = Math.min(n - 1, Math.max(0, Math.floor(clamped * n)))
    onScrub(idx)
  }

  const handlePointerLeave = () => {
    onScrub(null)
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width, height, display: 'block', touchAction: 'none' }}
      aria-hidden="true"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {bands.fills.map(({ key, poly, color }) => (
        <polygon key={key} points={poly} fill={color} opacity={0.55} stroke="none" />
      ))}
      <polyline
        points={bands.outline}
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
