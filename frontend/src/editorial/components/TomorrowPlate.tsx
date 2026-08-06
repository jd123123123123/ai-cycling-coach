import type { CSSProperties } from 'react'
import { isPresent, type Value } from '../data/value'
import type { DayState } from '../state/dayState'
import { scrimGradient, type ScrimStop } from './plateScrim'

/** Tomorrow Plate / Route Plate's Scrim shape is identical across all three
 *  states — only `--e-ground` (rebound per state) differs. Stops: 08→3%,
 *  33→20%, E0→88%, FF→100%. */
const PLATE_SCRIM: ScrimStop[] = [
  { pos: 0, alpha: 3 }, { pos: 42, alpha: 20 }, { pos: 78, alpha: 88 }, { pos: 100, alpha: 100 },
]

/**
 * The photographic stack, bottom to top: photo, saturation blend, colour
 * blend, scrim — then the plate's own content, which sits above all of them
 * simply by being in flow.
 *
 * Two things make this work. The photo is its OWN layer rather than the
 * parent's `background`, because `mix-blend-mode` composites an element
 * against its backdrop and a blend layer cannot act on the background of its
 * own parent — that was the bug: the pen's desaturated, olive-tinted
 * photography rendered as raw full-colour stock. And `isolation: isolate` on
 * the parent contains the blending inside the plate rather than letting it
 * reach the page beneath.
 *
 * The layers are all negative-z so in-flow content paints over them without
 * needing a wrapper (a `display: contents` wrapper generates no box, so it
 * cannot carry a z-index at all).
 */
