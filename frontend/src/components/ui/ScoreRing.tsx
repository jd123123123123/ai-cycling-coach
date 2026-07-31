import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { prefersReducedMotion } from '../../utils/motion'

/**
 * ScoreRing — the readiness dial.
 *
 * ── Why it is not a donut ─────────────────────────────────────────────────
 * It used to be one: a track circle with an arc drawn over it. That reads as a
 * loading bar bent into a circle, and it aged badly — a flat band of colour
 * with nothing to look at and nothing to wait for.
 *
 * This is an INSTRUMENT instead. Sixty segments around a dial, the way a bike
 * computer or a tachometer marks its sweep, because that is the object this
 * app's user already trusts to tell them a number about their body. The
 * metaphor is native to the product rather than borrowed from a progress bar.
 *
 * Three things make it feel alive rather than drawn:
 *
 *  • IGNITION. On mount the dial fills from zero on a spring, and each segment
 *    lights as the sweep reaches it. The eye follows the edge, which is what
 *    makes a number worth waiting half a second for instead of just reading.
 *  • THE HEAD. A bright dot rides the leading edge with a bloom behind it, so
 *    the dial has a "now" — a place where the value actually is.
 *  • BREATH. The bloom pulses slowly and forever. A static glow is décor; one
 *    that moves makes the screen feel like it is still measuring something.
 *
 * Colour runs ANGULARLY across the lit segments, sampled per segment from the
 * caller's stops, so a high score sweeps through the whole ramp rather than
 * ending on one flat hue. Unlit segments keep a trace of the same colour
 * instead of going grey, which is what stops the dial looking half-broken at
 * low scores — the ring is always whole, the light is what changes.
 *
 * Props are unchanged from the previous flat/gradient implementation, so both
 * call sites (TodayTab's hero, RecoveryTab's hero) keep working: pass `color`
 * alone for a single hue, or `gradient` for the angular ramp.
 *
 * Honours prefers-reduced-motion: no ignition, no breath, no head bloom pulse
 * — the dial simply arrives at its value. WCAG 2.3.3.
 */

/** Segment count. 60 is a clock face and a tachometer, and at 224 px each
 *  segment is still ~4 px wide — fine enough to read as a ring, coarse enough
 *  that you can see individual lights come on. */
const SEGMENTS = 60

/** How long the ignition sweep takes, in ms. Long enough to watch, short
 *  enough that a returning user never waits for their number. */
const IGNITION_MS = 1100

/** Unlit segments are NEUTRAL, not a dimmed copy of the score colour. Tinting
 *  them turned a low score's dial brown-red — it read as broken rather than as
 *  "not reached yet", and it muddied the one thing the ring has to make
 *  obvious: where the light stops. */
const DIM_COLOR = '#FFFFFF'
const DIM_ALPHA = 0.085

