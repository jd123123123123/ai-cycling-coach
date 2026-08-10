import { useState } from 'react'
import { useReveal, MOTION_EASE } from '../../motion/useReveal'

export interface CurvePoint { seconds: number; watts: number }

function label(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${s / 60}m`
  return `${s / 3600}h`
}

/**
 * The mean-maximal power curve — the one chart every road cyclist already reads
 * fluently, and the one the archive was missing entirely.
 *
 * Two periods overlaid on a log time axis, with the area BETWEEN them filled:
 * that filled band is "where you got stronger", shown rather than tabulated in
 * a four-row table. It also carries all nine efforts instead of the four the
 * table had room for.
 */
export default function PowerCurve({
  current,
  previous,
  highlightSeconds,
  height = 184,
}: {
  current: CurvePoint[]
  previous?: CurvePoint[]
  highlightSeconds?: number | null
  height?: number
}) {
  const { ref, on, reduced } = useReveal<HTMLDivElement>()
  const W = 342
  const H = height
  if (current.length < 2) return null

  const all = [...current, ...(previous ?? [])]
  const minS = Math.min(...all.map((p) => p.seconds))
  const maxS = Math.max(...all.map((p) => p.seconds))
  const maxW = Math.max(...all.map((p) => p.watts)) * 1.06
  const minW = Math.min(...all.map((p) => p.watts)) * 0.9

  const lx = Math.log(minS)
  const lrange = Math.log(maxS) - lx
  const px = (s: number) => 12 + ((Math.log(s) - lx) / lrange) * (W - 24)
  const py = (w: number) => H - 16 - ((w - minW) / (maxW - minW)) * (H - 32)
  const line = (pts: CurvePoint[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(p.seconds)},${py(p.watts)}`).join(' ')

  const gain =
    previous && previous.length === current.length
      ? `${line(current)} ${[...previous].reverse().map((p) => `L ${px(p.seconds)},${py(p.watts)}`).join(' ')} Z`
      : null

  const draw = { strokeDasharray: 1, strokeDashoffset: on ? 0 : 1, pathLength: 1 as const }
  const [pick, setPick] = useState<number | null>(null)
  const activeS = pick ?? highlightSeconds ?? null
  const hp = activeS != null ? current.find((p) => p.seconds === activeS) : null
  const hpPrev = activeS != null ? previous?.find((p) => p.seconds === activeS) : null
  const delta = hp && hpPrev ? hp.watts - hpPrev.watts : null

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg
        data-testid="power-curve"
        className="ar-plot"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        role="group"
        aria-label="Your power curve. Tap a duration to compare it with last month."
        style={{ display: 'block', borderRadius: 14, background: 'var(--ar-lift)' }}
      >
        {gain && (
          <path
            data-testid="power-curve-gain"
            d={gain}
            fill="var(--ar-gold-dim)"
            style={{ opacity: on ? 1 : 0, transition: reduced ? undefined : `opacity 500ms ${MOTION_EASE} 420ms` }}
          />
        )}
        {previous && (
          <path
            d={line(previous)}
            fill="none"
            stroke="var(--ar-cool)"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...draw}
            style={{ transition: reduced ? undefined : `stroke-dashoffset 620ms ${MOTION_EASE} 120ms` }}
          />
        )}
        <path
          d={line(current)}
          fill="none"
          stroke="var(--ar-gold)"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          {...draw}
          style={{ transition: reduced ? undefined : `stroke-dashoffset 720ms ${MOTION_EASE}` }}
        />
        {hp && (
          <>
            <line x1={px(hp.seconds)} y1={10} x2={px(hp.seconds)} y2={H - 10} stroke="var(--ar-rule)" strokeWidth={1} />
            {hpPrev && (
              <circle cx={px(hpPrev.seconds)} cy={py(hpPrev.watts)} r={4} fill="var(--ar-cool)" />
            )}
            <circle
              data-testid="power-curve-mark"
              cx={px(hp.seconds)}
              cy={py(hp.watts)}
              r={on ? 6 : 0}
              fill="var(--ar-gold)"
              style={{ transition: reduced ? undefined : `r 320ms ${MOTION_EASE} 700ms` }}
            />
          </>
        )}

        {/* one tap target per effort — the whole column, not the 6px dot */}
        {current.map((p) => (
          <rect
            key={p.seconds}
            x={px(p.seconds) - 18} y={0} width={36} height={H}
            fill="transparent" style={{ cursor: 'pointer' }}
            onPointerDown={() => setPick(p.seconds === pick ? null : p.seconds)}
          />
        ))}
      </svg>

      <div
        data-testid="curve-readout"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 9, minHeight: 22, gap: 12 }}
      >
        <span style={{ fontFamily: 'var(--ar-sans)', fontSize: 'var(--ar-t-label)', fontWeight: 700, color: hp ? 'var(--ar-gold)' : 'var(--ar-quiet)' }}>
          {hp ? `${label(hp.seconds)} · ${hp.watts} W` : 'Tap a duration'}
        </span>
        {delta != null && (
          <span style={{ fontFamily: 'var(--ar-sans)', fontSize: 'var(--ar-t-label)', fontWeight: 500, color: 'var(--ar-ink-2)' }}>
            {delta >= 0 ? '+' : '−'}{Math.abs(delta)} W on last month
          </span>
        )}
      </div>
    </div>
  )
}
