import { isPresent, type Value } from '../data/value'
import type { RangeBand } from '../data/useTodayModel'
import { numeralFit } from './numeralFit'

/**
 * The hero's headline metric. Primary geometry transcribed from the Trained
 * frame's own "Metric Track" node (LdBJ4/EK9Nk/cjLpM/ilUFr): value 146px
 * Sora 800, letterSpacing -9, lineHeight 0.86, coloured by the metric's own
 * hue with a glow at the pen's literal alpha (#FF5E0038, ~22% of the hue —
 * no --st-a* stop matches 22% exactly, so the glow uses the generic
 * currentColor-based --a22 token, since it must follow whichever hue the
 * `hue` prop carries, not one fixed source colour).
 *
 * CORRECTED (coordinator's formal review, finding 1): Trained's Metric Track
 * has NO top caption at all — verified at `.../ilUFr/o1NGut/UUEG3`. "SESSION
 * LOAD" is the SECOND LINE OF THE UNIT STACK, sitting to the right of the
 * numeral beneath "TSS" (`t2lXjj`, 14px/800/ls1.5, hue-coloured — the "U"
 * node), at 10px/800/letterSpacing 1.3, `var(--e-mid)` (the "U2" node,
 * `UUEG3`). My first pass misread this as a top caption and passed it as
 * `label`, which rendered ABOVE the numeral — real content relocated to the
 * wrong slot, not just a disagreement about where an empty slot should sit.
 * Confirmed the same shape on Rest's own Metric Track (`88` / `READINESS` /
 * `OUT OF 100`, nothing above the numeral). Fixed by adding `unitSub`, a
 * second line inside the unit stack (gap 3, padding-bottom 20 on the whole
 * stack — matches the pen's `Unit` frame exactly), and making the top
 * caption row (`label`/`state`) render only when `label` is non-empty, so
 * Trained's real call (which has no top caption) can opt out of it instead
 * of rendering an empty line that still ate vertical space.
 *
 * CORRECTED (finding 2): the Value+Unit row's gap is 9, not 20 — read from
 * `ilUFr` itself (the actual Value+Unit container: `gap: 9`), not from
 * `cjLpM` (`gap: 20`, but irrelevant — it wraps only one child, `ilUFr`, so
 * its gap never applies) and not from RangeRow's unrelated root gap. My
 * first pass had the source backwards: the *root* gap (9) came from
 * RangeRow's own top-level gap, which happens to also be 9 and masked the
 * error, while the *Value/Unit row* wrongly took RangeRow's Track-adjacent
 * spacing.
 *
 * Sizing (owner's ruling, 2026-08-05, plan commit f2f35b3 — reversing an
 * earlier `size` prop this task briefly carried; see task-8-report.md):
 * ONE numeral size, 146/-9, on every screen, not a per-screen variant.
 * 146 is a ceiling: Evening's numeral is a clock time ("22:30", five
 * glyphs) that does not fit the 342px content column at 146px, so
 * `numeralFit()` (numeralFit.ts) shrinks fontSize/letterSpacing together,
 * only when the rendered text would not fit — Trained's "98" and every
 * other short numeral stay at the full 146/-9. The statement line above
 * the numeral (42/800, letterSpacing -2) and secondary numerals like
 * Trained's "288" (44/800, letterSpacing -2) are constant across all five
 * frames and are NOT part of this component at all — they don't go
 * through MetricTrack.
 *
 * state/delta/band never co-occur with the big numeral in ANY of the five
 * flagship Cover instances checked (Trained's own TSS metric and Resting's
 * Recovery metric both carry null delta/band) — but this task's own test
 * (brief Step 2) requires all three, and so does component/RangeRow (KT5iR),
 * the pen's canonical smaller (30px) version of this same idea. Where the
 * two disagree on placement/colour, Trained wins (it is the frame this task
 * renders): RangeRow puts its Label top-left in a row layout and its Value
 * in plain $e-ink; here `label` renders as the top caption (RangeRow's
 * position — matches this task's own test, which asserts "HRV" survives the
 * missing arm) but the Value stays hue-tinted, matching Trained's literal
 * colour instead of RangeRow's white. This mixing is a genuine, unresolved
 * disagreement between the two source nodes — flagged in task-8-report.md,
 * not silently picked.
 *
 * Delta and the band's "Mark" both transcribe RangeRow's literal $e-acid.
 * The Track's Base/Band rail reuses RangeRow's own geometry (Base 2px
 * @y5/12, Band 4px rounded @y4/12, both --e-track-*) scaled to fill_container
 * width. RangeRow gives exactly one concrete example of the Mark's position
 * (HRV, position "above", Mark at 236/322 = 73.8% of track width, Band
 * spanning 104-217/322 = 32.3%-67.4%); the pen does not encode a general
 * value-to-position formula. `markPct` below is this task's own
 * interpolation of that one example into a below/in/above rule — the pen
 * does not specify it, so it is not gospel, and a later reader with a
 * second real example should feel free to replace it.
 *
 * CORRECTED (real-data audit, 2026-08-06): the missing-value arm used to be
 * a plain "—" at a manually shrunk 64px — smaller than the 146px present
 * arm, but still ~57×55px on screen: a fat grey rectangle sitting where the
 * day's number belongs, found by running the real app against an account
 * whose wearable hadn't synced in 3 days (the ordinary case a stale-
 * wearable athlete sees, not a rare edge case — see `utils/
 * readinessGate.ts`, which the caller now consults before ever reaching
 * this component). The missing arm is now a composed block — a status dot,
 * a short headline, the fuller reason underneath it, and (only when the
 * gap is actually actionable) a button — never a numeral-shaped glyph. See
 * `missingHeadline`/`missingTone`/`missingAction` below.
 */
