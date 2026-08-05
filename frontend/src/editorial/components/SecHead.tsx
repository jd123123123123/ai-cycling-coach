/**
 * The numbered section header, transcribed from pen component rYYq3
 * (component/SecHead V5): a single row, gap 10, alignItems center (the pen
 * schema has no "baseline" — the brief's sketch said baseline, the tree
 * says center). Children: Idx (Sora 12/800, letterSpacing 0.5), Label
 * (Inter 12/800, letterSpacing 1.6), a RuleWrap (height 12, centers a 1px
 * rule) that the brief's sketch did not anticipate but the tree has between
 * the title and the aside, and Meta (Inter 10/800, letterSpacing 0.8).
 *
 * rYYq3 is a generic library component: its fills reference the file's
 * shared placeholder variables ($accent, $text-primary, $text-tertiary),
 * not EDITORIAL II's own tokens. $text-primary (#FFFFFF) is an exact match
 * for --e-ink. $accent (#FF5A3C) and $text-tertiary (#5C6570) have no exact
 * token match; per the architecture already established by EditorialRoot
 * ("one accent per day-state, referenced not branched"), the index uses
 * var(--st-active) rather than a fixed hue, and the meta uses var(--e-quiet)
 * as the closest "muted foreground" semantic.
 *
 * The rule (#FFFFFF1F) is an exact match for --e-rule.
 */
export default function SecHead({ index, title, aside }: {
  index: string
  title: string
  aside?: string
}) {
  return (
    <header style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <span
        style={{
          fontFamily: 'var(--e-display)',
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: 0.5,
          color: 'var(--st-active)',
        }}
      >
        {index}
      </span>
      <h2
        style={{
          fontFamily: 'var(--e-body)',
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: 1.6,
          color: 'var(--e-ink)',
          margin: 0,
        }}
      >
        {title}
      </h2>
      <div style={{ flex: 1, height: 12, display: 'flex', alignItems: 'center' }}>
        <div style={{ width: '100%', height: 1, background: 'var(--e-rule)' }} />
      </div>
      {aside && (
        <span
          style={{
            fontFamily: 'var(--e-body)',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 0.8,
            color: 'var(--e-quiet)',
            whiteSpace: 'nowrap',
          }}
        >
          {aside}
        </span>
      )}
    </header>
  )
}
