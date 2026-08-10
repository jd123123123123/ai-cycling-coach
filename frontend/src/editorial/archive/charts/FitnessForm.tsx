import { useReveal, MOTION_EASE } from '../../motion/useReveal'

export interface PmcDay { ctl: number; tsb: number }

/**
 * Fitness as a filled area (the thing you keep) and form as a line crossing
 * zero (the thing you spend). This answers the question the whole deck was
 * previously unable to answer: what did all that volume actually DO.
 */
export default function FitnessForm({ days, height = 156 }: { days: PmcDay[]; height?: number }) {
  const { ref, on, reduced } = useReveal<HTMLDivElement>()
  const W = 342
  const H = height
  if (days.length < 2) return null

  const maxCtl = Math.max(...days.map((d) => d.ctl)) * 1.12
  const tsbs = days.map((d) => d.tsb)
  const tsbMax = Math.max(Math.abs(Math.min(...tsbs)), Math.abs(Math.max(...tsbs)), 10)
  const px = (i: number) => 12 + (i / (days.length - 1)) * (W - 24)
  const pyC = (v: number) => H - 14 - (v / maxCtl) * (H - 44)
  const zero = H * 0.62
  const pyT = (v: number) => zero - (v / tsbMax) * (H * 0.3)

  const ctlLine = days.map((d, i) => `${i === 0 ? 'M' : 'L'} ${px(i)},${pyC(d.ctl)}`).join(' ')
  const ctlArea = `${ctlLine} L ${px(days.length - 1)},${H} L ${px(0)},${H} Z`
  const tsbLine = days.map((d, i) => `${i === 0 ? 'M' : 'L'} ${px(i)},${pyT(d.tsb)}`).join(' ')
  const draw = { strokeDasharray: 1, strokeDashoffset: on ? 0 : 1, pathLength: 1 as const }
  const last = days[days.length - 1]

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg
        data-testid="fitness-form"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ display: 'block', borderRadius: 14, background: 'var(--ar-lift)' }}
      >
        <line x1={0} y1={zero} x2={W} y2={zero} stroke="var(--ar-rule-soft)" strokeWidth={1} />
        <text x={10} y={zero + 12} fontSize={9} fontWeight={600} fill="var(--ar-quiet)">form 0</text>
        <path
          d={ctlArea}
          fill="var(--ar-gold-ghost)"
          style={{ opacity: on ? 1 : 0, transition: reduced ? undefined : `opacity 520ms ${MOTION_EASE} 320ms` }}
        />
        <path
          d={ctlLine} fill="none" stroke="var(--ar-gold)" strokeWidth={2.6}
          strokeLinecap="round" strokeLinejoin="round" {...draw}
          style={{ transition: reduced ? undefined : `stroke-dashoffset 720ms ${MOTION_EASE}` }}
        />
        <path
          d={tsbLine} fill="none" stroke="var(--ar-cool)" strokeWidth={1.8}
          strokeLinecap="round" strokeLinejoin="round" {...draw}
          style={{ transition: reduced ? undefined : `stroke-dashoffset 720ms ${MOTION_EASE} 160ms` }}
        />
        <circle
          cx={px(days.length - 1)} cy={pyC(last.ctl)} r={on ? 5 : 0} fill="var(--ar-gold)"
          style={{ transition: reduced ? undefined : `r 300ms ${MOTION_EASE} 720ms` }}
        />
        <circle
          cx={px(days.length - 1)} cy={pyT(last.tsb)} r={on ? 4 : 0} fill="var(--ar-cool)"
          style={{ transition: reduced ? undefined : `r 300ms ${MOTION_EASE} 780ms` }}
        />
      </svg>
    </div>
  )
}
