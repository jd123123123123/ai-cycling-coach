import type { RehearsalZone } from '../../api/rehearsal'
import { formatHms } from './rehearsalMath'
import { glassCardStyle, GLASS_CARD_MARKER } from '../dashboard/glassCard'
import { eyebrow } from '../dashboard/surfaces'

/**
 * TimeInZones — where the hours actually go.
 *
 * A route's headline is its total time; what the rider plans against is the
 * SHAPE of that time. Three and a half hours that are 80% endurance is a long
 * ride; the same three and a half hours with forty minutes at threshold is a
 * hard one, and the total cannot tell them apart.
 *
 * Drawn as stacked proportional bars rather than a donut. A donut looks like
 * the pen's ring but forces the eye to compare arc lengths, and five arcs of
 * similar size are genuinely hard to rank; stacked bars share one baseline, so
 * the ordering is read rather than estimated. The one number a donut gives for
 * free — the total in the middle — is kept as the header chip.
 *
 * Zone colours come from the app's power-zone scale, so a threshold block here
 * is the same colour as a threshold block everywhere else in the app.
 */

const ZONE_COLORS = [
  'var(--color-zone-1)',
  'var(--color-zone-2)',
  'var(--color-zone-3)',
  'var(--color-zone-4)',
  'var(--color-zone-5)',
]

export default function TimeInZones({
  zones,
  ftpUsedW,
  ftpIsCpFallback,
  de,
}: {
  zones: RehearsalZone[]
  ftpUsedW?: number | null
  ftpIsCpFallback?: boolean
  de: boolean
}) {
  if (!zones || zones.length === 0) return null
  const total = zones.reduce((s, z) => s + z.seconds, 0)
  if (total <= 0) return null

  // "Aerobic" = Z1-Z3. The single sentence a rider takes away from this card is
  // whether the route is carried by their base or by their top end.
  const aerobic = zones.filter((z) => z.zone <= 3).reduce((s, z) => s + z.fraction, 0)
  const hard = 1 - aerobic

  return (
    <section
      {...GLASS_CARD_MARKER}
      style={{ ...glassCardStyle, borderRadius: 20, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span
          className="eyebrow"
          style={eyebrow('var(--color-ink-2)')}
        >
          {de ? 'WO DIE ZEIT HINGEHT' : 'WHERE THE TIME GOES'}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--color-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {formatHms(total)}
        </span>
      </div>

      {/* One stacked bar: the whole ride, in proportion. */}
      <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', gap: 1.5 }}>
        {zones.map((z, i) =>
          z.fraction > 0 ? (
            <div
              key={z.zone}
              style={{
                flexGrow: z.fraction,
                flexBasis: 0,
                background: ZONE_COLORS[i] ?? ZONE_COLORS[4],
                transition: 'flex-grow 600ms cubic-bezier(.22,1,.36,1)',
              }}
            />
          ) : null,
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {zones.map((z, i) => (
          <div key={z.zone} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 3,
                height: 12,
                borderRadius: 2,
                background: ZONE_COLORS[i] ?? ZONE_COLORS[4],
                flex: '0 0 auto',
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-ink-2)', width: 20 }}>
              Z{z.zone}
            </span>
            <span style={{ fontSize: 12, color: 'var(--color-muted)', flex: 1 }}>
              {de ? z.name_de : z.name_en}
            </span>
            <span
              style={{ fontSize: 12.5, color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' }}
            >
              {formatHms(z.seconds)}
            </span>
            <span
              style={{
                fontSize: 11.5,
                color: 'var(--color-muted)',
                width: 34,
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {Math.round(z.fraction * 100)}%
            </span>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-muted)', margin: 0 }}>
        {aerobic >= 0.8
          ? de
            ? `Deine Grundlage trägt diese Strecke — nur ${Math.round(hard * 100)} % der Zeit liegt über Tempo.`
            : `Aerobic base carries this route — only ${Math.round(hard * 100)}% of your time sits above tempo.`
          : de
            ? `${Math.round(hard * 100)} % der Zeit über Tempo — das ist keine Grundlagenfahrt.`
            : `${Math.round(hard * 100)}% of the time above tempo — this is not a base ride.`}
        {ftpIsCpFallback && ftpUsedW ? (
          <>
            {' '}
            {de
              ? `Zonen gegen deine CP (${Math.round(ftpUsedW)} W) gerechnet, weil keine FTP hinterlegt ist.`
              : `Zones binned against your CP (${Math.round(ftpUsedW)} W) — no FTP on file.`}
          </>
        ) : null}
      </p>
    </section>
  )
}
