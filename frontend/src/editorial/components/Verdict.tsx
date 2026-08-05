import { isPresent, type Value } from '../data/value'

/**
 * Transcribed from the Trained frame's Verdict block (HqlRE, LdBJ4): vertical,
 * gap 8, alignItems center, width fill_container.
 *   V1 (r1dYcA): "That's the work banked." — Sora 28/800, letterSpacing -1.2,
 *     lineHeight 1.05, textAlign center, fill $e-ink, fixed-width fill_container.
 *   V2 (KJlqp): "You banked it clean. Everything from here is absorption." —
 *     Inter 14/500, lineHeight 1.45, textAlign center, fill $e-mid, fixed-width
 *     width 320.
 *
 * `verdict` on TodayModel is ONE Value<{headline, body}> — TodayPage derives
 * both props from the same underlying Value via mapValue, so they share a
 * missing reason. The missing arm keeps the headline slot as an em dash
 * (the numeral-style placeholder used throughout this file) and prints the
 * reason once, in the body slot — printing it in both slots would make the
 * brief's own test (which asserts the reason text via a single getByText)
 * fail on a duplicate match.
 */
export default function Verdict({
  headline,
  body,
}: {
  headline: Value<string>
  body: Value<string>
}) {
  const headlinePresent = isPresent(headline)
  const bodyPresent = isPresent(body)
  return (
    <div
      data-verdict
      style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', width: '100%' }}
    >
      <p
        style={{
          fontFamily: 'var(--e-display)',
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: -1.2,
          lineHeight: 1.05,
          textAlign: 'center',
          color: 'var(--e-ink)',
          margin: 0,
          width: '100%',
        }}
      >
        {headlinePresent ? headline.value : '—'}
      </p>
      <p
        style={{
          fontFamily: 'var(--e-body)',
          fontSize: 14,
          fontWeight: 500,
          lineHeight: 1.45,
          textAlign: 'center',
          color: 'var(--e-mid)',
          margin: 0,
          width: 320,
          maxWidth: '100%',
        }}
      >
        {bodyPresent ? body.value : body.missing}
      </p>
    </div>
  )
}
