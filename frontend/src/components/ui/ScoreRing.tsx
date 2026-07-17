import type { ReactNode } from 'react'

// ScoreRing — the WHOOP recovery/score gauge from pencil-new.pen. An SVG track
// + arc filled to `score`%, with arbitrary center content. Arc sweeps clockwise
// from the top.

export default function ScoreRing({
  score,
  color,
  size = 120,
  stroke,
  trackColor = 'var(--color-surface-3)',
  children,
}: {
  score: number
  color: string
  size?: number
  stroke?: number
  trackColor?: string
  children?: ReactNode
}) {
  const sw = stroke ?? Math.round(size * 0.085)
  const r = (size - sw) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, score))
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
