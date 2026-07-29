/**
 * Sparkline — the shape behind a number, at chip size.
 *
 * Deliberately dumb: it knows nothing about vitals, baselines or polarity. It
 * takes numbers and a colour, and the caller decides what those mean. That is
 * what lets the same primitive sit inside a green recovery chip and a red
 * warning chip without a branch.
 *
 * ── Two decisions taken from a rendered prototype, not on paper ──
 *  • The area under the curve is FILLED with a fading gradient. A 1.8px stroke
 *    alone is legible only if the eye traces it; the fill reads as a shape at a
 *    glance, which is the entire point at 52×18px.
 *  • There is NO dashed baseline reference line. Every prototype variant drew
 *    one and it was invisible at this size — too thin, too short. The caller's
 *    own "vs <baseline>" text carries that reference instead. An element nobody
 *    can see is not free; it is dishonest chrome.
 */
import { useId } from 'react'

export interface SparklineProps {
  /** Chronological values, oldest first. Fewer than 2 renders nothing. */
  values: number[]
  /** Stroke and gradient-fill colour. Any CSS colour, including a var(). */
  color: string
  width?: number
  height?: number
  /** Accessible description. Omit to mark the graphic decorative. */
  label?: string
}

export default function Sparkline({
  values, color, width = 52, height = 18, label,
}: SparklineProps) {
  // useId, not a module counter: two chips on one page each need their own
  // gradient id, and a counter would collide across a hot reload or an SSR pass.
  const gradientId = useId()

  const clean = values.filter((v) => Number.isFinite(v))
  // One point is a dot, not a trend. Render nothing rather than something
  // meaningless — the caller's chip still shows the number and the baseline.
  if (clean.length < 2) return null

  const min = Math.min(...clean)
  const max = Math.max(...clean)
  const range = max - min
  // A flat series has range 0. Dividing by it yields NaN, which React happily
  // writes into `points` as the literal string "NaN" — an invisible failure.
  // A flat line drawn through the vertical middle is the honest picture.
  const pad = 2.5
  const usableH = height - pad * 2
  const y = (v: number) => (range === 0 ? height / 2 : pad + usableH * (1 - (v - min) / range))
  const x = (i: number) => (clean.length === 1 ? 0 : (width / (clean.length - 1)) * i)

  const pts = clean.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
  const lastX = x(clean.length - 1)
  const lastY = y(clean[clean.length - 1])

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', overflow: 'visible', flex: '0 0 auto' }}
      {...(label ? { role: 'img' } : { 'aria-hidden': 'true' })}
    >
      {label ? <title>{label}</title> : null}
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.5" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M ${pts} L ${width},${height} L 0,${height} Z`} fill={`url(#${gradientId})`} />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* The eye should land on today, which is the only point that is a fact
          about right now rather than history. */}
      <circle cx={lastX} cy={lastY} r="2.4" fill={color} />
    </svg>
  )
}
