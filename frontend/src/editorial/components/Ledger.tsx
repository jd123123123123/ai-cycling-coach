import { isPresent, type Value } from '../data/value'

export interface LedgerRow { label: string; value: Value<string> }

/**
 * Transcribed from Evening's own "Ledger" node (`h68eS`, pen `KYS6e`/
 * `cx4zJ`): a caption ("WHERE IT WENT"), a stacked horizontal bar (Ride/
 * Moving/Basal segments in the depth ramp), then a 3-column legend (dot +
 * name + value). The pen's own bar/legend describe a same-day calorie
 * breakdown — Ride / Daily Movement / At Rest — which `TodayModel` cannot
 * source in full: no hook anywhere returns a daily energy split. This
 * component itself stays generic (`rows: { label; value }[]`, matching the
 * brief's own interface) so it renders whatever real facts a caller has —
 * on the real Evening screen that is `ActivityRead.calories` for the ride
 * row and an honest gap for the other two (see `TodayView.tsx`).
 *
 * The stacked bar and per-row coloured dot are dropped: the pen's segments
 * are PROPORTIONAL to three numbers, and drawing a bar for data that is
 * mostly absent (two of three rows always missing today) would be exactly
 * the "plausible substitute" this whole system refuses to render. A plain
 * label/value list keeps the frame honest without inventing proportions
 * that don't exist.
 *
 * Where several rows share the exact same missing reason (Daily Movement
 * and At Rest both have no source at all, ever), that reason prints once
 * below the whole list, not once per row — the same rule `InsightStrip` and
 * `StatTile`'s `hideReason` already follow.
 */
export default function Ledger({ caption, rows }: { caption?: string; rows: LedgerRow[] }) {
  const reasons = [...new Set(
    rows
      .map((r) => r.value)
      .filter((v): v is { missing: string } => !isPresent(v))
      .map((v) => v.missing),
  )]

  return (
    <div data-ledger style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 11 }}>
      {caption && (
        <span
          style={{
            fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800, letterSpacing: 1.4, color: 'var(--e-lo)',
          }}
        >
          {caption}
        </span>
      )}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((row) => {
          const value = row.value
          const present = isPresent(value)
          return (
            <div
              key={row.label}
              data-ledger-row
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
            >
              <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800, letterSpacing: 1, color: 'var(--e-lo)' }}>
                {row.label}
              </span>
              <span
                style={{
                  fontFamily: 'var(--e-display)', fontSize: 'var(--t-lead)', fontWeight: 800, letterSpacing: -0.5, lineHeight: 1,
                  color: present ? 'var(--e-ink)' : 'var(--e-quiet)',
                }}
              >
                {present ? value.value : '—'}
              </span>
            </div>
          )
        })}
      </div>
      {reasons.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {reasons.map((reason) => (
            <span key={reason} style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', fontWeight: 500, color: 'var(--e-quiet)' }}>
              {reason}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
