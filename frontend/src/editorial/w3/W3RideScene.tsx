import { useCallback, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { T } from './w3tokens'
import { TNUM } from './w3surfaces'
import { projectRouteShape } from './w3routeShape'

/**
 * W3 · THE RIDE SCENE — the picture at the top of a feed post.
 *
 * ── WHAT WAS WRONG ───────────────────────────────────────────────────────
 *
 * Two things, and the second was worse.
 *
 * A GPS ride drew its track as a bare 2.6px polyline on a flat plate. On a
 * route that happens to run diagonally — a point-to-point, which is most of
 * them — that reads as an ASCENDING LINE CHART, and a rider looking at a feed
 * sees a graph of something rather than a place they went. Nothing said which
 * end was the start, so the one piece of information the shape does carry was
 * missing too.
 *
 * A ride with no GPS — every indoor session, which for a lot of riders is half
 * the winter — drew one number, 44px, centred in an otherwise empty 210px
 * plate. It was the biggest object in the feed and it said the least.
 *
 * ── WHAT IT DOES NOW, AND WHAT IT REFUSES TO ─────────────────────────────
 *
 * The payload carries `[[lat, lng], …]` and no elevation, plus the ride's
 * totals. So there is NO elevation profile here and no power curve: drawing
 * either would mean inventing a series, and this app's rule is real data or
 * the thing does not render. What is real is the SHAPE, its DIRECTION, and
 * for a trainer ride the ride's own magnitudes.
 *
 * `RouteScene` draws the track as a route: a gradient along its own length so
 * start and finish are legible, a hollow start marker, a filled finish, and a
 * ground that glows under the track rather than behind a rectangle.
 *
 * `EffortScene` gives an indoor ride a real object instead of dead space — an
 * arc whose sweep IS the duration against an hour, carrying the ride's own
 * headline number. One arc, one number, both true.
 *
 * ── AND IT ANSWERS WHEN ASKED ────────────────────────────────────────────
 *
 * Dragging along a route moves a marker and reads out the distance at that
 * point. That number is honest but approximate — it is the fraction of the
 * PATH LENGTH travelled, scaled by the ride's real total, which is exact only
 * for a route sampled evenly. It is labelled as a position on the route, not
 * as a split, because the payload cannot support a split.
 */

export interface RideSceneRide {
  /** Optional as well as nullable: the wire type leaves it off entirely for a
   *  ride imported without a track, and widening here beats a cast at the
   *  call site. */
  route?: [number, number][] | null
  distance_m: number
  elevation_gain_m: number
  duration_seconds: number
  avg_power_w: number | null
  tss: number | null
}

const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })
const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 })

/** Cumulative length along the projected path, so a scrub can be positioned. */
function cumulative(pts: [number, number][]): number[] {
  const out = [0]
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0]
    const dy = pts[i][1] - pts[i - 1][1]
    out.push(out[i - 1] + Math.hypot(dx, dy))
  }
  return out
}

// ── the route ───────────────────────────────────────────────────────────────

