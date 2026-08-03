import { useId, useMemo } from 'react'
import { useReducedMotion } from 'motion/react'
import {
  SKY_STOPS,
  fractalDetail,
  noiseRidge,
  normalize,
  resample,
  ridgePath,
  seedFrom,
  skyPhase,
} from './sceneMath'

/**
 * Scene — the illustration engine.
 *
 * ── The governing rule ───────────────────────────────────────────────────
 * A Scene draws real data or it draws nothing. It never invents a shape to
 * fill space. This is the same discipline the rest of the app already applies
 * to numbers (the stale-wearable rule, the honest "—", the W′ trace that
 * refuses to draw a reserve that never moved): an illustration that implies a
 * measurement the athlete never took is a fabricated number wearing a nicer
 * coat. When there is no data, `Scene` renders null and the surface above it
 * states the gap in words.
 *
 * The one exception is deliberately bounded: the FAR haze ridge behind a real
 * terrain is seeded noise, because it represents distance and atmosphere, not
 * a measurement. It only ever appears BEHIND a real profile — never alone, and
 * never where a rider could read it as their route.
 *
 * ── Why it must not look like a chart ────────────────────────────────────
 * A resampled elevation profile is smooth, and smooth data drawn plainly is a
 * triangle — a chart with the axes taken off. The layering here (far haze, mid
 * ridge, near ridge with fractal detail, atmospheric fade, sun) is what makes
 * the same numbers read as a landscape. The data is untouched; only its
 * presentation is dramatised.
 *
 * ── Determinism ──────────────────────────────────────────────────────────
 * Any randomness is seeded from `seed` (athlete + date at the call site), so a
 * scene is stable across re-renders and reloads. A landscape that reshuffles
 * while you scroll reads as a bug.
 *
 * ── Budget ───────────────────────────────────────────────────────────────
 * One Scene per screen. These are full-bleed backdrops; two on one screen
 * compete for the same attention and the same frame budget.
 */

const POINTS = 96 // resample width — smooth at phone width, cheap to path
const VB_W = 400 // viewBox width; a real aspect ratio keeps curves from shearing

export type SceneKind = 'sky' | 'terrain' | 'field'

export interface SceneProps {
  kind: SceneKind
  /**
   * The series a `terrain` scene draws — elevation, or daily load across a
   * week. Ignored by `sky`. Empty or absent means no scene.
   */
  values?: readonly number[]
  /**
   * Zone fractions for a `field` scene, in zone order. Each entry is a share of
   * the ride; they need not sum to exactly 1 (rounding), and are drawn
   * proportionally.
   */
  zones?: readonly number[]
  /** 0..1 readiness, tints a `sky`. Absent means an untinted sky. */
  readiness?: number | null
  /** Hour of day 0..23. Defaults to now. Drives sky palette and sun height. */
  hour?: number
  /** Stability seed — pass something like `${athleteId}:${isoDate}`. */
  seed?: string
  /** Full-bleed height. Defaults to a hero-sized band. */
  height?: number
  className?: string
}

