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
 *
 * CORRECTED (coordinator's formal review, finding 3): the missing-arm
 * reason must render at `var(--e-quiet)`, the register every other
 * reason line in this file (MetricTrack, StatTile, InsightStrip) already
 * uses — not `var(--e-mid)`, the body's own normal-state colour. The body
 * `<p>`'s colour is therefore conditional on `bodyPresent`, not fixed.
 *
 * Design pass (2026-08-06): the body paragraph is real coach prose — on
 * Training/Trained it runs to several lines (seen live at 390×844: ~7 lines
 * on a real account). Centred text is fine for a one-line headline but hard
 * to read at paragraph length — the ragged left edge a centred block
 * produces makes every line start at a different point, which is exactly
 * what centring is bad at past a sentence or two. Left-aligned within the
 * same 320px column; the column itself stays centred by its parent
 * (`justifyContent: center` at the call site), so the paragraph still reads
 * as a centred block on the page, just a legible one.
 */
export default function Verdict({
  headline,
  body,
}: {
  /** Omitted where the hero above already carries the statement's headline —
   *  Rest's and Training's hero bodies. An omitted headline renders nothing;
   *  a MISSING one still renders its dash, because that is a reading we
   *  expected and do not have. The two cases are not the same. */
  headline?: Value<string>
  body: Value<string>
}) {
  const headlinePresent = headline != null && isPresent(headline)
  const bodyPresent = isPresent(body)
  return (
    <div
      data-verdict
      style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', width: '100%' }}
    >
      {headline != null && (
        <p
          style={{
            fontFamily: 'var(--e-display)',
            fontSize: 'var(--t-title)',
            fontWeight: 800,
            letterSpacing: -1,
            lineHeight: 1.05,
            textAlign: 'center',
            color: 'var(--e-ink)',
            margin: 0,
            width: '100%',
          }}
        >
          {headlinePresent ? headline.value : '—'}
        </p>
      )}
      <p
        style={{
          fontFamily: 'var(--e-body)',
          fontSize: 'var(--t-body)',
          fontWeight: 500,
          lineHeight: 1.5,
          textAlign: 'left',
          color: bodyPresent ? 'var(--e-mid)' : 'var(--e-quiet)',
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
