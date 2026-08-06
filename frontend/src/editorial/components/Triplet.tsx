import { isPresent, type Value } from '../data/value'

/**
 * Mechanic C — label-over-value triplet (roadbook, 2026-08-06).
 *
 * Three facts in one 62px band between hairlines, aligned left / centre /
 * right. Replaces three stacked StatTiles and the scroll they cost, and is
 * what lets the Trainingstag screen state Fitness, Form and Belastung once
 * instead of spreading them across an Insight Strip, a tile row and a
 * coach paragraph.
 *
 * A missing cell renders its dash in place and stays silent about why —
 * reason dedupe is a screen-wide job (the design pass measured the same
 * sentence printed three times on one screen), so the caller prints it once
 * at its first occurrence.
 */
export default function Triplet({ cells }: { cells: { label: string; value: Value<string>; unit?: string }[] }) {
  return (
    <div data-triplet="" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <div data-triplet-rule="" style={{ width: '100%', height: 1, background: 'var(--e-hairline)' }} />
      <div style={{ display: 'flex', width: '100%', padding: '14px 0' }}>
        {cells.map((cell, i) => (
          <div
            key={cell.label}
            data-triplet-cell=""
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              alignItems: i === 0 ? 'flex-start' : i === cells.length - 1 ? 'flex-end' : 'center',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800,
                letterSpacing: 1.4, color: 'var(--e-lo)',
              }}
            >
              {cell.label}
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span
                style={{
                  fontFamily: 'var(--e-display)', fontSize: 'var(--t-lead)', fontWeight: 800,
                  letterSpacing: -0.5, lineHeight: 1,
                  color: isPresent(cell.value) ? 'var(--e-ink)' : 'var(--e-quiet)',
                }}
              >
                {isPresent(cell.value) ? cell.value.value : '—'}
              </span>
              {cell.unit && (
                <span
                  style={{
                    fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 700,
                    letterSpacing: 0.8, color: 'var(--e-mid)',
                  }}
                >
                  {cell.unit}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div data-triplet-rule="" style={{ width: '100%', height: 1, background: 'var(--e-hairline)' }} />
    </div>
  )
}
