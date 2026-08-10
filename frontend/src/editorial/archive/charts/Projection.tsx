import { useReveal, MOTION_EASE } from '../../motion/useReveal'

/**
 * A forecast drawn WITH its uncertainty band, never as a single confident line.
 *
 * Composite wellness scores across the category are published without disclosed
 * methods or validation, and riders have started to notice. Showing the band —
 * and the conditions the projection depends on — is the available trust
 * position, and it costs nothing but honesty.
 */
export default function Projection({
  actual,
  projLow,
  projHigh,
  height = 156,
}: {
  actual: number[]
  projLow: number[]
  projHigh: number[]
  height?: number
}) {
  const { ref, on, reduced } = useReveal<HTMLDivElement>()
  const W = 342
  const H = height
  if (actual.length < 2 || projHigh.length < 2) return null

  const total = actual.length + projHigh.length - 1
  const all = [...actual, ...projHigh, ...projLow]
  const maxV = Math.max(...all) * 1.06
  const minV = Math.min(...all) * 0.94
  const px = (i: number) => 14 + (i / (total - 1)) * (W - 28)
  const py = (v: number) => H - 16 - ((v - minV) / (maxV - minV)) * (H - 40)
  const nowI = actual.length - 1

  const actualLine = actual.map((v, i) => `${i === 0 ? 'M' : 'L'} ${px(i)},${py(v)}`).join(' ')
  const hi = projHigh.map((v, i) => `${i === 0 ? 'M' : 'L'} ${px(nowI + i)},${py(v)}`).join(' ')
  const band =
    `${hi} ` +
    [...projLow].reverse().map((v, i) => `L ${px(nowI + projLow.length - 1 - i)},${py(v)}`).join(' ') +
    ' Z'
  const mid = projHigh.map((v, i) => (v + projLow[i]) / 2)

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg
        data-testid="projection"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ display: 'block', borderRadius: 14, background: 'var(--ar-lift)' }}
      >
        <path
          data-testid="projection-band"
          d={band}
          fill="var(--ar-gold-ghost)"
          style={{ opacity: on ? 1 : 0, transition: reduced ? undefined : `opacity 520ms ${MOTION_EASE} 420ms` }}
        />
        <line x1={px(nowI)} y1={0} x2={px(nowI)} y2={H} stroke="var(--ar-rule)" strokeWidth={1} />
        <text x={px(nowI) + 6} y={14} fontSize={9} fontWeight={700} letterSpacing={1} fill="var(--ar-quiet)">NOW</text>
        <path
          d={actualLine} fill="none" stroke="var(--ar-gold)" strokeWidth={2.6}
          strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={1} strokeDashoffset={on ? 0 : 1} pathLength={1}
          style={{ transition: reduced ? undefined : `stroke-dashoffset 700ms ${MOTION_EASE}` }}
        />
        {/* the projected half is dashed — a different visual grammar for a
            different epistemic status: measured vs modelled */}
        <path
          d={mid.map((v, i) => `${i === 0 ? 'M' : 'L'} ${px(nowI + i)},${py(v)}`).join(' ')}
          fill="none" stroke="var(--ar-gold)" strokeWidth={2} strokeLinecap="round"
          strokeDasharray="5 5"
          style={{ opacity: on ? 0.95 : 0, transition: reduced ? undefined : `opacity 400ms ${MOTION_EASE} 620ms` }}
        />
        <circle
          cx={px(nowI)} cy={py(actual[nowI])} r={on ? 5.5 : 0} fill="var(--ar-gold)"
          style={{ transition: reduced ? undefined : `r 320ms ${MOTION_EASE} 640ms` }}
        />
      </svg>
    </div>
  )
}
