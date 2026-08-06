import { isPresent, type Value } from '../data/value'

/**
 * Transcribed from component/StatTile (n6Wn8, DbOfI) and its real instance
 * T-LOAD (A5glQf, LdBJ4 "02 The Cost" tiles): width 100, vertical, gap 6.
 * Label 9px Inter 800 letterSpacing 1.6 $e-lo ("LOAD"). Value 34px in the
 * canonical component / 21px in the T-LOAD instance — both Sora 800,
 * letterSpacing -1.4 / -0.8, lineHeight 1, and BOTH instances are $e-ink
 * (plain white), never hue-tinted, so the Value stays $e-ink here too. The
 * third line is $e-lo Inter 800 letterSpacing 0.8: the canonical component
 * shows a $e-acid Delta ("+2 / 7D"); T-LOAD instead shows its Unit ("TSS")
 * at $e-lo. This task's interface carries `unit`, not `delta`, so that
 * third line follows T-LOAD's colour (e-lo), not the canonical's e-acid.
 *
 * No `hue` prop: neither sampled instance colours anything by metric hue —
 * both Label and the third line are $e-lo, both Value are $e-ink. The
 * metric hues (--m-*) belong to MetricTrack, the component that actually
 * applies them in the tree; a `hue` prop here had nothing to transcribe and
 * was removed after review rather than kept as an unused guess.
 *
 * `hideReason` (new prop, Task 10 fix): when a caller renders several
 * tiles that are ALL missing for the exact same reason (Rest's "02
 * ABSORPTION" cost tiles — LOAD/TIME/INTENSITY/POWER, all missing because
 * there is no "last completed session" field at all), printing that one
 * sentence under all four tiles is the same defect `InsightStrip` already
 * fixes for its own row: the reason should print ONCE, not once per tile.
 * `hideReason` lets the tile still show its honest "—" while suppressing
 * its own copy of the reason text, so the caller can print it once below
 * the whole row instead (see `TodayView.tsx`'s "02 ABSORPTION" section).
 *
 * Design pass (2026-08-06): sizes now route through the shared type scale
 * (`tokens.css`) instead of the transcribed literals above. The spec names
 * this component's own value explicitly as the --t-lead (22px) example of
 * "secondary numerals, stat tiles" — the pen's literal 34/21px are folded
 * into that one step rather than kept as a third, tile-specific size.
 */
export default function StatTile({
  label,
  value,
  unit,
  hideReason = false,
}: {
  label: string
  value: Value<number | string>
  unit: string
  hideReason?: boolean
}) {
  const present = isPresent(value)
  return (
    <div data-stat-tile style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 100 }}>
      <span
        style={{
          fontFamily: 'var(--e-body)',
          fontSize: 'var(--t-label)',
          fontWeight: 800,
          letterSpacing: 1.4,
          color: 'var(--e-lo)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--e-display)',
          fontSize: 'var(--t-lead)',
          fontWeight: 800,
          letterSpacing: -0.5,
          lineHeight: 1,
          color: 'var(--e-ink)',
        }}
      >
        {present ? value.value : '—'}
      </span>
      {present && unit && (
        <span
          style={{
            fontFamily: 'var(--e-body)',
            fontSize: 'var(--t-micro)',
            fontWeight: 700,
            letterSpacing: 0.8,
            color: 'var(--e-lo)',
          }}
        >
          {unit}
        </span>
      )}
      {!present && !hideReason && (
        <span
          style={{
            fontFamily: 'var(--e-body)',
            fontSize: 'var(--t-body)',
            fontWeight: 500,
            color: 'var(--e-quiet)',
          }}
        >
          {value.missing}
        </span>
      )}
    </div>
  )
}
