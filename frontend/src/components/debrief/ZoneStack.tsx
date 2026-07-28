/**
 * ZoneStack — time-in-zones as ONE segmented bar plus a compact legend.
 *
 * Replaces the pattern both the power-zone and heart-rate cards used: N stacked
 * rows, each a full-width track with a short fill. That layout costs ~9px per
 * zone plus gaps (about 100px for five zones), and it answers "how much time in
 * Z2?" while making the question a rider actually asks — "what SHAPE was this
 * ride?" — surprisingly hard, because comparing five separately-scaled bars is
 * a reading task rather than a glance.
 *
 * One bar segmented by proportion answers the shape question instantly, in a
 * third of the height, and it is how every current training platform draws this.
 * The legend keeps the exact times, so no precision is lost.
 *
 * Zero-time zones are dropped from the bar (a 0%-wide segment is invisible
 * anyway) but kept out of the legend too — listing "Z5 0:00 0%" four times is
 * noise that buries the two zones the ride actually used.
 */

import { zoneSegmentWidths, fmtZoneClock } from '../../utils/zoneStack'

export interface ZoneDatum {
  /** Short label, e.g. "Z2". */
  label: string
  /** Human name, e.g. "Grundlage". */
  name: string
  color: string
  /** Seconds in this zone. */
  seconds: number
}

export default function ZoneStack({ zones, caption, hardLabel }: {
  zones: ZoneDatum[]
  /** Small right-aligned note, e.g. how the zones were derived. */
  caption?: string
  /** Optional summary line under the legend. */
  hardLabel?: string
}) {
  const used = zones.filter((z) => z.seconds > 0)
  const total = used.reduce((a, z) => a + z.seconds, 0)
  if (used.length === 0 || total <= 0) return null
  const widths = zoneSegmentWidths(used.map((z) => z.seconds))

  return (
    <div className="flex flex-col gap-3">
      {caption && (
        <div className="flex justify-end">
          <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-muted)' }}>{caption}</span>
        </div>
      )}

      {/* The bar. Segments butt together with a 2px gap so the boundaries read
          without needing borders. */}
      <div
        className="flex w-full overflow-hidden"
        style={{ height: 22, borderRadius: 8, gap: 2, background: 'var(--color-surface-3)' }}
        role="img"
        aria-label={used.map((z) => `${z.label} ${z.name} ${fmtZoneClock(z.seconds)}`).join(', ')}
      >
        {used.map((z, i) => (
          <div
            key={z.label}
            style={{
              width: `${widths[i]}%`,
              background: z.color,
              borderRadius: 3,
              // A faint top highlight gives the flat fill a little depth
              // without turning it into a gradient that muddies the colour.
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
            }}
          />
        ))}
      </div>

      {/* Legend — only zones with real time, biggest first, so the ride's
          character is the first thing read. */}
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {[...used]
          .map((z, i) => ({ z, pct: widths[i] }))
          .sort((a, b) => b.z.seconds - a.z.seconds)
          .map(({ z }) => (
            <span key={z.label} className="inline-flex items-center gap-1.5">
              <span style={{ width: 8, height: 8, borderRadius: 2, background: z.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 800, color: z.color }}>{z.label}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-2)' }}>{z.name}</span>
              <span className="num-mono" style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-ink)' }}>{fmtZoneClock(z.seconds)}</span>
              <span className="num-mono" style={{ fontSize: 10.5, color: 'var(--color-muted)' }}>{Math.round((z.seconds / total) * 100)}%</span>
            </span>
          ))}
      </div>

      {hardLabel && (
        <span style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>{hardLabel}</span>
      )}
    </div>
  )
}