export default function Scene({
  kind,
  values,
  zones,
  readiness,
  hour,
  seed = 'scene',
  height = 260,
  className,
}: SceneProps) {
  const uid = useId()
  const reduced = useReducedMotion()
  const h = hour ?? new Date().getHours()
  const phase = skyPhase(h)

  const model = useMemo(() => {
    const s = seedFrom(seed)

    if (kind === 'terrain') {
      const src = values ?? []
      // Honest gap: no series, no landscape.
      if (src.length === 0) return null
      const base = normalize(resample(src, POINTS))
      // The rider's actual profile, textured so it reads as rock rather than
      // as a plotted line. Renormalised so texture cannot push it out of frame.
      // Detail is applied AFTER the vertical fit, not before: renormalising a
      // textured ridge rescales the texture back out of visibility, which is
      // what made the first render look like a smooth triangle.
      const near = fractalDetail(base.map((v) => 0.12 + v * 0.72), s, 0.16)
      // A mid ridge echoing the real shape, flattened — depth, same terrain.
      const mid = base.map((v) => 0.1 + v * 0.42)
      // Far haze: pure atmosphere, never mistakable for the route.
      const far = noiseRidge(POINTS, s ^ 0x9e3779b9, 0.3, 0.07)
      return { kind: 'terrain' as const, near, mid, far }
    }

    if (kind === 'field') {
      const src = (zones ?? []).filter((z) => z > 0)
      if (src.length === 0) return null
      const total = src.reduce((a, b) => a + b, 0)
      if (total <= 0) return null
      // Each zone becomes a rolling hill whose HEIGHT is its share, stacked
      // back to front. Bands would have been a stacked bar chart; hills carry
      // the same proportions and read as ground.
      let acc = 0
      const hills = src.map((z, i) => {
        const share = z / total
        acc += share
        const crest = 0.16 + acc * 0.7
        return {
          zone: Math.min(7, i + 1),
          ridge: noiseRidge(POINTS, seedFrom(`${seed}:z${i}`), crest, 0.045),
        }
      })
      // Front-most hill drawn last, so reverse for painter's order.
      return { kind: 'field' as const, hills: hills.reverse() }
    }

    return { kind: 'sky' as const }
  }, [kind, values, zones, seed])

  if (!model) return null

  const skyFrom = SKY_STOPS[phase].from
  const skyTo = SKY_STOPS[phase].to
  // Sun rides low at dawn/dusk and high at midday — the same clock the athlete
  // is living in, so a 6am ride and a 2pm ride do not get the same picture.
  const sunY = phase === 'day' ? 0.2 : phase === 'night' ? 0.14 : 0.36
  const ready = readiness == null ? null : Math.max(0, Math.min(1, readiness))

  return (
    <svg
      className={className}
      width="100%"
      height={height}
      viewBox={`0 0 ${VB_W} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={skyFrom} />
          <stop offset="100%" stopColor={skyTo} />
        </linearGradient>
        {/* The warm bloom. Deliberately NOT the .pen's dim sonar aura — this
            surface was signed off as a sunrise, and readiness scales it so a
            good morning is visibly a brighter one. */}
        <radialGradient id={`${uid}-bloom`} cx="50%" cy={`${sunY * 100}%`} r="55%">
          <stop offset="0%" stopColor="var(--color-gold)" stopOpacity={0.32} />
          <stop offset="60%" stopColor="var(--color-gold)" stopOpacity={0.08} />
          <stop offset="100%" stopColor="var(--color-gold)" stopOpacity={0} />
        </radialGradient>
        {/* Atmospheric perspective: distant ranges wash toward the sky colour. */}
        <linearGradient id={`${uid}-haze`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={skyTo} stopOpacity={0.55} />
          <stop offset="100%" stopColor={skyTo} stopOpacity={0} />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width={VB_W} height={height} fill={`url(#${uid}-sky)`} />

      {(model.kind === 'sky' || model.kind === 'terrain') && ready != null && (
        <>
          <rect
            x="0"
            y="0"
            width={VB_W}
            height={height}
            fill={`url(#${uid}-bloom)`}
            // Floored, so even a rough morning still gets a sunrise.
            opacity={0.3 + ready * 0.7}
            style={reduced ? undefined : { transition: 'opacity 900ms cubic-bezier(.22,1,.36,1)' }}
          />
          <circle
            cx={VB_W / 2}
            cy={sunY * height}
            r={Math.max(8, height * 0.045)}
            fill="var(--color-gold)"
            opacity={0.25 + ready * 0.5}
          />
        </>
      )}

      {model.kind === 'terrain' && (
        <>
          <path d={ridgePath(model.far, VB_W, height)} fill="var(--color-surface-3)" opacity={0.5} />
          <path d={ridgePath(model.mid, VB_W, height)} fill="var(--color-surface-2)" opacity={0.85} />
          {/* Haze sits between the far ranges and the near one — that overlap
              is what actually creates the sense of distance. */}
          <rect x="0" y="0" width={VB_W} height={height} fill={`url(#${uid}-haze)`} />
          <path d={ridgePath(model.near, VB_W, height)} fill="var(--color-forest-2)" opacity={0.5} />
          <path
            d={ridgePath(model.near, VB_W, height)}
            fill="none"
            stroke="var(--color-forest)"
            strokeWidth={1.25}
            vectorEffect="non-scaling-stroke"
            opacity={0.85}
          />
        </>
      )}

      {model.kind === 'field' &&
        model.hills.map((hill) => (
          <path
            key={hill.zone}
            d={ridgePath(hill.ridge, VB_W, height)}
            fill={`var(--color-zone-${hill.zone})`}
            opacity={0.45}
          />
        ))}
    </svg>
  )
}