export default function ScoreRing({
  score,
  color,
  gradient,
  glow,
  size = 120,
  stroke,
  children,
}: {
  score: number
  color: string
  /** 2–3 stops sampled across the lit arc. Without it the dial is one hue. */
  gradient?: string[]
  /** Bloom colour. Defaults to the first stop / `color`. */
  glow?: string
  size?: number
  stroke?: number
  /** Accepted and ignored: the old donut took a track colour, the dial draws
   *  its own neutral unlit segments. Kept in the type so the two existing call
   *  sites need no edit, and so a future one cannot silently expect it to
   *  work. */
  trackColor?: string
  /** Either fixed content, or a function of the SWEPT value — which is how
   *  the score itself rolls up in time with the dial instead of sitting
   *  finished above a ring that is still filling. */
  children?: ReactNode | ((swept: number) => ReactNode)
}) {
  // The app's own helper, not motion/react's hook: that one installs its
  // media listener once at module load, so it answers for whatever the
  // environment was when the bundle evaluated. This reads the query at mount,
  // which is what an accessibility setting deserves.
  const [reduce] = useState(prefersReducedMotion)
  const sw = stroke ?? Math.round(size * 0.085)
  const target = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0))

  // The swept value. Driven by rAF rather than a spring on a motion value
  // because sixty segments change class together — one state update per frame
  // is cheaper than sixty subscribed motion components.
  const [swept, setSwept] = useState(reduce ? target : 0)
  // Where the sweep currently sits, so a score UPDATE animates from the value
  // on screen rather than re-igniting from zero. Without this, a readiness
  // refresh from 78 to 79 replays the whole intro.
  const sweptRef = useRef(swept)
  // Written in an effect, not during render: React may render speculatively,
  // and a ref mutated on that path can record a frame that never committed.
  useEffect(() => {
    sweptRef.current = swept
  }, [swept])

  useEffect(() => {
    // Reduced motion never animates, so there is nothing to drive and no
    // state to set — the value is read straight from `target` below.
    if (reduce) return
    let raf = 0
    let start: number | null = null
    const from = sweptRef.current
    const step = (t: number) => {
      if (start == null) start = t
      const p = Math.min(1, (t - start) / IGNITION_MS)
      // Decelerating ease with a whisper of overshoot at the end, so the head
      // settles onto the value instead of stopping dead on it.
      const eased = 1 - Math.pow(1 - p, 3)
      const overshoot = p < 1 ? Math.sin(p * Math.PI) * 0.012 : 0
      setSwept(Math.max(0, (from + (target - from) * eased) * (1 + overshoot)))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, reduce])

  const stops = useMemo(
    () => (gradient && gradient.length >= 2 ? gradient : [color, color]),
    [gradient, color],
  )
  const bloom = glow ?? stops[0]

  const geometry = useMemo(() => {
    const cx = size / 2
    const outer = cx - 1
    const inner = outer - sw
    const mid = (outer + inner) / 2
    // A hair of space between segments; too much and the dial reads as dashes,
    // too little and it is the donut again.
    const gapDeg = 1.6
    const stepDeg = 360 / SEGMENTS
    const lenDeg = stepDeg - gapDeg
    return { cx, outer, inner, mid, stepDeg, lenDeg, thickness: sw }
  }, [size, sw])

  // Reduced motion shows the value directly rather than a swept copy of it.
  const shown = reduce ? target : swept
  const litCount = (shown / 100) * SEGMENTS
  const headAngle = (shown / 100) * 360

  return (
    <div
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${Math.round(target)} of 100`}
    >
      {/* Bloom. Sits behind everything and breathes. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: '8%',
          borderRadius: '50%',
          background: `radial-gradient(circle at 50% 50%, color-mix(in srgb, ${bloom} 38%, transparent) 0%, transparent 68%)`,
          filter: `blur(${Math.round(size * 0.07)}px)`,
          opacity: shown > 0 ? 1 : 0,
          animation: reduce ? undefined : 'ring-breath 3.6s ease-in-out infinite',
          transition: 'opacity 600ms ease',
        }}
      />

      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
        style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
      >
        <defs>
          {/* Soft bloom for the lit segments only — applied to the whole lit
              group rather than per segment, which is one filter pass instead
              of sixty. */}
          <filter id={`ring-glow-${size}`} x="-30%" y="-30%" width="160%" height="160%">
            {/* Bloom UNDER a crisp copy, not instead of it. A wider blur read
                as smeared next to the razor-sharp unlit segments; the merge
                puts the sharp shape back on top so the dial glows without
                going soft. */}
            <feGaussianBlur stdDeviation={size * 0.011} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Unlit dial. Always whole, so a low score reads as "not lit yet"
            rather than as a broken ring. */}
        <g>
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <Segment
              key={`dim-${i}`}
              index={i}
              geometry={geometry}
              color={DIM_COLOR}
              opacity={DIM_ALPHA}
            />
          ))}
        </g>

        {/* Lit dial. */}
        <g filter={`url(#ring-glow-${size})`}>
          {Array.from({ length: SEGMENTS }, (_, i) => {
            if (i >= litCount) return null
            // The segment the head is crossing fades in rather than snapping,
            // so the sweep edge stays smooth between whole segments.
            const partial = Math.min(1, litCount - i)
            // Ramp across the LIT arc, not the whole circle: the head is the
            // value, so it must land on the final stop. Sampling by absolute
            // position instead put a "ready" 78 on a blue head while the label
            // said green — the ring contradicted the state it was reporting.
            const t = litCount <= 1 ? 1 : i / (litCount - 1)
            return (
              <Segment
                key={`lit-${i}`}
                index={i}
                geometry={geometry}
                color={sampleStops(stops, t)}
                opacity={0.35 + 0.65 * partial}
              />
            )
          })}
        </g>
      </svg>

      {/* The head: where the value actually is. */}
      {shown > 0.5 && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 0,
            height: 0,
            transform: `rotate(${headAngle}deg)`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: -geometry.thickness * 0.42,
              top: -geometry.mid - geometry.thickness * 0.42,
              width: geometry.thickness * 0.84,
              height: geometry.thickness * 0.84,
              borderRadius: '50%',
              background: '#FFFFFF',
              // The head always carries the final stop, matching the segment
              // it sits on.
              boxShadow: `0 0 ${size * 0.05}px ${size * 0.012}px color-mix(in srgb, ${
                stops[stops.length - 1]
              } 85%, transparent)`,
            }}
          />
        </div>
      )}

      <div className="absolute inset-0 grid place-items-center">
        {typeof children === 'function' ? children(shown) : children}
      </div>

      {/* Scoped, so the keyframes travel with the component instead of living
          in a global stylesheet nobody connects to this ring. */}
      <style>{`
        @keyframes ring-breath {
          0%, 100% { opacity: 0.72; transform: scale(0.985); }
          50%      { opacity: 1;    transform: scale(1.02); }
        }
      `}</style>
    </div>
  )
}

