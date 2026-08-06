/**
 * Mechanic A — headline as divider (roadbook, 2026-08-06).
 *
 * The section name in uppercase 800 over a hairline, doing the structural
 * job SecHead's numbered header bar was charging ~56px for. No index, no
 * chip, no "see all". SecHead itself is untouched and still heads every
 * numbered section on every other Today state; this is the Trainingstag
 * screen's own lighter head.
 */
export default function RuleHead({ title }: { title: string }) {
  return (
    <div data-rule-head="" style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
      <span
        style={{
          fontFamily: 'var(--e-body)',
          fontSize: 'var(--t-label)',
          fontWeight: 800,
          letterSpacing: 1.6,
          lineHeight: 1.2,
          color: 'var(--e-mid)',
        }}
      >
        {title}
      </span>
      <div data-rule-head-line="" style={{ width: '100%', height: 1, background: 'var(--e-hairline)' }} />
    </div>
  )
}
