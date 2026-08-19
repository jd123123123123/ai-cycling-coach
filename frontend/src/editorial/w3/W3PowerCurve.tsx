import { useMemo } from 'react'
import { motion } from 'motion/react'
import { Zap } from 'lucide-react'
import { T, FONT, Kicker, DASH, useInView } from './w3tokens'
import type { HeroPoint } from '../../hooks/usePowerProfileView'

/**
 * W3 · Power-duration curve — the artefact a trained cyclist opens an app for.
 *
 * The data has existed and been served all along (`power_profile_view.py` →
 * GET /analytics/power-profile-view). It was only ever drawn on the old app's
 * /power-profile screen, which W3's five tabs give no way to reach. This is
 * that curve re-composed in W3 tokens — NOT a link out to the old chrome.
 *
 * LOG X, ALWAYS. The durations span 5 s to 3600 s. On a linear axis the whole
 * anaerobic end — 5 s, 15 s, 1 min, the part that separates a sprinter from a
 * time-triallist — collapses into the first 2 % of the width and the chart says
 * nothing. Every serious power tool plots this logarithmically for that reason.
 *
 * HONEST GAPS. A duration the rider has never held gets `watts: null` from the
 * server. Those points are dropped from the path rather than zeroed or
 * interpolated across: a curve that dips to 0 W at 60 min claims the rider
 * emptied themselves, when the truth is simply that they have not ridden an
 * hour hard with a power meter.
 */

const PAD = { l: 34, r: 10, t: 10, b: 20 }

/** Normalised 0..1 position of a duration on the log axis. Exported for test:
 *  the whole readability argument rests on this not being linear. */
export function logX(seconds: number, minS = 5, maxS = 3600): number {
  if (seconds <= 0) return 0
  const lo = Math.log(minS), hi = Math.log(maxS)
  return Math.max(0, Math.min(1, (Math.log(seconds) - lo) / (hi - lo)))
}

/** The plottable points, in order, with nulls dropped. Exported for test. */
export function plottable(curve: HeroPoint[]): HeroPoint[] {
  return curve.filter((p) => p.watts != null && p.watts > 0).sort((a, b) => a.seconds - b.seconds)
}

export default function W3PowerCurve({ curve, de = true, w = 310, h = 132 }: {
  curve: HeroPoint[]
  de?: boolean
  w?: number
  h?: number
}) {
  const { ref, inView } = useInView(0.35)
  const pts = useMemo(() => plottable(curve), [curve])

  if (pts.length < 2) return null

  const watts = pts.map((p) => p.watts as number)
  const maxW = Math.max(...watts)
  // Floor the y-domain at 0 so the shape reads as absolute power, not as a
  // zoomed-in wiggle — a curve auto-scaled to its own min exaggerates a flat
  // profile into a cliff.
  const iw = w - PAD.l - PAD.r
  const ih = h - PAD.t - PAD.b
  const px = (s: number) => PAD.l + logX(s) * iw
  const py = (v: number) => PAD.t + (1 - v / (maxW * 1.08)) * ih

  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.seconds).toFixed(1)},${py(p.watts as number).toFixed(1)}`).join(' ')
  const area = `${path} L${px(pts[pts.length - 1].seconds).toFixed(1)},${(PAD.t + ih).toFixed(1)} L${px(pts[0].seconds).toFixed(1)},${(PAD.t + ih).toFixed(1)} Z`

  // Two y-gridlines only. This is a 132px chart on a phone; a full axis would
  // out-weigh the line it is there to support.
  const ticks = [maxW, maxW / 2]

  return (
    <div ref={ref} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ width: 24, height: 24, flex: 'none', borderRadius: 8, background: T.acidDim, border: `1px solid ${T.acid}24`, display: 'grid', placeItems: 'center' }}>
          <Zap size={12} color={T.acid} />
        </span>
        <Kicker>{de ? 'Leistungskurve · deine Bestwerte' : 'Power curve · your bests'}</Kicker>
      </div>

      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }} aria-hidden>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={w - PAD.r} y1={py(t)} y2={py(t)} stroke={T.rule} strokeWidth={1} />
            <text x={0} y={py(t) + 3} fill={T.quiet} fontSize={8} fontWeight={700} fontFamily={FONT}>
              {Math.round(t)}
            </text>
          </g>
        ))}

        <defs>
          <linearGradient id="w3pc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={T.acid} stopOpacity={0.22} />
            <stop offset="100%" stopColor={T.acid} stopOpacity={0} />
          </linearGradient>
        </defs>

        <motion.path d={area} fill="url(#w3pc)"
          initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : undefined}
          transition={{ duration: 0.5, delay: 0.15 }} />

        {/* The curve draws itself left to right — short efforts first, which is
            the order a rider reads their own profile in. */}
        <motion.path d={path} fill="none" stroke={T.acid} strokeWidth={2}
          strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 0 }} animate={inView ? { pathLength: 1 } : undefined}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />

        {pts.map((p) => (
          <circle key={p.seconds} cx={px(p.seconds)} cy={py(p.watts as number)}
            r={p.is_pr ? 3.6 : 2.4}
            fill={p.is_pr ? T.acid : T.bg}
            stroke={T.acid} strokeWidth={p.is_pr ? 0 : 1.6} />
        ))}

        {pts.map((p) => (
          <text key={`l${p.seconds}`} x={px(p.seconds)} y={h - 4} fill={T.quiet}
            fontSize={8} fontWeight={700} fontFamily={FONT} textAnchor="middle">
            {de ? p.label_de : p.label_en}
          </text>
        ))}
      </svg>

      {/* The numbers under the shape — a curve without its values is decoration. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {pts.map((p) => (
          <div key={`c${p.seconds}`} style={{
            display: 'flex', alignItems: 'baseline', gap: 4, padding: '5px 9px', borderRadius: 100,
            background: p.is_pr ? T.acidDim : '#FFFFFF0A',
            border: `1px solid ${p.is_pr ? `${T.acid}33` : 'transparent'}`,
          }}>
            <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.6, color: T.quiet }}>
              {de ? p.label_de : p.label_en}
            </span>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: -0.3, color: p.is_pr ? T.acid : T.ink }}>
              {p.watts ?? DASH}
            </span>
            <span style={{ fontSize: 8.5, fontWeight: 700, color: T.quiet }}>W</span>
          </div>
        ))}
      </div>
    </div>
  )
}
