import { useReducedMotion } from 'motion/react'
import { T } from './w3tokens'

/**
 * THE TWO BANDS OF `D1SQI`, RUNNING.
 *
 * A Laufband that does not run is a caption with a coloured background. The
 * export is a PNG and a PNG cannot move, so the still is one frame of it — but
 * the card in the app is the one a rider looks at while deciding whether to
 * post, and that one can move, so it does.
 *
 * HOW IT SITS ON THE STILL. This does not draw *over* the canvas bands, it
 * REPLACES them: both grounds are opaque and both rects are the pen's own
 * (1596 / 144 and 1740 / 108 on a 1920 canvas), so each DOM band covers the
 * painted one exactly. Anything less than exact would show a hairline of the
 * frozen band under the moving one, which is the tell that there are two
 * renderers here rather than one card.
 *
 * WHY `cqh` AND NOT `px`. The preview is whatever width the phone gives it, and
 * every figure in this component is a fraction of the card's HEIGHT — a band at
 * 83.125 % with type at 3.75 % of the frame. Container query units say that
 * directly. Pixels would need a ResizeObserver and would be wrong for one frame
 * on every rotation.
 *
 * The two belts run at different speeds on purpose. Matched, they read as one
 * texture and the eye stops seeing either; a third apart and each stays its own
 * line of information.
 */
export default function W3LaufbandBands({ figures, verdicts, accent }: {
  figures: string
  verdicts: string
  /** The card's accent — the same one the canvas was painted with. */
  accent: string
}) {
  const reduce = useReducedMotion()

  const band = (
    top: number, height: number, ground: string, ink: string,
    s: string, size: number, spacing: number, textTop: number, seconds: number,
  ) => (
    <div style={{
      position: 'absolute', left: 0, right: 0,
      top: `${top}cqh`, height: `${height}cqh`,
      background: ground, overflow: 'hidden',
    }}>
      <div
        className={reduce ? undefined : 'w3-laufband-run'}
        style={{
          // `pre`, not `nowrap`. Both stop the belt wrapping, but `nowrap` still
          // collapses the space at the end of a run — and the end of this run is
          // the separator, so the seam came out "HOCH. —SCHNELLER" while the
          // canvas, which measures the string including its trailing space, drew
          // it correctly. Two renderers, one string, and only one of them
          // obeying HTML whitespace rules.
          display: 'flex', width: 'max-content', whiteSpace: 'pre',
          paddingTop: `${textTop}cqh`,
          animationDuration: `${seconds}s`,
          fontFamily: "'Archivo Narrow', 'Inter Tight', sans-serif",
          fontWeight: 700,
          fontSize: `${size}cqh`,
          letterSpacing: `${spacing}cqh`,
          lineHeight: 1,
          color: ink,
        }}>
        {/* Two copies and a -50 % travel: the belt is seamless because the
            second copy is under the cursor at the exact moment the first
            leaves. One copy would snap back. */}
        <span aria-hidden>{s}</span>
        <span aria-hidden>{s}</span>
      </div>
    </div>
  )

  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, containerType: 'size', pointerEvents: 'none' }}>
      {band(83.125, 7.5, accent, T.bg, figures, 3.75, 0.0625, 1.71875, 26)}
      {band(90.625, 5.625, T.bg, accent, verdicts, 2.65625, 0.125, 1.40625, 34)}
    </div>
  )
}
