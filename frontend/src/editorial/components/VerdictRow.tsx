import { isPresent, type Value } from '../data/value'

/**
 * Mechanic D — verdict row (roadbook, 2026-08-06).
 *
 * Title, then qualifier, then the number: three levels of hierarchy in one
 * row. On the Trainingstag screen this is where the session's name lives —
 * once, instead of in the hero, the section head and the sticky CTA.
 *
 * `accent` is the caller's decision, never the component's. The composed
 * screen has an accent budget of two (roadbook's own finding: seven
 * defensible accents on one screen means none of them reads), and a
 * component that tints itself would spend that budget behind the screen's
 * back. Exactly one VerdictRow on this screen passes it.
 */
export default function VerdictRow({ title, qualifier, value, unit, accent = false }: {
  title: Value<string>
  qualifier: Value<string>
  value: Value<number | string>
  unit: string
  accent?: boolean
}) {
  return (
    <div
      data-verdict-row=""
      style={{ display: 'flex', width: '100%', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <span
          style={{
            fontFamily: 'var(--e-display)', fontSize: 'var(--t-lead)', fontWeight: 800,
            letterSpacing: -0.5, lineHeight: 1.1,
            color: isPresent(title) ? 'var(--e-ink)' : 'var(--e-quiet)',
          }}
        >
          {isPresent(title) ? title.value : '—'}
        </span>
        {isPresent(qualifier) && (
          <span
            style={{
              fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', fontWeight: 500, color: 'var(--e-mid)',
            }}
          >
            {qualifier.value}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexShrink: 0 }}>
        <span
          {...(accent && isPresent(value) ? { 'data-accent': '' } : {})}
          style={{
            fontFamily: 'var(--e-display)', fontSize: 'var(--t-title)', fontWeight: 800,
            letterSpacing: -1, lineHeight: 1,
            color: !isPresent(value) ? 'var(--e-quiet)' : accent ? 'var(--st-active)' : 'var(--e-ink)',
          }}
        >
          {isPresent(value) ? value.value : '—'}
        </span>
        <span
          style={{
            fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 700,
            letterSpacing: 0.8, color: 'var(--e-mid)',
          }}
        >
          {unit}
        </span>
      </div>
    </div>
  )
}
