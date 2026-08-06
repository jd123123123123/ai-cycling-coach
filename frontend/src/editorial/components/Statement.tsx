import { isPresent, type Value } from '../data/value'

/**
 * The Statement claim (shabf/I9sDcQ, lEHMb/nXCwA, Sk59s/G3tt5t — one per
 * numbered section on the Trained flagship): Sora 28/800, letterSpacing
 * -1.2, lineHeight 1.05, $e-ink, padding [16,0,4,0]. The pen's own example
 * strings ("Four blocks. Zero fade.", "Fatigue jumped 14.", "Fitness up 2.
 * Form spent.") are ride-specific mock content, not a fixed source string —
 * callers compute these from real numbers and pass them in as a
 * `Value<string>`; this component only renders the frame + honest-dash arm.
 *
 * `showReason` (default true) lets a caller suppress the reason line when
 * an identical reason is about to print immediately below in a more
 * specific spot — e.g. Trained's own "01 The Session" Statement is only
 * rendered at all (see TodayView) when its claim is present, precisely to
 * avoid a floating "—" whose only explanation sits well below the bars
 * (coordinator review round 2, defect 3).
 */
export default function Statement({ claim, showReason = true }: { claim: Value<string>; showReason?: boolean }) {
  const present = isPresent(claim)
  return (
    <div style={{ padding: '16px 0 4px 0' }}>
      <p
        style={{
          fontFamily: 'var(--e-display)', fontSize: 'var(--t-title)', fontWeight: 800, letterSpacing: -1, lineHeight: 1.05, color: 'var(--e-ink)', margin: 0, width: '100%',
        }}
      >
        {present ? claim.value : '—'}
      </p>
      {!present && showReason && (
        <p style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', fontWeight: 500, color: 'var(--e-quiet)', margin: '8px 0 0 0' }}>
          {claim.missing}
        </p>
      )}
    </div>
  )
}
