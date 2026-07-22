import type { ReactNode } from 'react'

// ScoreRing — the WHOOP recovery/score gauge from pencil-new.pen. A track ring
// + an arc filled to `score`%, with arbitrary centre content.
//
// Two render modes:
//  • flat  (default) — a single-colour SVG arc (used by RecoveryTab).
//  • gradient — the pen's signature multi-stop ANGULAR gradient ring + glow
//    (pen RingFill: an ellipse innerRadius 0.9 with an angular gradient, flat
//    radial ends, startAngle top / clockwise sweep proportional to score). Pass
//    `gradient` (2–3 stops) and `glow` to opt in. The arc is a masked
//    conic-gradient so the colour sweeps around the arc exactly like the pen.

export default function ScoreRing({
  score,
  color,
  gradient,
  glow,
  size = 120,
  stroke,
  trackColor = 'var(--color-surface-3)',
  children,
}: {
  score: number
  color: string
  /** 2–3 hex stops for the pen's angular-gradient ring. Enables gradient mode. */
  gradient?: string[]
  /** Glow colour behind the arc (gradient mode). Defaults to the first stop. */
  glow?: string
  size?: number
  stroke?: number
  trackColor?: string
  children?: ReactNode
}) {
  const sw = stroke ?? Math.round(size * 0.085)
  const pct = Math.max(0, Math.min(100, score))

  if (gradient && gradient.length >= 2) {
    // Angular-gradient ring (pen RingFill). conic-gradient `from 0deg` starts at
    // 12 o'clock and sweeps clockwise — matching the pen's startAngle 90 /
    // negative (clockwise) sweep. The colour band spans exactly the filled arc;
    // a hard stop to transparent gives the flat radial end the pen shows.
    const sweep = (pct / 100) * 360
    const g = gradient
    const mid = g.length >= 3 ? g[1] : g[0]
    const end = g[g.length - 1]
    const stops =
      sweep <= 0
        ? 'transparent 0deg, transparent 360deg'
        : `${g[0]} 0deg, ${mid} ${sweep / 2}deg, ${end} ${sweep}deg, transparent ${sweep}deg, transparent 360deg`
    // Ring-shaped mask: transparent core, opaque sw-wide band at the outer edge.
    const ringMask = `radial-gradient(farthest-side, transparent calc(100% - ${sw}px), #000 calc(100% - ${sw}px))`
    const glowColor = glow ?? g[0]
    return (
      <div className="relative grid place-items-center" style={{ width: size, height: size }}>
        {/* Track ring */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: trackColor,
            WebkitMaskImage: ringMask,
            maskImage: ringMask,
          }}
        />
        {/* Angular-gradient arc + glow */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(from 0deg, ${stops})`,
            WebkitMaskImage: ringMask,
            maskImage: ringMask,
            filter: `drop-shadow(0 0 10px color-mix(in srgb, ${glowColor} 60%, transparent))`,
            transition: 'background 1s cubic-bezier(.22,1,.36,1)',
          }}
        />
        <div className="absolute inset-0 grid place-items-center">{children}</div>
      </div>
    )
  }

  // Flat single-colour arc.
  const r = (size - sw) / 2
  const c = 2 * Math.PI * r
  const dash = c * (1 - pct / 100)
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={sw} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={dash}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.22,1,.36,1)', filter: `drop-shadow(0 0 6px color-mix(in srgb, ${color} 55%, transparent))` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}
