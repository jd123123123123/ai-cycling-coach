import { useMemo } from 'react'
import type { RehearsalSegment } from '../../api/rehearsal'
import { downsampleIndices } from './profileMath'

/** Same cap as the profile — see `downsampleIndices`. */
const MAX_DRAWN_POINTS = 200

/**
 * WPrimeTrace — the matchbook, drawn.
 *
 * W′ is the rider's finite store of work above CP. It drains on every pitch
 * ridden harder than threshold and refills, slowly, whenever they back off. The
 * design doc called this "the draining matchbook … the thing no competitor can
 * render", and until now the surface showed it as a single percentage in a text
 * row that only appeared while a finger was down.
 *
 * As a shape it answers the question the number cannot: not "how much is left
 * here" but "how close to empty have I been, and did I ever get it back". A
 * trace that scrapes along the floor for 40 km before the final climb is a
 * different ride from one that empties once and recovers, even when both end at
 * the same percentage.
 *
 * It shares the parent's x-axis and cursor index with the profile and the map,
 * so the three read as one instrument rather than three charts of the same ride.
 *
 * Deliberately NOT rendered when `wPrimeJ` is null or the athlete has no fitted
 * W′: the simulator's cap branch never fires without one, so the series would be
 * flat zero — and a flat floor reads as "you are permanently empty", which is
 * the opposite of "we don't know your W′". The caller states the gap instead.
 */
export default function WPrimeTrace({
  segments,
  wPrimeJ,
  width,
  height,
  activeIdx = null,
  de,
}: {
  segments: RehearsalSegment[]
  wPrimeJ: number | null
  width: number
  height: number
  activeIdx?: number | null
  de: boolean
}) {
  const model = useMemo(() => {
    const n = segments.length
    if (n === 0 || !wPrimeJ || wPrimeJ <= 0) return null
    if (!segments.some((s) => s.w_bal_j != null)) return null

    // A reserve that never moves is not a matchbook -- it is the simulator
    // reporting that it had no fitted W' to spend, so its cap branch never
    // fired. Drawing that flat line under the words "your matchbook" claims a
    // measurement that does not exist, and it directly contradicts the
    // verdict block's own "no W' on file" note two cards above. Withhold the
    // verdict, keep the honest gap.
    const known = segments.map((s) => s.w_bal_j).filter((b): b is number => b != null)
    if (known.length > 1 && Math.max(...known) - Math.min(...known) < 1) return null

    const idxs = downsampleIndices(n, MAX_DRAWN_POINTS)
    const pad = 3
    // Fraction of W′ still available, clamped: the integrator can overshoot a
    // hair past full on a long descent, and a trace poking out of its own box
    // would read as a bug rather than as recovery.
    const fracAt = (i: number) => {
      const j = segments[Math.min(i, n - 1)]?.w_bal_j
      if (j == null) return null
      return Math.max(0, Math.min(1, j / wPrimeJ))
    }

    const xAt = (i: number) => (n <= 1 ? width / 2 : (i / (n - 1)) * width)
    const yAt = (f: number) => pad + (1 - f) * (height - pad * 2)

    const pts: [number, number][] = []
    for (const i of idxs) {
      const f = fracAt(i)
      if (f == null) continue
      pts.push([xAt(i), yAt(f)])
    }
    if (pts.length < 2) return null

    const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    const area = `${line} ${pts[pts.length - 1][0].toFixed(1)},${height} ${pts[0][0].toFixed(1)},${height}`

    // The low-water mark is the honest headline for this strip.
    let minFrac = 1
    for (let i = 0; i < n; i++) {
      const f = fracAt(i)
      if (f != null && f < minFrac) minFrac = f
    }

    const xForIndex = (i: number) => xAt(Math.min(Math.max(i, 0), n - 1))
    const yForIndex = (i: number) => {
      const f = fracAt(Math.min(Math.max(i, 0), n - 1))
      return f == null ? null : yAt(f)
    }

    return { line, area, minFrac, xForIndex, yForIndex }
  }, [segments, wPrimeJ, width, height])

  if (!model) return null

  // Colour states the VERDICT, not the metric. A full matchbook is the best
  // possible outcome, so it is calm green; only a genuinely emptied reserve
  // earns an alarm colour. The first version drew a healthy 100% trace in
  // --color-accent (coral) and the card read as a warning about a ride that
  // went perfectly — the exact inversion this app's colour rules exist to
  // prevent. Three steps, because "nearly empty" and "empty" are different
  // rides and the athlete acts differently on each.
  const stroke =
    model.minFrac <= 0.08
      ? 'var(--color-bad)'
      : model.minFrac <= 0.30
        ? 'var(--color-caution)'
        : 'var(--color-good)'
  // A full reserve fills the whole box, so the area has to stay faint or the
  // card becomes one solid slab of colour. It deepens as the reserve empties,
  // which is the moment worth looking at.
  const fillOpacity = model.minFrac <= 0.30 ? 0.2 : 0.1
  const activeY = activeIdx != null ? model.yForIndex(activeIdx) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span
          className="eyebrow"
          style={{ fontSize: 10, letterSpacing: '0.16em', fontWeight: 700, color: 'var(--color-ink-2)' }}
        >
          {de ? 'W′ — DEIN STRECKHOLZBRIEF' : "W′ — YOUR MATCHBOOK"}
        </span>
        <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
          {de
            ? `tiefster Stand ${Math.round(model.minFrac * 100)} %`
            : `lowest ${Math.round(model.minFrac * 100)}%`}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width, height, display: 'block' }}
        role="img"
        aria-label={
          de
            ? `W′-Verlauf über die Strecke, tiefster Stand ${Math.round(model.minFrac * 100)} Prozent`
            : `W′ balance across the route, lowest point ${Math.round(model.minFrac * 100)} percent`
        }
      >
        <polygon points={model.area} fill={stroke} opacity={fillOpacity} stroke="none" />
        <polyline
          points={model.line}
          fill="none"
          stroke={stroke}
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {activeIdx != null && activeY != null && (
          <g>
            <line
              x1={model.xForIndex(activeIdx)}
              y1={0}
              x2={model.xForIndex(activeIdx)}
              y2={height}
              stroke="var(--color-ink)"
              strokeWidth={1}
              opacity={0.5}
            />
            <circle
              cx={model.xForIndex(activeIdx)}
              cy={activeY}
              r={3.5}
              fill="var(--color-ink)"
              stroke="var(--color-surface)"
              strokeWidth={1.5}
            />
          </g>
        )}
      </svg>
    </div>
  )
}
