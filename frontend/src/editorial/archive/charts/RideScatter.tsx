import { useState } from 'react'
import { useReveal, MOTION_EASE } from '../../motion/useReveal'

export interface Ride {
  key: string
  km: number
  climbM: number
  load: number
  label?: string
  date?: string
}

/**
 * Every ride in the period as one dot: x = distance, y = climbing, area = load.
 *
 * A POSITION encoding, which Cleveland & McGill (1984) measured as 1.4–2.5×
 * more accurately decoded than the bar length it replaces. It also shows the
 * SHAPE of a month — a tight cluster reads as samey training, a wide spread as
 * varied, a lone dot top-right as the epic — which no bar chart can express.
 *
 * The climbing axis is sqrt-scaled: one 1 800 m day would otherwise compress
 * twenty ordinary rides into the corner. Order is preserved, spacing changes.
 *
 * Interactive: tap any dot to read that ride. Every mark is a target, so the
 * chart is a way into the data rather than a picture of it.
 */
export default function RideScatter({
  rides,
  highlightKey,
  height = 196,
  interactive = true,
  onOpen,
}: {
  rides: Ride[]
  highlightKey?: string | null
  height?: number
  interactive?: boolean
  onOpen?: (key: string) => void
}) {
  const { ref, on, reduced } = useReveal<HTMLDivElement>()
  const [picked, setPicked] = useState<string | null>(null)
  const W = 342
  const H = height
  if (rides.length === 0) return null

  const maxKm = Math.max(...rides.map((r) => r.km)) * 1.1
  const maxClimb = Math.max(...rides.map((r) => r.climbM)) * 1.1
  const px = (km: number) => 34 + (km / maxKm) * (W - 48)
  const py = (m: number) => H - 26 - Math.sqrt(m / maxClimb) * (H - 52)
  const rad = (load: number) => Math.max(4, Math.min(13, Math.sqrt(load) * 0.92))

  const kms = rides.map((r) => r.km).sort((a, b) => a - b)
  const climbs = rides.map((r) => r.climbM).sort((a, b) => a - b)
  const medKm = kms[Math.floor(kms.length / 2)]
  const medClimb = climbs[Math.floor(climbs.length / 2)]
  const active = picked ?? highlightKey ?? null
  const activeRide = rides.find((r) => r.key === active) ?? null

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg
        data-testid="ride-scatter"
        className="ar-plot"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        style={{ display: 'block', borderRadius: 14, background: 'var(--ar-lift)' }}
        role={interactive ? 'group' : undefined}
        aria-label={interactive ? 'Every ride this month. Tap a ride to read it.' : undefined}
      >
        {/* gridlines: position on a common scale is only the most accurate
            encoding if the scale is actually visible */}
        {[0.33, 0.66, 1].map((f) => {
          const m = maxClimb * f
          return (
            <g key={f}>
              <line x1={30} y1={py(m)} x2={W - 8} y2={py(m)} stroke="var(--ar-rule-soft)" strokeWidth={1} />
              <text x={26} y={py(m) + 4} textAnchor="end" fontSize={11} fontWeight={600} fill="var(--ar-quiet)">
                {Math.round(m / 100) * 100}
              </text>
            </g>
          )
        })}
        <line x1={30} y1={py(medClimb)} x2={W - 8} y2={py(medClimb)} stroke="var(--ar-rule)" strokeWidth={1} strokeDasharray="3 3" />
        <line x1={px(medKm)} y1={10} x2={px(medKm)} y2={H - 26} stroke="var(--ar-rule)" strokeWidth={1} strokeDasharray="3 3" />

        {rides.map((r, i) => {
          const hot = r.key === active
          const rr = rad(r.load)
          return (
            <g key={r.key}>
              <circle
                data-testid={hot ? 'ride-dot-highlight' : 'ride-dot'}
                cx={px(r.km)}
                cy={py(r.climbM)}
                r={on ? rr : 0}
                fill={hot ? 'var(--ar-gold)' : 'var(--ar-cool-dim)'}
                stroke={hot ? 'none' : 'var(--ar-cool)'}
                strokeWidth={hot ? 0 : 1.2}
                style={{ transition: reduced ? undefined : `r 460ms ${MOTION_EASE} ${Math.min(i * 20, 480)}ms, fill 180ms ease` }}
              />
              {interactive && (
                /* a 22px invisible target over every dot — the visible marks
                   are far below a comfortable touch size */
                <circle
                  cx={px(r.km)} cy={py(r.climbM)} r={22} fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onPointerDown={() => setPicked(r.key === picked ? null : r.key)}
                  onDoubleClick={() => onOpen?.(r.key)}
                />
              )}
            </g>
          )
        })}

        <text x={30} y={H - 8} fontSize={11} fontWeight={600} fill="var(--ar-quiet)">0</text>
        <text x={W - 8} y={H - 8} textAnchor="end" fontSize={11} fontWeight={600} fill="var(--ar-quiet)">
          {Math.round(maxKm)} km
        </text>
        <text x={6} y={16} fontSize={11} fontWeight={700} fill="var(--ar-quiet)">m up</text>
      </svg>

      {/* the readout: what the tapped dot actually is. Only when the chart is
          a control — on the share card it is an image and a "Tap a ride"
          prompt would be a lie. */}
      {interactive && (
      <div
        data-testid="scatter-readout"
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingTop: 9, minHeight: 22, gap: 12,
        }}
      >
        <span style={{ fontFamily: 'var(--ar-sans)', fontSize: 'var(--ar-t-label)', fontWeight: 700, color: activeRide ? 'var(--ar-gold)' : 'var(--ar-quiet)' }}>
          {activeRide ? (activeRide.label ?? activeRide.date ?? 'Ride') : 'Tap a ride'}
        </span>
        {activeRide && (
          <span style={{ fontFamily: 'var(--ar-sans)', fontSize: 'var(--ar-t-label)', fontWeight: 500, color: 'var(--ar-ink-2)' }}>
            {activeRide.km} km · {activeRide.climbM} m · {activeRide.load} load
          </span>
        )}
      </div>
      )}
    </div>
  )
}
