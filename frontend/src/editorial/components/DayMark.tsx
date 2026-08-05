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
 * This task (8) only transcribes Trained's disc — Resting/Rest/Training/
 * Evening's silhouettes belong to Tasks 9-14, which own those frames. Until
 * they land, every other state falls back to this same disc rather than
 * guessing an untranscribed shape.
 */
export default function DayMark({ state }: { state: DayState }) {
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
