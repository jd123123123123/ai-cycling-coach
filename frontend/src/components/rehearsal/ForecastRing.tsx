import { useMemo } from 'react'
import { Zap } from 'lucide-react'
import { formatHm } from './rehearsalMath'
import type { RehearsalBand, RehearsalZone } from '../../api/rehearsal'

/**
 * ForecastRing — the headline: how long, spent in which zones, and how it sits
 * against today.
 *
 * The ring is not decoration. Each arc is one power zone's SHARE of the
 * predicted ride, so the shape of the ring is the shape of the day: a mostly
 * green ring is an endurance outing, a ring with a fat amber wedge is a
 * threshold day wearing a route's clothes. The time sits inside it because the
 * time is a consequence of that distribution, not a separate fact.
 *
 * ── The centre shows a RANGE, and that is deliberate ─────────────────────
 * The design puts a single time here ("3:24"). This renders the band instead,
 * because a bare p50 is the exact trust wound this feature could cause: an
 * athlete who reads one confident number and finishes twenty minutes later
 * concludes the model is wrong, when it was in fact right about the spread and
 * simply never showed it. That rule predates this component (see VerdictBlock)
 * and a redesign is not a reason to drop it — the composition is the design's,
 * the number is the product's.
 *
 * Renders nothing without a band. No prediction, no headline; the caller shows
 * the honest "we cannot estimate a time" block instead.
 */

const RADIUS = 92
const STROKE = 13
const GAP_DEG = 3

export default function ForecastRing({
  band,
  zones,
  distanceM,
  ascentM,
  fitsToday,
  fasterThanBestS,
  de,
}: {
  band?: RehearsalBand
  zones: RehearsalZone[]
  distanceM: number
  ascentM: number
  /** Null when readiness is unknown — the pill is then omitted, not guessed. */
  fitsToday: boolean | null
  /** Seconds faster than this athlete's own BEST here. Null when never ridden. */
  fasterThanBestS: number | null
  de: boolean
}) {
  const arcs = useMemo(() => {
    const real = zones.filter((z) => z.fraction > 0.005)
    const total = real.reduce((a, z) => a + z.fraction, 0)
    if (total <= 0) return []
    let cursor = -90 // start at 12 o'clock
    return real.map((z) => {
      const sweep = (z.fraction / total) * 360
      const from = cursor + GAP_DEG / 2
      const to = cursor + sweep - GAP_DEG / 2
      cursor += sweep
      return { zone: z.zone, from, to, fraction: z.fraction / total }
    })
  }, [zones])

  if (!band) return null

  const cx = RADIUS + STROKE
  const cy = RADIUS + STROKE
  const size = (RADIUS + STROKE) * 2

  const arcPath = (from: number, to: number) => {
    const rad = (d: number) => (d * Math.PI) / 180
    const x1 = cx + RADIUS * Math.cos(rad(from))
    const y1 = cy + RADIUS * Math.sin(rad(from))
    const x2 = cx + RADIUS * Math.cos(rad(to))
    const y2 = cy + RADIUS * Math.sin(rad(to))
    const large = to - from > 180 ? 1 : 0
    return `M ${x1} ${y1} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${x2} ${y2}`
  }

  const pills: { label: string; color: string }[] = [
    { label: `${(distanceM / 1000).toFixed(0)} KM`, color: 'var(--color-ink-blue)' },
    { label: `${Math.round(ascentM).toLocaleString(de ? 'de' : 'en')} HM`, color: 'var(--color-amber)' },
  ]
  if (fitsToday === true) {
    pills.push({ label: de ? 'PASST HEUTE' : 'FITS TODAY', color: 'var(--color-recovery)' })
  } else if (fitsToday === false) {
    pills.push({ label: de ? 'VIEL FÜR HEUTE' : 'A LOT FOR TODAY', color: 'var(--color-amber)' })
  }

  return (
    <section className="flex flex-col items-center" style={{ gap: 14 }}>
      <span
        className="eyebrow"
        style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', color: 'var(--color-ink-blue)' }}
      >
        {de ? 'KI-STRECKENVORSCHAU' : 'AI ROUTE FORECAST'}
      </span>

      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} aria-hidden>
          {/* The track is only visible where no zone lands, which on a real
              ride is nowhere — it exists so a thin ring never looks broken. */}
          <circle cx={cx} cy={cy} r={RADIUS} fill="none" stroke="var(--color-surface-2)" strokeWidth={STROKE} />
          {arcs.map((a) => (
            <path
              key={a.zone}
              d={arcPath(a.from, a.to)}
              fill="none"
              stroke={`var(--color-zone-${Math.min(7, a.zone)})`}
              strokeWidth={STROKE}
              strokeLinecap="round"
            />
          ))}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ gap: 2 }}>
          <span
            className="eyebrow"
            style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', color: 'var(--color-ink-2)' }}
          >
            {de ? 'VORAUSSICHTLICH' : 'EXPECTED TIME'}
          </span>
          {/* The band, never a lone p50 — see the note at the top of the file. */}
          <span
            className="num-display"
            style={{ fontSize: 34, fontWeight: 800, color: 'var(--color-ink)', lineHeight: 1.05 }}
          >
            {`${formatHm(band.p10_s)}–${formatHm(band.p90_s)}`}
          </span>
        </div>
      </div>

      {/* Zone legend as dashes, matching the ring's own order. */}
      {arcs.length > 0 && (
        <div className="flex items-center" style={{ gap: 10 }}>
          {arcs.map((a) => (
            <span
              key={a.zone}
              style={{
                width: 22,
                height: 4,
                borderRadius: 2,
                background: `var(--color-zone-${Math.min(7, a.zone)})`,
              }}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center" style={{ gap: 8 }}>
        {pills.map((p) => (
          <span
            key={p.label}
            className="inline-flex items-center rounded-full"
            style={{
              gap: 6,
              padding: '7px 13px',
              background: `color-mix(in srgb, ${p.color} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${p.color} 30%, transparent)`,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: 999, background: p.color }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.04em', color: p.color }}>
              {p.label}
            </span>
          </span>
        ))}
      </div>

      {/* Only when the athlete has actually ridden this road before. Without a
          previous attempt there is nothing to be faster than. */}
      {fasterThanBestS != null && fasterThanBestS > 60 && (
        <span
          className="inline-flex items-center rounded-full"
          style={{
            gap: 7,
            padding: '9px 15px',
            background: 'color-mix(in srgb, var(--color-amber) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-amber) 26%, transparent)',
          }}
        >
          <Zap size={13} style={{ color: 'var(--color-amber)' }} />
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.03em', color: 'var(--color-amber)' }}>
            {de
              ? `${Math.round(fasterThanBestS / 60)} MIN SCHNELLER ALS DEINE BESTZEIT HIER`
              : `${Math.round(fasterThanBestS / 60)} MIN FASTER THAN YOUR BEST HERE`}
          </span>
        </span>
      )}
    </section>
  )
}
