import { Moon } from 'lucide-react'
import type { DayState } from '../state/dayState'

/**
 * Transcribed from the Trained frame's own Day Mark (F6851 -> aeQNb "Glyph
 * Disc", LdBJ4): a 34x34 solid disc, fill var(--st-active), 18px outer glow
 * at var(--st-a28) (#FF5E0047 exact match). The pen's own comment on this
 * node — "Silhouette carries the day type so it never depends on colour
 * alone" — and Resting's distinct silhouette (RzWNl -> nFyR6 "Glyph Trough":
 * innerRadius 0.58, startAngle 30, sweepAngle -240, plus a rocking-loop
 * animation) confirm every state gets its own shape, not just its own hue.
 *
 * Task 8 only transcribed Trained's disc. This task (10) adds Rest's and
 * Training's own silhouettes:
 *
 * Rest — "Glyph Crescent" (un3SU, `RYP0r`): a `path` node, viewBox
 * [0,0,20,40], rendered at 16x32, fill the state accent, 20px outer glow at
 * `#C8FF0040` (var(--st-a28) — close enough to the pen's own 0x40 ≈ 25%
 * alpha that this file's existing a28 token, already 28%, is reused rather
 * than adding a near-duplicate a25 stop), rotated -16°. Its own `geometry`
 * field in the tree is a literal `"..."` — a placeholder, not real path
 * data (confirmed by reading the raw node twice). A first pass here hand-
 * derived a two-arc crescent path from the viewBox/rotation alone; it
 * type-checked and rendered an empty `<path>` (`getBBox()` returned `{}` —
 * a degenerate, self-cancelling shape, caught only by actually looking at
 * the harness render, not by any static gate). Replaced with lucide-react's
 * own `Moon` glyph (already this project's icon dependency) — a real,
 * renders-every-time crescent — rather than keep debugging invented arc
 * math for a shape the pen never actually specified. Flagged in
 * task-10-report.md.
 *
 * Training — "Glyph Arch" (DlHqX, `x4AxA5`): an `ellipse` ring segment,
 * innerRadius 0.58, startAngle -30°, sweepAngle 240° (so it sweeps from
 * -30° to 210°), 34x34, fill the state accent, 18px outer glow at
 * `#2BE68F40` (var(--st-a28), same alpha reasoning as Rest's). Drawn here
 * as an SVG arc ring rather than the pen's own ellipse-with-innerRadius
 * primitive, which has no direct DOM/CSS equivalent.
 *
 * Both frames' own `context` fields describe idle motion (a breathing
 * rotate for Rest, a self-drawing sweep + gentle bob for Training) — not
 * implemented here, matching Trained's own disc (no motion) and this
 * project's build-gate posture (`no-playwright-be-frugal`): a static glyph
 * is the transcribed shape; animating it is a separate concern this task
 * does not take on.
 *
 * Resting — "Glyph Trough" (`RzWNl`/`nFyR6`, `h54Rs`): an `ellipse` ring
 * segment, innerRadius 0.58, startAngle 30°, sweepAngle -240° — a 240°
 * span ending at 30° - 240° = -210°, drawn here as `archRingPath(...,
 * -210, 30)` (start/end swapped to keep the helper's own "end > start"
 * assumption, same 240° arc either way), 34x34, fill the state accent, 18px
 * outer glow at `#00E5FF40` (var(--st-a28), same alpha reasoning as Rest's
 * and Training's own glyphs). The pen's own `context` field on this node
 * describes an idle "rocking to rest" loop (rotate -7°→+7°→-7°, 5s
 * ease-in-out) — not implemented here, matching Trained's disc and
 * Training's arch (no motion; a static glyph is the transcribed shape).
 *
 * Evening — "Glyph Setting Disc" (`BQWNf`/`LMcU8`/`PHs8H`+`N7Hx9`, pen
 * `KYS6e`): a 24x24 disc clipped by a 24x12 window (`Sky`, positioned
 * 5/10 inside the 34x34 mark) so only its top half shows above a 34x2
 * `Horizon` bar beneath it — a sun/moon setting behind a line, both in the
 * state accent. The pen's own `context` on the disc describes a one-shot
 * mount animation (translateY -9px -> 0 over 1200ms) that sinks it behind
 * the horizon; not implemented here, matching every other state's static
 * glyph (see the file-level note above on this project's build-gate
 * posture). Read once, 2026-08-05 — the newer `cx4zJ` (IMAGERY) variant of
 * the Evening frame does not carry a Day Mark node at all inside its own
 * Cover, so this may since have been dropped from the design; kept here
 * for parity with every other day state until a fresh pen read says
 * otherwise (see task-14-report.md).
 */
