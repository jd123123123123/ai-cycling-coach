import type { RehearsalClimb, RehearsalSegment } from '../../api/rehearsal'
import { glassCardStyle, GLASS_CARD_MARKER } from '../dashboard/glassCard'
import { climbLabel, climbStats, formatHms } from './rehearsalMath'
import { zoneColorForGradient } from './profileMath'

/**
 * ClimbCards — one card per detected climb: how long, how steep, and what the
 * projection asks of you on it (target watts, time, W′ spent).
 *
 * The W′ figure is the reason this list exists rather than a table of
 * gradients: it is the only place the athlete can see WHICH climb empties the
 * tank, and therefore which one to ride within themselves. Any figure the
 * projection doesn't carry renders as `—`; a climb with no pacing behind it
 * (no CP on file) still shows its real terrain.
 */
export default function ClimbCards({
  climbs,
  segments,
  de,
}: {
  climbs: RehearsalClimb[]
  segments: RehearsalSegment[]
  de: boolean
}) {
  if (climbs.length === 0) return null

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span
        className="eyebrow"
        style={{ fontSize: 11, letterSpacing: '0.18em', fontWeight: 700, color: 'var(--color-ink-2)' }}
      >
        {de ? `ANSTIEGE · ${climbs.length}` : `CLIMBS · ${climbs.length}`}
      </span>
      {climbs.map((climb) => {
        const stats = climbStats(segments, climb)
        return (
          <article
            key={climb.climb_id}
            {...GLASS_CARD_MARKER}
            style={{ ...glassCardStyle, borderRadius: 20, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: zoneColorForGradient(climb.avg_grade_pct),
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 15, fontWeight: 590, color: 'var(--color-ink)' }}>
                {climbLabel(climb, de)}
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--color-muted)', marginLeft: 'auto' }}>
                {de ? `ab km ${(climb.start_m / 1000).toFixed(1)}` : `from km ${(climb.start_m / 1000).toFixed(1)}`}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <Figure
                label={de ? 'Länge' : 'Length'}
                value={`${(climb.length_m / 1000).toFixed(1)} km`}
              />
              <Figure
                label={de ? 'Ø Steigung' : 'Avg gradient'}
                value={`${climb.avg_grade_pct.toFixed(1)} %`}
              />
              <Figure
                label={de ? 'Zielleistung' : 'Target power'}
                value={stats.meanPowerW != null ? `${Math.round(stats.meanPowerW)} W` : '—'}
              />
              <Figure
                label={de ? 'Dauer' : 'Time'}
                value={stats.timeS != null ? formatHms(stats.timeS) : '—'}
              />
              <Figure
                label={de ? 'W′-Kosten' : "W′ cost"}
                value={stats.wCostJ != null ? `${(stats.wCostJ / 1000).toFixed(1)} kJ` : '—'}
              />
              <Figure
                label={de ? 'Höhenmeter' : 'Elevation'}
                value={`${Math.round(climb.elev_gain_m)} m`}
              />
            </div>
          </article>
        )
      })}
    </section>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 11, color: 'var(--color-muted)', letterSpacing: '0.02em' }}>{label}</span>
      <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>
        {value}
      </span>
    </div>
  )
}
