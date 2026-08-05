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
 * `hue` is required by the task interface but is not applied to any text in
 * either sampled instance — it drives a restrained one-pixel accent rule
 * above the label instead, echoing how the pen tints its OTHER hue-bearing
 * numbers (e.g. the Insight Strip's "288 W" session-power figure) rather
 * than inventing an unverified visual. Flagged in task-8-report.md as a
 * genuine gap: no sampled StatTile instance uses `hue` directly.
 */
export default function StatTile({
  label,
  value,
  unit,
  hue,
}: {
  label: string
  value: Value<number | string>
  unit: string
  hue: string
}) {
  const present = isPresent(value)
  return (
    <div data-stat-tile style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 100 }}>
      <div style={{ width: 18, height: 2, borderRadius: 1, background: hue }} />
      <span
        style={{
          fontFamily: 'var(--e-body)',
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: 1.6,
          color: 'var(--e-lo)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--e-display)',
          fontSize: 34,
          fontWeight: 800,
          letterSpacing: -1.4,
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
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: 0.8,
            color: 'var(--e-lo)',
          }}
        >
          {unit}
        </span>
      )}
      {!present && (
        <span
          style={{
            fontFamily: 'var(--e-body)',
            fontSize: 9,
            fontWeight: 600,
            color: 'var(--e-quiet)',
          }}
        >
          {value.missing}
        </span>
      )}
    </div>
  )
}
