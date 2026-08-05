import { isPresent, type Value } from '../data/value'

/**
 * Transcribed from the Trained frame's Insight Strip (fGuE1, LdBJ4):
 * padding [26,24,0,24], width fill_container. Caption Row: "TODAY IN THREE
 * NUMBERS" — Inter 9/800, letterSpacing 1.7, fill $e-quiet (#767D87 exact).
 * 11px gap, a $e-rule divider, 15px gap, then Signals: 3 columns, gap 16,
 * each Value 22px Sora 800 letterSpacing -0.9 lineHeight 1, Label 8.5px
 * Inter 800 letterSpacing 0.9 lineHeight 1.32 (fixed-width-height, height
 * 23) fill $e-quiet.
 *
 * NOT transcribed: each signal's 11-bar sparkline + target line (VQUPR/
 * PDQ5w/Q6WXdy) and the session-power signal's hue-tinted Value (#FF5E00,
 * the only one of the three that isn't $e-ink). Both require an 11-point
 * historical series per metric and a per-item hue, and this task's own
 * interface — `{ items: { label; value: Value<string> }[] }` — carries
 * neither. Flagged in task-8-report.md; every item's Value renders $e-ink.
 *
 * Missing-arm fix (coordinator review): the label slot must NEVER be
 * substituted with the missing reason — that was the one place in this
 * task that broke the system's own rule ("the frame always stays: labels
 * and rails intact, the reason is an ADDITIONAL quiet line"), which
 * `MetricTrack` and `StatTile` both already follow correctly. The pen's
 * Label slot is fixed-height 23px for an 8.5px/lineHeight1.32 two-line
 * caption ("A NEW 12-MINUTE RECORD" etc.) — a full sentence dropped into
 * that slot overflows it and collides with whatever sits below (the
 * TabBar, in this hero). So: `item.label` always renders, at that fixed
 * height; distinct missing reasons print once each, below the whole row,
 * in the same 12px/600 `var(--e-quiet)` register `MetricTrack` uses for
 * its own reason line (`MetricTrack.tsx`'s `!present` paragraph).
 */
export default function InsightStrip({
  items,
}: {
  items: { label: string; value: Value<string> }[]
}) {
  const reasons = [...new Set(
    items
      .map((i) => i.value)
      .filter((v): v is { missing: string } => !isPresent(v))
      .map((v) => v.missing),
  )]

  return (
    <section
      data-insight-strip
      style={{ width: '100%', display: 'flex', flexDirection: 'column', padding: '26px 24px 0 24px' }}
    >
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            fontFamily: 'var(--e-body)',
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: 1.7,
            color: 'var(--e-quiet)',
          }}
        >
          TODAY IN THREE NUMBERS
        </span>
      </div>
      <div style={{ height: 11 }} />
      <div style={{ width: '100%', height: 1, background: 'var(--e-rule)' }} />
      <div style={{ height: 15 }} />
      <div style={{ width: '100%', display: 'flex', gap: 16 }}>
        {items.map((item) => {
          const itemValue = item.value
          const present = isPresent(itemValue)
          return (
            <div key={item.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span
                style={{
                  fontFamily: 'var(--e-display)',
                  fontSize: 22,
                  fontWeight: 800,
                  letterSpacing: -0.9,
                  lineHeight: 1,
                  color: 'var(--e-ink)',
                }}
              >
                {present ? itemValue.value : '—'}
              </span>
              <span
                style={{
                  fontFamily: 'var(--e-body)',
                  fontSize: 8.5,
                  fontWeight: 800,
                  letterSpacing: 0.9,
                  lineHeight: 1.32,
                  color: 'var(--e-quiet)',
                  height: 23,
                }}
              >
                {item.label}
              </span>
            </div>
          )
        })}
      </div>
      {reasons.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 10 }}>
          {reasons.map((reason) => (
            <span
              key={reason}
              style={{
                fontFamily: 'var(--e-body)',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--e-quiet)',
              }}
            >
              {reason}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}