/** An action offered alongside a missing numeral — currently only the
 *  readiness gate's 'stale' case ("your watch hasn't synced"), where there
 *  is something the athlete can actually do. Presentational only: the
 *  mutation itself (`useForceSync`, a hook) is owned by the page
 *  (`pages/TodayPage.tsx`) and handed down as this plain callback, the same
 *  pattern `DayRail`'s `onStepSelect`/`onSwapDayType` already follow. */
export interface MetricTrackAction {
  label: string
  onPress: () => void
  pending?: boolean
  done?: boolean
}

export default function MetricTrack({
  label,
  state,
  value,
  unit,
  unitSub,
  delta,
  band,
  hue,
  missingHeadline,
  missingTone = 'quiet',
  missingAction,
}: {
  label: string
  state: string
  value: Value<number>
  unit: string
  unitSub?: string
  delta: number | null
  band: RangeBand | null
  hue: string
  /** A short, composed headline for the missing state — replaces the plain
   *  reason text in that slot, so the missing block reads as a title plus a
   *  calmer detail line (`value.missing`) instead of one run-on sentence.
   *  Falls back to `value.missing` itself when omitted, so every caller
   *  gets the composed treatment (see below) without having to supply one. */
  missingHeadline?: string
  /** 'warn' tints the missing headline/dot amber — pairs with
   *  `missingAction` for an actionable gap (e.g. "your watch hasn't
   *  synced"). 'quiet' (default) is the calm, self-resolving gap with
   *  nothing to do. */
  missingTone?: 'quiet' | 'warn'
  missingAction?: MetricTrackAction
}) {
  const present = isPresent(value)
  const numeralText = present ? String(value.value) : '—'
  const { fontSize, letterSpacing } = present ? numeralFit(numeralText) : { fontSize: 0, letterSpacing: 0 }
  return (
    <div data-metric-track style={{ display: 'flex', flexDirection: 'column', gap: 9, width: '100%' }}>
      {label && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span
            style={{
              fontFamily: 'var(--e-body)',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 1.4,
              color: 'var(--e-mid)',
            }}
          >
            {label}
          </span>
          {state && (
            <span
              style={{
                fontFamily: 'var(--e-body)',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 1.2,
                color: 'var(--e-lo)',
              }}
            >
              {state}
            </span>
          )}
        </div>
      )}
      {present ? (
        <div style={{ display: 'flex', width: '100%', gap: 9, alignItems: 'flex-end' }}>
          <span
            style={{
              fontFamily: 'var(--e-display)',
              fontSize,
              fontWeight: 800,
              letterSpacing,
              lineHeight: 0.86,
              color: hue,
              filter: 'drop-shadow(0 0 44px var(--a22))',
            }}
          >
            {numeralText}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 20 }}>
            <div style={{ display: 'flex', gap: 7, alignItems: 'flex-end' }}>
              <span
                style={{
                  fontFamily: 'var(--e-body)',
                  fontSize: 14,
                  fontWeight: 800,
                  letterSpacing: 1.5,
                  color: hue,
                }}
              >
                {unit}
              </span>
              {delta != null && (
                <span
                  style={{
                    fontFamily: 'var(--e-body)',
                    fontSize: 12,
                    fontWeight: 800,
                    color: 'var(--e-acid)',
                  }}
                >
                  {delta > 0 ? `+${delta}` : delta}
                </span>
              )}
            </div>
            {unitSub && (
              <span
                style={{
                  fontFamily: 'var(--e-body)',
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: 1.3,
                  color: 'var(--e-mid)',
                }}
              >
                {unitSub}
              </span>
            )}
          </div>
        </div>
      ) : (
        // A "—" scaled to the numeral's 146px stopped reading as punctuation
        // and rendered as a filled bar — a fat grey rectangle sitting where
        // the day's headline number belongs, indistinguishable from a
        // broken image (real-data audit, 2026-08-06: found on an account
        // whose wearable hadn't synced in 3 days — the ordinary case, not
        // an edge case). Even shrunk to 64px it still measured ~57×55px.
        // This composed block replaces the numeral's slot with an honest,
        // designed answer instead of an oversized glyph: a small status
        // dot, a short headline (dated when the reason is a stale
        // reading — see `missingHeadline`), the fuller reason underneath,
        // and — only when there's something to actually do about it — an
        // action.
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          {unit && (
            <span
              style={{
                fontFamily: 'var(--e-body)',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 1.4,
                color: 'var(--e-mid)',
              }}
            >
              {unit}
            </span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                flexShrink: 0,
                background: missingTone === 'warn' ? 'var(--e-warn)' : 'var(--e-lo)',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--e-body)',
                fontSize: 19,
                fontWeight: 800,
                letterSpacing: -0.2,
                lineHeight: 1.2,
                color: missingTone === 'warn' ? 'var(--e-warn)' : 'var(--e-ink)',
              }}
            >
              {missingHeadline ?? value.missing}
            </span>
          </div>
          <p
            style={{
              fontFamily: 'var(--e-body)',
              fontSize: 12.5,
              fontWeight: 600,
              lineHeight: 1.45,
              color: 'var(--e-quiet)',
              margin: 0,
            }}
          >
            {missingHeadline ? value.missing : ''}
          </p>
          {missingAction && (
            <button
              type="button"
              onClick={missingAction.onPress}
              disabled={missingAction.pending || missingAction.done}
              style={{
                alignSelf: 'flex-start',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 2,
                padding: '7px 14px',
                borderRadius: 'var(--radius-pill)',
                border: `1px solid ${missingAction.done ? 'var(--s-good)' : 'color-mix(in srgb, var(--e-warn) 45%, transparent)'}`,
                background: missingAction.done
                  ? 'color-mix(in srgb, var(--s-good) 16%, transparent)'
                  : 'color-mix(in srgb, var(--e-warn) 16%, transparent)',
                color: missingAction.done ? 'var(--s-good)' : 'var(--e-warn)',
                opacity: missingAction.pending ? 0.6 : 1,
                fontFamily: 'var(--e-body)',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 0.6,
              }}
            >
              {missingAction.label}
            </button>
          )}
        </div>
      )}
      {present && band && (
        <div style={{ position: 'relative', width: '100%', height: 12 }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 5,
              width: '100%',
              height: 2,
              background: 'var(--e-track-base)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '32%',
              top: 4,
              width: '35%',
              height: 4,
              borderRadius: 2,
              background: 'var(--e-track-band)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: `${markPct(band)}%`,
              top: 0,
              width: 3,
              height: 12,
              background: 'var(--e-acid)',
              boxShadow: '0 0 10px color-mix(in srgb, var(--e-acid) 50%, transparent)',
            }}
          />
        </div>
      )}
    </div>
  )
}

function markPct(band: RangeBand): number {
  if (band.position === 'below') return 10
  if (band.position === 'above') return 74
  return 49.5
}
