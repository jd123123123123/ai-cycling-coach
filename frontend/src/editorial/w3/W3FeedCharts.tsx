import { motion, useReducedMotion } from 'motion/react'
import { T } from './w3tokens'

/**
 * W3 · THE TWO SHAPES A FEED CARD DRAWS.
 *
 * Both come off a real stream the server downsampled — altitude for a ride
 * that climbed, power for one on a trainer. Neither is ever synthesised: a
 * ride with no such series gets no chart, because a flat line pretending to be
 * terrain is worse than the space it fills.
 *
 * EACH IS SCALED AGAINST ITS OWN SERIES, never a fixed axis. A flat commute and
 * an alpine day both have to be legible, and a shared axis would draw one of
 * them as a dead line along the bottom.
 */

/**
 * The elevation profile under a photo post — pen frame `SpFxs`.
 *
 * A LINE WITH A FILL, not an area chart with a stroke on top. The fill fades to
 * nothing at the baseline so the card's own ground shows through it; a solid
 * area would be a second surface sitting on the plate, and this sits ON the
 * plate.
 *
 * The axis is truncated to the series' own floor. Zero-based, a profile that
 * runs 400–800 m draws in the top half of the box with an empty half beneath
 * it, and the col — the entire subject — flattens to a bump.
 */
export function W3ElevationProfile({ series, w, h, tint = T.acid }: {
  series: number[]
  w: number
  h: number
  tint?: string
}) {
  const reduce = useReducedMotion()
  if (series.length < 2) return null

  const lo = Math.min(...series)
  const hi = Math.max(...series)
  const span = hi - lo || 1
  const x = (i: number) => (i / (series.length - 1)) * w
  const y = (v: number) => h - ((v - lo) / span) * (h - 6) - 3

  const line = series.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${w} ${h} L0 ${h} Z`
  const gid = `elev-${Math.round(w)}-${series.length}`

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
      role="img" aria-label="Höhenprofil der Fahrt" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tint} stopOpacity={0.42} />
          <stop offset="100%" stopColor={tint} stopOpacity={0} />
        </linearGradient>
      </defs>
      <motion.path
        d={area} fill={`url(#${gid})`} stroke="none"
        initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut', delay: 0.15 }} />
      <motion.path
        d={line} fill="none" stroke={tint} strokeWidth={2.2}
        strokeLinecap="round" strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: 'easeOut' }} />
    </svg>
  )
}

/**
 * The interval bars on a trainer post — pen frame `kFeEt`.
 *
 * THE HARD BARS ARE LIT AND THE REST ARE NOT, which is what makes this a
 * picture of intervals rather than a bar chart of power. The threshold is the
 * ride's OWN upper range — anything in the top third of the spread it actually
 * held — so a sweetspot hour and a 4×8 session each light the part that was
 * the work, without either being measured against an FTP the feed does not
 * know.
 */
export function W3IntervalBars({ series, w, h, tint = T.acid }: {
  series: number[]
  w: number
  h: number
  tint?: string
}) {
  const reduce = useReducedMotion()
  if (series.length < 2) return null

  const lo = Math.min(...series)
  const hi = Math.max(...series)
  const span = hi - lo || 1
  const lit = lo + span * 0.66

  // Bars, not points: at 48 samples across ~140px a bar is under 3px, so the
  // gap has to come out of the width rather than be added to it.
  const slot = w / series.length
  const bw = Math.max(1.5, slot * 0.62)

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
      role="img" aria-label="Intervallverlauf der Einheit" style={{ display: 'block' }}>
      {series.map((v, i) => {
        const bh = Math.max(2, ((v - lo) / span) * (h - 4) + 2)
        return (
          <motion.rect
            key={i}
            x={i * slot + (slot - bw) / 2}
            width={bw}
            rx={Math.min(1.5, bw / 2)}
            fill={v >= lit ? tint : `${T.ink}1F`}
            initial={reduce ? false : { height: 2, y: h - 2 }}
            animate={{ height: bh, y: h - bh }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: reduce ? 0 : i * 0.008 }}
          />
        )
      })}
    </svg>
  )
}
