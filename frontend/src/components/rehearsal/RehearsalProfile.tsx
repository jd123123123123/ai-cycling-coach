import { useMemo } from 'react'
import type { RehearsalSegment } from '../../api/rehearsal'
import {
  CLIMB_FILL_OPACITY,
  downsampleIndices,
  TERRAIN_FILL,
  TERRAIN_OPACITY,
  zoneColorForGradient,
} from './profileMath'

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
 *
 * The whole route is always drawn as one continuous terrain shape in a
 * neutral fill (`TERRAIN_FILL`) first, then climbing spans are tinted on
 * top by gradient band. "Climbing" is decided by `climb_id` (non-null
 * inside a detected climb), not a raw gradient threshold: a segment's
 * `climb_id` already reflects the backend's real climb detection (min gain
 * + min distance, not just "gradient > x"), so gating on it means a brief
 * flat or slight dip *inside* a climb still gets a zone tint instead of
 * silently falling out to the neutral base, while short ordinary rollers
 * that never form a real climb correctly stay part of the plain terrain.
 * `gradient_pct` still drives WHICH band a climbing segment gets — see
 * `zoneColorForGradient`. This also means the earlier bug (flats/descents
 * painted invisible because `--color-zone-1` == the card background) can't
 * recur: non-climbing segments never touch a zone colour at all any more.
 *
 * On top of the terrain it draws the two things the engine already computes
 * and the surface used to hide in a text row:
 *  • the TARGET WATTS as a line on its own scale, so the shape of the effort
 *    is visible against the shape of the road. They are not the same curve —
 *    power is capped on the steepest pitches and the gap between them is
 *    exactly what pacing means.
 *  • the BLOW-UP as a marker on the road where it happens, rather than only a
 *    sentence in the verdict. A rider should be able to point at it.
 *
 * `activeIdx` is controlled by the parent so one index drives the profile, the
 * map and the readout together — including during playback, when nothing is
 * touching the screen at all.
 */
export default function RehearsalProfile({
  segments,
  elevations,
  width,
  height,
  onScrub,
  activeIdx = null,
  blowUpIdxs = [],
  showPower = true,
}: {
  segments: RehearsalSegment[]
  elevations: number[]
  width: number
  height: number
  onScrub: (index: number | null) => void
  /** Cursor position, shared with the map. Null draws no cursor. */
  activeIdx?: number | null
  /** Segment indices where the simulator recorded a blow-up. */
  blowUpIdxs?: number[]
  showPower?: boolean
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

    // The full silhouette closed down to the baseline — always drawn, so
    // the terrain never has a gap regardless of gradient or climb status.
    const firstX = points[0][0].toFixed(1)
    const lastX = points[points.length - 1][0].toFixed(1)
    const terrain = `${outline} ${lastX},${height} ${firstX},${height}`

    // Climb tints layer on top of the terrain — only drawn where a segment
    // is actually inside a detected climb (`climb_id != null`); everywhere
    // else the neutral terrain fill alone carries the shape.
    const climbFills = idxs.slice(0, -1).flatMap((i, k) => {
      if (segments[i].climb_id == null) return []
      const [x0, y0] = points[k]
      const [x1, y1] = points[k + 1]
      const color = zoneColorForGradient(segments[i].gradient_pct)
      const poly = `${x0.toFixed(1)},${y0.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${height} ${x0.toFixed(1)},${height}`
      return [{ key: i, poly, color }]
    })

    // Target watts on their own scale. Anchored at zero so the line's height
    // reads as "how hard", not "how hard relative to the easiest bit" — a
    // min-anchored axis would make a flat 180 W ride look like an alpine one.
    // Confined to the lower two-thirds of the box so it never tangles with the
    // ridgeline, which is the shape that has to stay readable.
    const powers = idxs.map((i) => segments[i]?.power_w ?? null)
    const maxPower = powers.reduce<number>((m, p) => (p != null && p > m ? p : m), 0)
    const powerLine =
      maxPower > 0
        ? powers
            .map((p, k) => {
              if (p == null) return null
              const y = height - pad - (p / maxPower) * (height - pad * 2) * 0.66
              return `${points[k][0].toFixed(1)},${y.toFixed(1)}`
            })
            // A null power mid-route would otherwise join two distant points
            // with a straight line that claims watts nobody predicted.
            .filter((s): s is string => s != null)
            .join(' ')
        : null

    const xForIndex = (i: number) => xAt(Math.min(Math.max(i, 0), n - 1))
    const yForIndex = (i: number) => yAt(elevAt(Math.min(Math.max(i, 0), n - 1)))

    return { outline, terrain, climbFills, powerLine, maxPower, xForIndex, yForIndex }
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
      <polygon points={bands.terrain} fill={TERRAIN_FILL} opacity={TERRAIN_OPACITY} stroke="none" />
      {bands.climbFills.map(({ key, poly, color }) => (
        <polygon key={key} points={poly} fill={color} opacity={CLIMB_FILL_OPACITY} stroke="none" />
      ))}
      <polyline
        points={bands.outline}
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {showPower && bands.powerLine && (
        <polyline
          points={bands.powerLine}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.9}
        />
      )}

      {/* Where the rider runs out of W′. Drawn under the cursor so scrubbing
          onto it does not hide it. */}
      {blowUpIdxs.map((i) => (
        <g key={`blowup-${i}`}>
          <line
            x1={bands.xForIndex(i)}
            y1={0}
            x2={bands.xForIndex(i)}
            y2={height}
            stroke="var(--color-strain)"
            strokeWidth={1.25}
            strokeDasharray="3 3"
            opacity={0.85}
          />
          <circle
            cx={bands.xForIndex(i)}
            cy={bands.yForIndex(i)}
            r={4.5}
            fill="var(--color-strain)"
            stroke="var(--color-surface)"
            strokeWidth={1.5}
          />
        </g>
      ))}

      {activeIdx != null && (
        <g>
          <line
            x1={bands.xForIndex(activeIdx)}
            y1={0}
            x2={bands.xForIndex(activeIdx)}
            y2={height}
            stroke="var(--color-ink)"
            strokeWidth={1}
            opacity={0.5}
          />
          <circle
            cx={bands.xForIndex(activeIdx)}
            cy={bands.yForIndex(activeIdx)}
            r={4}
            fill="var(--color-ink)"
            stroke="var(--color-surface)"
            strokeWidth={1.5}
          />
        </g>
      )}
    </svg>
  )
}
