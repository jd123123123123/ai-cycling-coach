import type { CSSProperties, ReactNode } from 'react'
import type { DayState } from '../state/dayState'
import { scrimGradient, type ScrimStop } from './plateScrim'

/** Pen-verified per-state Cover heights (`bUuzT` Rest 480, `maOQH` Training
 *  455, `RLLDR` Trained 436) — NOT one shared height; the brief's "height
 *  480" describes Rest's own Cover only. A state with no plate work yet
 *  (Resting, Evening) falls back to Rest's geometry. */
const COVER_HEIGHT: Partial<Record<DayState, number>> = { rest: 480, training: 455, trained: 436 }

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

const layer: CSSProperties = { position: 'absolute', inset: 0, zIndex: -1 }

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
        height: photoUrl ? height : undefined,
        overflow: 'hidden',
        position: 'relative',
        padding: '14px 24px 26px 24px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 22,
        background: photoUrl ? `center / cover no-repeat url(${photoUrl}), var(--e-ground)` : 'var(--e-ground)',
      }}
    >
      {photoUrl && (
        <>
          <div data-photo-layer style={{ ...layer, background: 'var(--e-photo-sat-cover)', mixBlendMode: 'saturation' }} />
          <div data-photo-layer style={{ ...layer, background: 'var(--e-photo-tint-cover)', mixBlendMode: 'color' }} />
        </>
      )}
      <div data-scrim style={{ ...layer, background: scrimGradient(stops) }} />
      {children}
    </div>
  )
}