export function RouteScene({ ride, w, h, tint, onScrub }: {
  ride: RideSceneRide
  w: number
  h: number
  tint: string
  /** Told when the rider is holding the track, so the caller can hide the
   *  stat scrim rather than let the readout land on top of it. */
  onScrub?: (holding: boolean) => void
}) {
  const reduce = useReducedMotion()
  const svg = useRef<SVGSVGElement | null>(null)
  const [at, setAt] = useState<number | null>(null)

  const shape = useMemo(() => projectRouteShape(ride.route, w, h, 16), [ride.route, w, h])
  const cum = useMemo(() => (shape ? cumulative(shape.pts) : []), [shape])
  const total = cum.length ? cum[cum.length - 1] : 0

  // Where the marker sits, and what it is worth in kilometres.
  const marker = useMemo(() => {
    if (!shape || at == null || total <= 0) return null
    const want = at * total
    let i = 1
    while (i < cum.length && cum[i] < want) i++
    const a = shape.pts[i - 1], b = shape.pts[i] ?? shape.pts[i - 1]
    const span = cum[i] - cum[i - 1] || 1
    const f = Math.max(0, Math.min(1, (want - cum[i - 1]) / span))
    return {
      x: a[0] + (b[0] - a[0]) * f,
      y: a[1] + (b[1] - a[1]) * f,
      km: (ride.distance_m / 1000) * at,
    }
  }, [shape, cum, total, at, ride.distance_m])

  const track = useCallback((clientX: number) => {
    const el = svg.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setAt(Math.max(0, Math.min(1, (clientX - r.left) / r.width)))
  }, [])

  const release = useCallback(() => { setAt(null); onScrub?.(false) }, [onScrub])

  if (!shape) return null
  const gid = `rs-${Math.round(w)}-${shape.pts.length}`
  // Within a marker's own diameter of each other is the same place.
  const a0 = shape.pts[0], aN = shape.pts[shape.pts.length - 1]
  const loop = Math.hypot(aN[0] - a0[0], aN[1] - a0[1]) < 14

  return (
    <svg
      ref={svg}
      width="100%" height={h} viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Streckenverlauf, ${nf1.format(ride.distance_m / 1000)} Kilometer`}
      // `userSelect` is not polish: dragging across the plate selected the
      // readout's own <text>, so scrubbing painted a browser selection
      // highlight over the number it was producing.
      style={{ display: 'block', touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none' }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onScrub?.(true); track(e.clientX) }}
      onPointerMove={(e) => { if (at != null) track(e.clientX) }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
    >
      <defs>
        {/* ALONG THE TRACK, NOT ACROSS THE BOX. The gradient runs start-to-end
            in the path's own bounding box, so the fade reads as progress
            through the ride rather than as a light source on the card. */}
        <linearGradient id={gid} gradientUnits="userSpaceOnUse"
          x1={shape.pts[0][0]} y1={shape.pts[0][1]}
          x2={shape.pts[shape.pts.length - 1][0]} y2={shape.pts[shape.pts.length - 1][1]}>
          {/* The spread has to be WIDE to survive the glow underneath. At
              0.35→1 the bloom washed the fade out entirely and the track read
              as one uniform tube, which threw away the direction the gradient
              exists to carry. */}
          <stop offset="0%" stopColor={tint} stopOpacity={0.18} />
          <stop offset="100%" stopColor={tint} stopOpacity={1} />
        </linearGradient>
        <filter id={`${gid}-glow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* The ground the track lies on — light under the route itself, so the
          plate is not a rectangle with a squiggle floating on it.

          HALVED FROM THE FIRST DRAW. At 0.28 over a 16px stroke it stopped
          being a ground and became a neon tube: bright enough to read as the
          subject rather than the light, and bright enough to flatten the
          gradient running along the track. */}
      <g filter={`url(#${gid}-glow)`} opacity={0.15}>
        <path d={shape.d} fill="none" stroke={tint} strokeWidth={12}
          strokeLinecap="round" strokeLinejoin="round" />
      </g>

      <path d={shape.d} fill="none" stroke={`${tint}22`} strokeWidth={9}
        strokeLinecap="round" strokeLinejoin="round" />
      <motion.path
        d={shape.d} fill="none" stroke={`url(#${gid})`} strokeWidth={3}
        strokeLinecap="round" strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: 'easeOut' }} />

      {/* START hollow, FINISH filled — which way it went is information the
          shape already contains and the old draw threw away.

          UNLESS IT IS A LOOP, and most rides are. Then the two coincide and
          drawing both stacks a hollow ring under a filled dot, so the card
          shows one marker that happens to look like the finish. A loop gets a
          single ring-with-centre that means both. */}
      {loop ? (
        <g>
          <circle cx={shape.pts[0][0]} cy={shape.pts[0][1]} r={6.5}
            fill={T.bg} stroke={tint} strokeWidth={2.5} />
          <circle cx={shape.pts[0][0]} cy={shape.pts[0][1]} r={2.5} fill={tint} />
        </g>
      ) : (
        <g>
          <circle cx={shape.pts[0][0]} cy={shape.pts[0][1]} r={5}
            fill={T.bg} stroke={tint} strokeWidth={2.5} />
          <circle cx={shape.pts[shape.pts.length - 1][0]} cy={shape.pts[shape.pts.length - 1][1]} r={5}
            fill={tint} />
        </g>
      )}

      {marker && (
        <g>
          <line x1={marker.x} y1={0} x2={marker.x} y2={h}
            stroke={`${T.ink}1F`} strokeWidth={1} />
          <circle cx={marker.x} cy={marker.y} r={9} fill={`${tint}33`} />
          <circle cx={marker.x} cy={marker.y} r={4.5} fill={T.ink} />
          <text
            x={Math.max(34, Math.min(w - 34, marker.x))} y={18}
            textAnchor="middle" fill={T.ink}
            style={{ ...TNUM, fontSize: 12, fontWeight: 700 }}
          >{nf1.format(marker.km)} km</text>
        </g>
      )}
    </svg>
  )
}

// ── the trainer ride ────────────────────────────────────────────────────────

/**
 * TWO HOURS IS THE RULER, not one.
 *
 * At an hour, a 60-minute session and a 70-minute one both drew a closed
 * circle — the arc carried no information across exactly the range most
 * trainer rides sit in. Two hours puts an ordinary session near half and
 * leaves somewhere for a long one to go.
 */
const RULER = 7200

/**
 * The trainer ride's scene.
 *
 * IT CARRIES NO TEXT. The first version centred the ride's headline inside the
 * ring and repeated its minutes and TSS underneath — so the card said the same
 * numbers three times, in three sizes, while the route cards beside it said
 * theirs once. The scene is the texture; the headline and the working belong
 * to the card, in the same places they sit on every other post.
 *
 * The ring is drawn large and low, bleeding past the plate, for the same
 * reason the route now fills its frame: a small centred object in a tall
 * rectangle is mostly empty rectangle.
 */
export function EffortScene({ ride, w, h, tint }: {
  ride: RideSceneRide
  w: number
  h: number
  tint: string
}) {
  const reduce = useReducedMotion()
  // CONTAINED, NOT BLED. Pushed off the plate at 0.44 the ring stopped being
  // a gauge and became a large grey circle with a violet fragment on its rim —
  // the unfilled track read as the subject. A gauge has to be seen whole for
  // the sweep to mean anything.
  const cx = w / 2, cy = h * 0.56
  const r = Math.min(w, h) * 0.27
  const frac = Math.max(0.04, Math.min(1, ride.duration_seconds / RULER))
  const C = 2 * Math.PI * r

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Einheit ohne Streckenaufzeichnung, ${nf0.format(Math.round(ride.duration_seconds / 60))} Minuten`}
      style={{ display: 'block' }}>
      <defs>
        <filter id="es-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* the rest of the two hours */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={`${T.ink}14`} strokeWidth={9} />

      {/* THE SWEEP IS THE DURATION — not a progress bar toward a goal nobody
          set. Two hours is simply the ruler, and a long session closes it. */}
      <g filter="url(#es-glow)" opacity={0.9}>
        <motion.circle
          cx={cx} cy={cy} r={r} fill="none" stroke={tint} strokeWidth={9}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          strokeDasharray={C}
          initial={reduce ? false : { strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - frac) }}
          transition={{ duration: 1.0, ease: 'easeOut' }} />
      </g>
    </svg>
  )
}