function Segment({
  index,
  geometry,
  color,
  opacity,
}: {
  index: number
  geometry: {
    cx: number
    outer: number
    inner: number
    stepDeg: number
    lenDeg: number
  }
  color: string
  opacity: number
}) {
  const { cx, outer, inner, stepDeg, lenDeg } = geometry
  // -90 puts segment 0 at twelve o'clock; the sweep runs clockwise from there,
  // which is the direction every dial in the physical world turns.
  const a0 = index * stepDeg - 90
  const a1 = a0 + lenDeg
  return <path d={arcBand(cx, cx, outer, inner, a0, a1)} fill={color} opacity={opacity} />
}

/** One segment as a filled band between two radii. */
function arcBand(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  a0: number,
  a1: number,
): string {
  const p = (r: number, a: number) => {
    const rad = (a * Math.PI) / 180
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
  }
  const [x0, y0] = p(rOuter, a0)
  const [x1, y1] = p(rOuter, a1)
  const [x2, y2] = p(rInner, a1)
  const [x3, y3] = p(rInner, a0)
  return [
    `M${x0.toFixed(2)} ${y0.toFixed(2)}`,
    `A${rOuter} ${rOuter} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `L${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `A${rInner} ${rInner} 0 0 0 ${x3.toFixed(2)} ${y3.toFixed(2)}`,
    'Z',
  ].join(' ')
}

/** Colour at position `t` (0–1) across the caller's stops. Kept module-private
 *  so this file exports a component and nothing else — a mixed export breaks
 *  fast refresh for every screen that renders the dial. */
function sampleStops(stops: string[], t: number): string {
  if (stops.length === 0) return '#FFFFFF'
  if (stops.length === 1) return stops[0]
  const clamped = Math.max(0, Math.min(1, t))
  const span = 1 / (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(clamped / span))
  return mixHex(stops[i], stops[i + 1], (clamped - i * span) / span)
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a)
  const pb = parseHex(b)
  if (!pa || !pb) return a
  const ch = (x: number, y: number) => Math.round(x + (y - x) * t)
  return `#${[ch(pa[0], pb[0]), ch(pa[1], pb[1]), ch(pa[2], pb[2])]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`
}

function parseHex(h: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
