import { isPresent, type Value } from '../data/value'

/**
 * The editorial answer to "what have I got today": the photograph carries the
 * mood, and then the numbers carry the fact — set large enough to be read at
 * arm's length, one per line, each with its own hairline. No tiles, no
 * cards, no metaphor to decode. A magazine spread's opening statistics, not
 * a dashboard.
 *
 * The rule that keeps it from becoming a table: exactly ONE row is the lead.
 * It gets the day-state accent and the largest size; every other row is
 * quiet and one step down. Which row leads is decided by the caller (the
 * coach's own reasoning picks it), never by position.
 */
export interface BigNumberRow {
  /** Stable id, and what the caller matches the coach's reasoning against. */
  key: string
  label: string
  /** The figure itself, already formatted — `Value` so a missing reading
   *  renders an em-dash at full size plus its reason, never a fabricated 0. */
  value: Value<{ text: string; unit?: string }>
  /** Small qualifier under the label — "über Bereich", "+6 seit gestern". */
  note?: string
}

export default function BigNumbers({ rows, leadKey }: { rows: BigNumberRow[]; leadKey?: string | null }) {
  if (rows.length === 0) return null
  const leadIndex = Math.max(rows.findIndex((r) => r.key === leadKey), 0)

  return (
    <div data-testid="big-numbers" style={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map((row, i) => {
        const lead = i === leadIndex
        return (
          <div
            key={row.key}
            data-testid="big-number-row"
            data-lead={String(lead)}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 16,
              padding: lead ? '20px 0 18px' : '15px 0 13px',
              borderTop: i === 0 ? 'none' : '1px solid var(--e-rule)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <span
                style={{
                  fontFamily: 'var(--e-body)',
                  fontSize: 'var(--t-label)',
                  fontWeight: 800,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: lead ? 'var(--st-active)' : 'var(--e-quiet)',
                }}
              >
                {row.label}
              </span>
              {row.note != null && (
                <span
                  style={{
                    fontFamily: 'var(--e-body)',
                    fontSize: 'var(--t-micro)',
                    fontWeight: 600,
                    color: 'var(--e-quiet)',
                  }}
                >
                  {row.note}
                </span>
              )}
            </div>

            {isPresent(row.value) ? (
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexShrink: 0 }}>
                <span
                  data-testid="big-number-value"
                  style={{
                    fontFamily: 'var(--e-display)',
                    // The lead figure is the largest thing under the
                    // photograph; the rest step down once and stay there, so
                    // the eye lands in one place instead of scanning.
                    fontSize: lead ? 68 : 40,
                    fontWeight: 800,
                    lineHeight: 0.82,
                    letterSpacing: '-0.045em',
                    color: lead ? 'var(--st-active)' : 'var(--e-ink)',
                  }}
                >
                  {row.value.value.text}
                </span>
                {row.value.value.unit != null && (
                  <span
                    style={{
                      fontFamily: 'var(--e-body)',
                      fontSize: 'var(--t-label)',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--e-quiet)',
                    }}
                  >
                    {row.value.value.unit}
                  </span>
                )}
              </span>
            ) : (
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, maxWidth: 210 }}>
                <span
                  data-testid="big-number-missing"
                  style={{
                    fontFamily: 'var(--e-display)',
                    fontSize: lead ? 68 : 40,
                    fontWeight: 800,
                    lineHeight: 0.82,
                    color: 'var(--e-lo)',
                  }}
                >
                  —
                </span>
                <span
                  style={{
                    fontFamily: 'var(--e-body)',
                    fontSize: 'var(--t-micro)',
                    fontWeight: 600,
                    color: 'var(--e-quiet)',
                    textAlign: 'right',
                  }}
                >
                  {row.value.missing}
                </span>
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
