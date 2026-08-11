import { isPresent, type Value } from '../data/value'

/**
 * A chapter's claim, split into a hook and its support.
 *
 * `Statement` renders the whole claim at `--t-title` (34/800). That is right
 * for the one-sentence claims it was built for, and wrong here: measured at
 * 390×844, this deck's claims ran to five lines of 34px type — a wall that
 * reads as shouting rather than as emphasis, and that leaves the reader no
 * entry point because every word is weighted the same.
 *
 * So the first sentence carries the weight and the rest drops to body size.
 * Nothing is lost and nothing is rewritten; the hierarchy is just made
 * explicit. A hook is almost always one short line — "Hold your taper." — and
 * two lines at most, which is the size 34px was specified for.
 *
 * No new type steps: the hook is `--t-title`, or `--t-lead` on the rare claim
 * whose first sentence is itself long, and the support is `--t-body`. The
 * seven-step scale stays seven steps.
 */
export default function Claim({ claim, showReason = true }: { claim: Value<string>; showReason?: boolean }) {
  if (!isPresent(claim)) {
    return (
      <div style={{ padding: '16px 0 4px' }}>
        <p style={{ fontFamily: 'var(--e-display)', fontSize: 'var(--t-title)', fontWeight: 800, letterSpacing: -1, lineHeight: 1.05, color: 'var(--e-ink)', margin: 0 }}>
          —
        </p>
        {showReason && (
          <p style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', fontWeight: 500, color: 'var(--e-quiet)', margin: '8px 0 0' }}>
            {claim.missing}
          </p>
        )}
      </div>
    )
  }

  const text = claim.value.trim()
  const cut = text.indexOf('. ')
  const hook = cut > 0 ? text.slice(0, cut + 1) : text
  const support = cut > 0 ? text.slice(cut + 2) : ''

  return (
    <div style={{ padding: '16px 0 4px' }}>
      <p
        data-testid="claim-hook"
        style={{
          fontFamily: 'var(--e-display)',
          fontSize: hook.length > 56 ? 'var(--t-lead)' : 'var(--t-title)',
          fontWeight: 800, letterSpacing: -1, lineHeight: 1.05,
          color: 'var(--e-ink)', margin: 0,
        }}
      >
        {hook}
      </p>
      {/* --e-ink, not --e-mid: the support is still part of the claim, and the
          evidence prose that follows it on most chapters is already --e-mid.
          Two grey paragraphs in a row read as one undifferentiated block —
          this makes the ladder three steps (bold hook, plain support, quiet
          evidence) using only two type sizes. */}
      {support && (
        <p style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', fontWeight: 500, lineHeight: 1.5, color: 'var(--e-ink)', margin: '10px 0 0' }}>
          {support}
        </p>
      )}
    </div>
  )
}
