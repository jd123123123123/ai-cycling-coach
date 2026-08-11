import { useReveal, MOTION_EASE } from '../motion/useReveal'
import { isPresent, type Value } from '../data/value'

export interface SignalReading {
  key: string
  label: string
  value: number
  unit: string
  delta: string
  /** The athlete's own 30-day band. Position against THIS is the claim. */
  band: { low: number; high: number }
  /** Where today's reading sits relative to the band. */
  position: 'below' | 'in' | 'above'
  /** Whether being outside the band is a good thing for this metric — HRV high
   *  is good, resting HR high is not. Direction, not magnitude, decides tone. */
  outsideIsGood: boolean
  note: string
}

/**
 * One overnight signal, judged against the athlete's OWN 30-day band.
 *
 * The number alone means nothing — 71 ms of HRV is only "strong" relative to
 * this rider's usual. So the band is the visible object and the reading is a
 * marker on it, which makes "outside your range" a thing you SEE rather than a
 * label you're asked to trust.
 *
 * A reading outside the band is drawn outside it, never clamped to the edge:
 * clamping would report a genuine outlier as merely "at the limit".
 */
export default function SignalRow({ signal, index = 0 }: { signal: Value<SignalReading>; index?: number }) {
  const { ref, on, reduced } = useReveal<HTMLDivElement>()

  if (!isPresent(signal)) {
    return (
      <div style={{ padding: '16px 0', borderTop: '1px solid var(--e-rule)' }}>
        <p style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', color: 'var(--e-quiet)', margin: 0 }}>{signal.missing}</p>
      </div>
    )
  }

  const s = signal.value
  const outside = s.position !== 'in'
  // Outside the band is only "good" when the direction is the helpful one.
  const tone = outside && s.outsideIsGood ? 'var(--st-active)' : outside ? 'var(--s-mid)' : 'var(--e-mid)'

  // Scale the track past whichever is more extreme, band or reading, so an
  // outlier lands visibly outside the shaded zone.
  const lo = Math.min(s.band.low, s.value)
  const hi = Math.max(s.band.high, s.value)
  const pad = Math.max((hi - lo) * 0.3, (s.band.high - s.band.low) * 0.3, 0.4)
  const min = lo - pad
  const max = hi + pad
  const pct = (v: number) => ((v - min) / Math.max(max - min, 0.001)) * 100

  return (
    <div ref={ref} data-testid="signal-row" style={{ padding: '18px 0', borderTop: '1px solid var(--e-rule)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--e-ink)' }}>
            {s.label}
          </span>
          <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: tone }}>
            {outside ? 'Outside your range' : 'Inside your range'}
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--e-display)', fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, color: 'var(--e-ink)' }}>
            {s.value}
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', paddingBottom: 2 }}>
            <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 600, color: 'var(--e-quiet)' }}>{s.unit}</span>
            <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 800, color: tone }}>{s.delta}</span>
          </span>
        </span>
      </div>

      <div style={{ position: 'relative', height: 20, marginTop: 13 }}>
        <span style={{ position: 'absolute', top: 8, left: 0, right: 0, height: 3, borderRadius: 2, background: 'var(--d-1)' }} />
        <span
          data-testid="signal-band"
          style={{
            position: 'absolute', top: 8, height: 3, borderRadius: 2, background: 'var(--d-3)',
            left: `${pct(s.band.low)}%`, width: `${Math.max(pct(s.band.high) - pct(s.band.low), 1)}%`,
          }}
        />
        <span
          data-testid="signal-marker"
          style={{
            position: 'absolute', top: 2, width: 3, height: 15, borderRadius: 2, background: tone,
            left: on ? `calc(${pct(s.value)}% - 1.5px)` : `calc(${pct((s.band.low + s.band.high) / 2)}% - 1.5px)`,
            transition: reduced ? undefined : `left 600ms ${MOTION_EASE} ${index * 70}ms`,
          }}
        />
      </div>

      <p style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', lineHeight: 1.45, color: 'var(--e-mid)', margin: '11px 0 0' }}>
        {s.note}
      </p>
    </div>
  )
}
