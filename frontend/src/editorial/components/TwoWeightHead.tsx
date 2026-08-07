/**
 * Mechanics B + K — two-weight headline with one accent word (roadbook,
 * 2026-08-06).
 *
 * One size, two weights, two values: hierarchy without spending a type
 * step, which matters on a branch that just fought its way down to seven.
 * The emphasis carries the screen's first of two accents; the second is
 * the one number, on VerdictRow.
 */
export default function TwoWeightHead({ lead, emphasis }: { lead: string; emphasis: string | null }) {
  return (
    <p
      data-two-weight-head=""
      style={{
        fontFamily: 'var(--e-display)',
        fontSize: 'var(--t-hero)',
        lineHeight: 1.05,
        letterSpacing: -2,
        margin: 0,
        width: '100%',
        // The Day Mark is absolutely positioned at the Cover's top right;
        // a headline running the full column slides straight under it.
        paddingRight: 46,
      }}
    >
      <span style={{ fontWeight: 500, color: 'var(--e-mid)' }}>{lead}</span>
      {emphasis && (
        <>
          {' '}
          <span data-accent="" style={{ fontWeight: 800, color: 'var(--st-active)' }}>{emphasis}</span>
        </>
      )}
    </p>
  )
}