const photoLayer: CSSProperties = { position: 'absolute', inset: 0, zIndex: -4 }
const satLayer: CSSProperties = { position: 'absolute', inset: 0, zIndex: -3 }
const tintLayer: CSSProperties = { position: 'absolute', inset: 0, zIndex: -2 }
const scrimLayer: CSSProperties = { position: 'absolute', inset: 0, zIndex: -1 }
const kickerStyle: CSSProperties = { fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800, letterSpacing: 1.4 }
const captionStyle: CSSProperties = { fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800, letterSpacing: 1.2 }
const reasonStyle: CSSProperties = { fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', fontWeight: 500, color: 'var(--e-quiet)', margin: '8px 0 0 0' }

export interface TomorrowPlateProps {
  state: DayState
  /** e.g. "TOMORROW · 05:00" (Rest/Trained) or "TODAY · 17:30" (Training's
   *  Route Plate) — assembled by the caller since TodayModel has no source
   *  for a session's own start time; almost always missing today. */
  kickerLeft: Value<string>
  /** e.g. "THRESHOLD" or "SUNSET 21:14". */
  kickerRight: Value<string>
  title: Value<string>
  /** e.g. "40 KM · 640 M" — route distance/elevation; TodayModel has no
   *  route data anywhere, so this is honestly missing on every screen today. */
  captionLeft: Value<string>
  /** e.g. "TODAY MAKES IT POSSIBLE" or, for Training's Route Plate, a real
   *  interval summary derived from the session's own blocks. */
  captionRight: Value<string>
  /** No TodayModel photo field — see Cover's own doc comment. */
  photoUrl?: string | null
  /** ONE already-translated sentence covering the gap, shown only when the
   *  plate has SOME real content but not all of it (see the block comment
   *  below). The caller supplies the exact wording (`i18n/copy.ts`'s
   *  `tomorrowPlateGap`/`routePlateGap`) rather than this component
   *  concatenating each missing field's own reason — a plate with three or
   *  four permanently-empty fields (the norm here; several are gaps
   *  TodayModel will never fill, not transient ones) reading as three or
   *  four stacked apologies is worse than one calm sentence. */
  gapReason?: string
}

/**
 * The photographic plate that closes Rest's and Trained's sections
 * ("Tomorrow Plate": `WUjdn` Rest, `hODVO` Trained) and Training's own
 * session-of-today variant ("Route Plate": `hQVuk`) — identical geometry,
 * different copy register (tomorrow's plan vs. today's own ride). 246 tall
 * in the pen, but — same correction as `Cover`/`QuotePlate` — that height
 * is the photo's own envelope; without one the plate collapses to its
 * content's height (coordinator visual review, defect 1).
 *
 * CORRECTED (coordinator visual review, round 2 — task 10.6): most of this
 * plate's five fields are PERMANENT gaps (no start time, no sunset, no
 * route data — TodayModel carries none of these anywhere, ever, not just
 * today), so on a typical render only one or two of five fields are real.
 * The previous version dashed every missing slot AND joined every distinct
 * reason into one paragraph — on Rest, that read as a lone floating "—"
 * for the (almost always empty) headline, followed by a wall of three
 * concatenated apologies, directly ABOVE `TomorrowBand`, which shows the
 * same tomorrow session cleanly. Two rules now:
 *  - No content at all (every field missing) → render nothing. The
 *    frame isn't lost — `TomorrowBand`, one section down, still carries
 *    tomorrow (Rest/Training) or the whole plate simply has nothing to add
 *    (Trained, which has no Band fallback but also nothing left unsaid).
 *  - Some content → render exactly what's real, quietly (no dash) for
 *    whatever's missing, and print `gapReason` — ONE sentence — instead of
 *    a per-field reason list. Matches the register `InsightStrip`'s label
 *    row and the absorption tiles already use: the frame stays, and a gap
 *    gets ONE quiet explanation, not several.
 *
 * Design pass (2026-08-06): inset widened to 32px horizontal / 40px above
 * the first line, matching `Cover`/`QuotePlate` — one rule for every
 * photographic surface. `title` now reads at `--t-title` (34px, was 26),
 * the same "one bold sentence" step `Statement`/`QuotePlate` use, since this
 * plate's title plays the identical editorial role (a short, real sentence
 * about tomorrow's ride) just on a different surface. `height` → `minHeight`
 * for the same reason as `Cover.tsx`'s own fix — 246 is the photo's
 * envelope, not a hard content budget a longer real title should be clipped
 * into.
 */
export default function TomorrowPlate({
  state, kickerLeft, kickerRight, title, captionLeft, captionRight, photoUrl, gapReason,
}: TomorrowPlateProps) {
  const fields = [kickerLeft, kickerRight, title, captionLeft, captionRight]
  const hasAnyContent = fields.some(isPresent)
  const hasGap = fields.some((f) => !isPresent(f))

  if (!hasAnyContent) return null

  return (
    <div
      data-tomorrow-plate
      data-day-state={state}
      style={{
        width: '100%',
        minHeight: photoUrl ? 246 : undefined,
        overflow: 'hidden',
        position: 'relative',
        // CORRECTED (coordinator visual review, task 11): with a photo, the
        // 246px box's own empty top space (content bottom-anchored via
        // `justifyContent: flex-end`) is what separates this plate from
        // whatever precedes it — Resting's own "02 Trajectory" ends in
        // `PMCChart`'s legend row with zero gap of its own (confirmed: no
        // spacer node sits between `r9ejSt` and `swkhP` in `h54Rs`). Without
        // a photo this plate collapses to its content's height (Cover's own
        // doc comment explains why), which silently threw away that
        // breathing room too — the legend and this plate's "MORGEN · 05:00"
        // kicker rendered as one collided line. 40px restores it (and then
        // some, per the design pass above) without reintroducing a fixed box
        // — now the same top inset with or without a photo, so this is no
        // longer a two-branch ternary.
        padding: '40px 32px 18px 32px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        background: 'var(--e-ground)',
        isolation: 'isolate',
      }}
    >
      {photoUrl && (
        <>
          <div data-photo style={{ ...photoLayer, background: `center / cover no-repeat url(${photoUrl})` }} />
          <div data-photo-layer style={{ ...satLayer, background: 'var(--e-photo-sat-plate)', mixBlendMode: 'saturation' }} />
          <div data-photo-layer style={{ ...tintLayer, background: 'var(--e-photo-tint-plate)', mixBlendMode: 'color' }} />
        </>
      )}
      <div data-scrim style={{ ...scrimLayer, background: scrimGradient(PLATE_SCRIM) }} />

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ ...kickerStyle, color: 'var(--st-active)' }}>{isPresent(kickerLeft) ? kickerLeft.value : ''}</span>
          <span style={{ ...kickerStyle, color: 'var(--e-mid)' }}>{isPresent(kickerRight) ? kickerRight.value : ''}</span>
        </div>

        {isPresent(title) && (
          <p
            style={{
              margin: 0, fontFamily: 'var(--e-display)', fontSize: 'var(--t-title)', fontWeight: 800,
              letterSpacing: -1, lineHeight: 1.05, color: 'var(--e-ink)',
            }}
          >
            {title.value}
          </p>
        )}

        <div style={{ width: '100%', height: 1, background: 'var(--e-rule-strong)' }} />

        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <span style={{ ...captionStyle, color: 'var(--e-ink)' }}>{isPresent(captionLeft) ? captionLeft.value : ''}</span>
          <span style={{ ...captionStyle, color: 'var(--st-active)' }}>{isPresent(captionRight) ? captionRight.value : ''}</span>
        </div>

        {hasGap && gapReason && <p data-plate-reason style={reasonStyle}>{gapReason}</p>}
      </div>
    </div>
  )
}