export default function DayMark({ state }: { state: DayState }) {
  if (state === 'evening') {
    return (
      <div data-day-mark data-day-mark-state={state} style={{ width: 34, height: 34, position: 'relative' }}>
        <div style={{ position: 'absolute', left: 5, top: 10, width: 24, height: 12, overflow: 'hidden' }}>
          <div
            style={{
              width: 24, height: 24, borderRadius: '50%', background: 'var(--st-active)',
              boxShadow: '0 0 18px var(--st-a28)',
            }}
          />
        </div>
        <div style={{ position: 'absolute', left: 0, top: 22, width: 34, height: 2, borderRadius: 1, background: 'var(--st-active)' }} />
      </div>
    )
  }

  if (state === 'resting') {
    return (
      <div data-day-mark data-day-mark-state={state} style={{ width: 34, height: 34, filter: 'drop-shadow(0 0 18px var(--st-a28))' }}>
        <svg width={34} height={34} viewBox="0 0 34 34">
          <path d={archRingPath(17, 17, 17 * 0.58, 17, -210, 30)} fill="var(--st-active)" />
        </svg>
      </div>
    )
  }

  if (state === 'rest') {
    return (
      <div data-day-mark data-day-mark-state={state} style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Moon
          size={22}
          color="var(--st-active)"
          fill="var(--st-active)"
          aria-hidden="true"
          style={{ transform: 'rotate(-16deg)', filter: 'drop-shadow(0 0 20px var(--st-a28))' }}
        />
      </div>
    )
  }

  if (state === 'training') {
    return (
      <div data-day-mark data-day-mark-state={state} style={{ width: 34, height: 34, filter: 'drop-shadow(0 0 18px var(--st-a28))' }}>
        <svg width={34} height={34} viewBox="0 0 34 34">
          <path d={archRingPath(17, 17, 17 * 0.58, 17, -30, 210)} fill="var(--st-active)" />
        </svg>
      </div>
    )
  }

  return (
    <div data-day-mark data-day-mark-state={state} style={{ width: 34, height: 34 }}>
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          background: 'var(--st-active)',
          boxShadow: '0 0 18px var(--st-a28)',
        }}
      />
    </div>
  )
}

/** A closed ring-segment path (annulus arc) from `startDeg` to `endDeg`,
 * degrees measured clockwise from the positive x-axis (SVG's own
 * convention), between `innerR` and `outerR` around (cx, cy). */
function archRingPath(cx: number, cy: number, innerR: number, outerR: number, startDeg: number, endDeg: number): string {
  const toRad = (d: number) => (d * Math.PI) / 180
  const point = (r: number, deg: number) => [cx + r * Math.cos(toRad(deg)), cy + r * Math.sin(toRad(deg))]
  const large = endDeg - startDeg > 180 ? 1 : 0
  const [ox1, oy1] = point(outerR, startDeg)
  const [ox2, oy2] = point(outerR, endDeg)
  const [ix2, iy2] = point(innerR, endDeg)
  const [ix1, iy1] = point(innerR, startDeg)
  return [
    `M ${ox1} ${oy1}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${ox2} ${oy2}`,
    `L ${ix2} ${iy2}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${ix1} ${iy1}`,
    'Z',
  ].join(' ')
}
