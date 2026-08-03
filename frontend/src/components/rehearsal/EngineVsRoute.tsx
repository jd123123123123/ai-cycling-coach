import type { RehearsalDemand } from '../../api/rehearsal'
import { glassCardStyle, GLASS_CARD_MARKER } from '../dashboard/glassCard'

/**
 * EngineVsRoute — "can my engine do what this road asks?"
 *
 * This card exists because of one inversion in the backend: a mean-maximal
 * power curve computed over a ride the athlete DID describes the athlete, but
 * computed over a SIMULATED ride it describes the ROAD. The bars below are the
 * hardest 5, 20 and 60 minute blocks this course will force on the rider,
 * placed against their own best over the same window.
 *
 * The reading is deliberately one-glance: the coloured bar is the road's
 * demand, the white tick is the rider's ceiling. Bar short of tick = headroom.
 * Bar past tick = the route asks for something the rider has not done, and the
 * bar turns to the strain colour rather than being quietly clipped.
 *
 * A rider with no recorded effort at a duration still sees the demand. It is a
 * fact about the road, and withholding it because we lack a comparison would
 * hide the one thing we are certain of — the tick simply does not appear.
 */
export default function EngineVsRoute({
  demand,
  de,
}: {
  demand: RehearsalDemand[]
  de: boolean
}) {
  if (!demand || demand.length === 0) return null

  const compared = demand.filter((d) => d.spare_w != null)
  // The headline chip reports the TIGHTEST duration, not the average or the
  // roomiest: a rider is limited by their worst margin, and averaging the three
  // would hide a 5-minute wall behind a comfortable hour.
  const tightest = compared.length
    ? compared.reduce((a, b) => ((a.spare_w ?? 0) <= (b.spare_w ?? 0) ? a : b))
    : null
  const overreach = tightest != null && (tightest.spare_w ?? 0) < 0

  // One shared scale across all three rows, so bar lengths are comparable
  // between durations instead of each row being normalised to itself.
  const scaleMax = Math.max(
    ...demand.map((d) => Math.max(d.required_w, d.athlete_best_w ?? 0)),
  ) * 1.12

  return (
    <section
      {...GLASS_CARD_MARKER}
      style={{ ...glassCardStyle, borderRadius: 20, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span
          className="eyebrow"
          style={{ fontSize: 11, letterSpacing: '0.16em', fontWeight: 800, color: 'var(--color-recovery)' }}
        >
          {de ? 'DEIN MOTOR vs DIESE STRECKE' : 'YOUR ENGINE vs THIS ROUTE'}
        </span>
        {tightest && (
          <span
            style={{
              padding: '3px 9px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 800,
              whiteSpace: 'nowrap',
              color: overreach ? 'var(--color-strain)' : 'var(--color-recovery)',
              border: `1px solid ${overreach ? 'var(--color-strain)' : 'var(--color-recovery)'}55`,
              background: `${overreach ? 'var(--color-strain)' : 'var(--color-recovery)'}1A`,
            }}
          >
            {overreach
              ? `−${Math.abs(Math.round(tightest.spare_w ?? 0))} W`
              : `+${Math.round(tightest.spare_w ?? 0)} W ${de ? 'LUFT' : 'SPARE'}`}
          </span>
        )}
      </div>

      {demand.map((d) => (
        <Row key={d.duration_s} d={d} scaleMax={scaleMax} de={de} />
      ))}

      <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-muted)', margin: 0 }}>
        {compared.length === 0
          ? de
            ? 'Das verlangt die Strecke. Sobald du Bestwerte über diese Dauern gefahren bist, stellen wir sie daneben.'
            : "That is what the route demands. Once you have bests over these durations we will put them alongside."
          : overreach
            ? de
              ? 'Die weiße Marke ist deine Decke — ein Balken darüber verlangt mehr, als du je so lange gefahren bist.'
              : 'The white tick is your ceiling — a bar past it asks for more than you have ever held that long.'
            : de
              ? 'Jede Anforderung dieser Strecke liegt unter deinen Bestwerten — weiße Marke = deine Decke.'
              : 'Every effort this route asks for sits under your bests — white tick = your ceiling.'}
      </p>
    </section>
  )
}

function Row({ d, scaleMax, de }: { d: RehearsalDemand; scaleMax: number; de: boolean }) {
  const label = d.duration_s >= 3600 ? `${Math.round(d.duration_s / 60)} min` : `${Math.round(d.duration_s / 60)} min`
  const over = d.spare_w != null && d.spare_w < 0
  const pct = (w: number) => `${Math.max(0, Math.min(100, (w / scaleMax) * 100))}%`

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--color-ink-2)', width: 48, flex: '0 0 auto' }}>
        {label}
      </span>

      <div style={{ position: 'relative', flex: 1, height: 10 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 999, background: 'var(--color-surface-2)' }} />
        {/* The road's demand. */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: pct(d.required_w),
            borderRadius: 999,
            background: over
              ? 'var(--color-strain)'
              : 'linear-gradient(90deg, var(--color-recovery), var(--color-zone-1))',
            transition: 'width 600ms cubic-bezier(.22,1,.36,1)',
          }}
        />
        {/* The rider's ceiling. Absent when they have no comparable effort. */}
        {d.athlete_best_w != null && (
          <div
            aria-label={de ? 'deine Decke' : 'your ceiling'}
            style={{
              position: 'absolute',
              left: pct(d.athlete_best_w),
              top: -3,
              bottom: -3,
              width: 2.5,
              borderRadius: 2,
              background: '#FFFFFF',
              boxShadow: '0 0 6px #FFFFFFAA',
            }}
          />
        )}
      </div>

      <span
        style={{
          fontSize: 12,
          color: 'var(--color-ink-2)',
          width: 118,
          flex: '0 0 auto',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {de ? 'braucht ' : 'need '}
        <strong style={{ color: 'var(--color-ink)' }}>{Math.round(d.required_w)}</strong>
        {d.athlete_best_w != null && (
          <>
            {de ? ' · best ' : ' · best '}
            {Math.round(d.athlete_best_w)}
          </>
        )}
      </span>
    </div>
  )
}
