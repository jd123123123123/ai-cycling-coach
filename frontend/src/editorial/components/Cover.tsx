import type { CSSProperties, ReactNode } from 'react'
import type { DayState } from '../state/dayState'
import { scrimGradient, type ScrimStop } from './plateScrim'

/** Pen-verified per-state Cover heights (`bUuzT` Rest 480, `maOQH` Training
 *  455, `RLLDR` Trained 436, `k7YRY` Resting 462, task 11's own fresh read
 *  of `h54Rs`; `TEpsw` Evening 486, editorial-II audit a2's own fresh read
 *  of `cx4zJ`) — NOT one shared height; the brief's "height 480" describes
 *  Rest's own Cover only. CORRECTED (coordinator visual review, task 11):
 *  Resting previously fell back to Rest's 480 here, flagged but not fixed
 *  in the original task-11 report — fixed then, per-state rather than a
 *  shared constant. CORRECTED AGAIN (audit a2, 2026-08-06): Evening was
 *  still falling back to Rest's 480 exactly as that doc comment predicted
 *  it would once Evening's own task landed — `cx4zJ`'s Cover is 486, six
 *  pixels taller, not 480. */
const COVER_HEIGHT: Partial<Record<DayState, number>> = { rest: 480, training: 455, trained: 436, resting: 462, evening: 486 }

/** Cover's own Scrim gradient shape differs per state — Training's is a
 *  genuinely different 6-stop shape (`W7LKiJ`) from Rest's and Trained's
 *  shared 5-stop shape (`KV7c4`/`pmXLE`), not an approximation error. Stop
 *  alphas are the pen's own hex, converted to percent (ED→93, C7→78, 24→14,
 *  94→58, FF→100, 1F→12, 6B→42, C4→77). */
const COVER_SCRIM: Partial<Record<DayState, ScrimStop[]>> = {
  rest: [{ pos: 0, alpha: 93 }, { pos: 30, alpha: 78 }, { pos: 55, alpha: 14 }, { pos: 78, alpha: 58 }, { pos: 100, alpha: 100 }],
  trained: [{ pos: 0, alpha: 93 }, { pos: 30, alpha: 78 }, { pos: 55, alpha: 14 }, { pos: 78, alpha: 58 }, { pos: 100, alpha: 100 }],
  training: [
    { pos: 0, alpha: 93 }, { pos: 30, alpha: 78 }, { pos: 50, alpha: 12 },
    { pos: 66, alpha: 42 }, { pos: 82, alpha: 77 }, { pos: 100, alpha: 100 },
  ],
}

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

export interface CoverProps {
  state: DayState
  /** No TodayModel field carries a ride photo today — see task-10.5-report.md.
   *  When absent, the plate keeps its exact geometry and renders the scrim
   *  over `--e-ground` alone, never a stock photo standing in for the
   *  athlete's own ride. */
  photoUrl?: string | null
  children: ReactNode
}

/**
 * The hero's photographic plate (pen "Cover": `bUuzT` Rest, `maOQH`
 * Training, `RLLDR` Trained). A stacked fill — photo, grey desaturation
 * wash, state-tinted colour wash, scrim gradient — behind whatever content
 * is passed as children (the existing Meta/DayRail/Statement/MetricTrack/
 * DayMark hero, unchanged). `clip: true` in the pen → `overflow: hidden`
 * here so the photo never bleeds past the plate's own height.
 *
 * CORRECTED (coordinator visual review, defect 1): the per-state pixel
 * height above is the PHOTO's own envelope — the pen never shows this frame
 * without an image filling it. `TodayModel` carries no photo field (see
 * task-10.5-report.md), so every render today has none, and a fixed 480/
 * 455/436px box with no photo in it read as a layout bug — a large empty
 * void above the content, not a designed plate. Without a photo the frame
 * now collapses to the height its content needs (`height: undefined`, flex
 * column auto-sizing); the scrim still renders full-bleed behind that
 * content via `position: absolute; inset: 0`, which sizes to whatever
 * height the in-flow content resolves to (an out-of-flow absolute child
 * never contributes to its parent's own auto-height calculation, so there
 * is no circular dependency). The fixed height returns the moment a real
 * photo exists.
 *
 * CORRECTED (Audit A1, finding 7): the pen's own root Cover frames
 * (`bUuzT`/`maOQH`/`RLLDR`) carry no `gap` — spacing between Top and Foot
 * comes entirely from `justifyContent: "space_between"`. An earlier pass
 * set `gap: 22` here; removed to match the pen exactly.
 *
 * Design pass (2026-08-06): the pen's own 14px top / 24px side padding is a
 * mock value measured on a monitor — at 390×844 it read as the date/streak
 * row pressed straight against the top of the photo, no air above it at
 * all. Widened to 32px horizontal and 40px above the first line, matching
 * `QuotePlate`/`TomorrowPlate`'s own plates so all three photographic
 * surfaces share one inset rule rather than three slightly different ones.
 *
 * CORRECTED (design pass, live verification): the extra top padding pushed
 * REAL content (Training's own temperature/wind row, seen live against the
 * real account) past the fixed per-state height — `overflow: hidden` was
 * silently clipping the bottom of the hero instead of showing it. The pen's
 * per-state numbers are a photo ENVELOPE, not a content budget the design
 * pass gets to shrink into; `height` is now `minHeight` so the box grows to
 * fit whatever the real content needs and never eats it. The photo layer
 * still fills the box exactly (`inset: 0` on an absolutely-positioned
 * layer tracks the parent's actual, possibly-taller size automatically),
 * so a state with more content simply shows a little more photo, never
 * less — `overflow: hidden` stays only to keep the photo from bleeding past
 * whichever height that turns out to be.
 */
export default function Cover({ state, photoUrl, children }: CoverProps) {
  const height = COVER_HEIGHT[state] ?? COVER_HEIGHT.rest!
  const stops = COVER_SCRIM[state] ?? COVER_SCRIM.rest!

  return (
    <div
      data-cover
      data-hero
      style={{
        width: '100%',
        minHeight: photoUrl ? height : undefined,
        overflow: 'hidden',
        position: 'relative',
        padding: '40px 32px 26px 32px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: 'var(--e-ground)',
        isolation: 'isolate',
      }}
    >
      {photoUrl && (
        <>
          <div data-photo style={{ ...photoLayer, background: `center / cover no-repeat url(${photoUrl})` }} />
          <div data-photo-layer style={{ ...satLayer, background: 'var(--e-photo-sat-cover)', mixBlendMode: 'saturation' }} />
          <div data-photo-layer style={{ ...tintLayer, background: 'var(--e-photo-tint-cover)', mixBlendMode: 'color' }} />
        </>
      )}
      <div data-scrim style={{ ...scrimLayer, background: scrimGradient(stops) }} />
      {children}
    </div>
  )
}
