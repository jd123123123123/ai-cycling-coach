// ActivityRings — three concentric arc rings (Apple/WHOOP style) from
// pencil-new.pen. Each ring: outer→inner, filled to value/goal, with its own
// vivid channel color. Renders via SVG arcs sweeping clockwise from the top.

export interface RingSpec {
  value: number
  goal: number
  color: string
}

export default function ActivityRings({ rings, size = 104, gap = 4, stroke = 10 }: { rings: RingSpec[]; size?: number; gap?: number; stroke?: number }) {
  const cx = size / 2
  const cy = size / 2
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
      {rings.map((r, i) => {
        const radius = size / 2 - stroke / 2 - i * (stroke + gap)
        if (radius <= 0) return null
        const c = 2 * Math.PI * radius
        const pct = Math.max(0, Math.min(1, r.goal > 0 ? r.value / r.goal : 0))
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={radius} fill="none" stroke={r.color} strokeOpacity={0.2} strokeWidth={stroke} />
            <circle
              cx={cx} cy={cy} r={radius} fill="none" stroke={r.color} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
              style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.22,1,.36,1)' }}
            />
          </g>
        )
      })}
    </svg>
  )
}
