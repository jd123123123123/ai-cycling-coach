import { useState } from 'react'
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
  position: 'below' | 'in' | 'above'
  /** Whether being outside the band is the good direction for this metric —
   *  HRV high is good, resting HR high is not. */
  outsideIsGood: boolean
  note: string
}

/**
 * One overnight signal, judged against the athlete's OWN 30-day band.
 *
 * Compact by default: label, reading, and the band with a marker on it — one
 * line you can take in at a glance. Four of these used to be four paragraphs
 * of prose, which is unreadable on a phone at 06:32.
 *
 * The sentence is the DETAIL, and detail is opt-in. It stays open for a signal
 * that actually broke the band, because that is the one the rider needs the
 * reason for; the quiet ones collapse and stay collapsed.
 *
 * A reading outside the band is drawn outside it, never clamped to the edge —
 * clamping would report a real outlier as merely "at the limit".
 */
export default function SignalRow({ signal, index = 0 }: { signal: Value<SignalReading>; index?: number }) {
  const { ref, on, reduced } = useReveal<HTMLDivElement>()
  const outside = isPresent(signal) && signal.value.position !== 'in'
  const [open, setOpen] = useState(outside)

  if (!isPresent(signal)) {
    return (
      <div style={{ padding: '13px 0', borderTop: '1px solid var(--e-rule)' }}>
        <p style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', color: 'var(--e-quiet)', margin: 0 }}>{signal.missing}</p>
      </div>
    )
  }

  const s = signal.value
  // Only a signal that BROKE the band earns the accent. A row sitting inside
  // its normal range is information, not news.
  const tone = !outside ? 'var(--e-lo)' : s.outsideIsGood ? 'var(--st-active)' : 'var(--s-mid)'

  const lo = Math.min(s.band.low, s.value)
  const hi = Math.max(s.band.high, s.value)
  const pad = Math.max((hi - lo) * 0.28, (s.band.high - s.band.low) * 0.28, 0.4)
  const min = lo - pad
  const max = hi + pad
  const pct = (v: number) => ((v - min) / Math.max(max - min, 0.001)) * 100

  return (
    <div ref={ref} data-testid="signal-row" style={{ borderTop: '1px solid var(--e-rule)' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: '100%', background: 'none', border: 'none', padding: '13px 0', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', color: 'inherit',
        }}
      >
        <span style={{ width: 92, flexShrink: 0, fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 700, letterSpacing: '0.02em', color: outside ? 'var(--e-ink)' : 'var(--e-mid)' }}>
          {s.label}
        </span>

        {/* the band, and where today sits on it — the whole claim, in 90px */}
        <span style={{ position: 'relative', flex: 1, height: 14, minWidth: 0 }}>
          <span style={{ position: 'absolute', top: 6, left: 0, right: 0, height: 2, borderRadius: 1, background: 'var(--d-1)' }} />
          <span
            data-testid="signal-band"
            style={{ position: 'absolute', top: 6, height: 2, borderRadius: 1, background: 'var(--d-3)', left: `${pct(s.band.low)}%`, width: `${Math.max(pct(s.band.high) - pct(s.band.low), 1)}%` }}
          />
          <span
            data-testid="signal-marker"
            style={{
              position: 'absolute', top: 1, width: 3, height: 12, borderRadius: 2, background: tone,
              left: on ? `calc(${pct(s.value)}% - 1.5px)` : `calc(${pct((s.band.low + s.band.high) / 2)}% - 1.5px)`,
              transition: reduced ? undefined : `left 560ms ${MOTION_EASE} ${index * 60}ms`,
            }}
          />
        </span>

        <span style={{ display: 'flex', alignItems: 'baseline', gap: 3, flexShrink: 0, minWidth: 76, justifyContent: 'flex-end' }}>
          <span style={{ fontFamily: 'var(--e-display)', fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', color: outside ? 'var(--e-ink)' : 'var(--e-mid)' }}>
            {s.value}
          </span>
          <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', color: 'var(--e-quiet)' }}>{s.unit}</span>
          <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 800, color: tone, width: 26, textAlign: 'right' }}>{s.delta}</span>
        </span>
      </button>

      {open && (
        <p style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', lineHeight: 1.45, color: 'var(--e-mid)', margin: '0 0 13px', paddingLeft: 104 }}>
          {s.note}
        </p>
      )}
    </div>
  )
}
