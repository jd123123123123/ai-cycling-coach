import { isPresent, type Value } from '../data/value'

export interface BarsBlock {
  label: string
  minutes: number
  watts: Value<number>
  delta: number | null
}

/**
 * Transcribed from "Plan vs Ridden" (Fpt7K, `01 The Session`): a Deltas row
 * (Z7tZK, 8 columns alternating value/spacer, widths matching each
 * segment's own bar width) sitting above the pen's "Planned" ghost bar row
 * (BBZZe: height 96, gap 2, work-block fill #FFFFFF42 →
 * var(--e-bar-ghost), non-work-block fill #FFFFFF21 →
 * var(--e-bar-ghost-dim)). The pen draws Planned as a downward mirror below
 * a shared baseline (cornerRadius [0,0,3,3]); this component doesn't mirror
 * — it renders its own upward chart on its own local baseline, matching
 * every other bar chart in this file, so corners round at the top
 * ([3,3,0,0]) instead.
 *
 * CORRECTED (coordinator review, defect 1, task-9-report.md): this
 * component renders ONLY the pen's "Planned" row — never the accent-coloured
 * "Ridden" row (sFosG, #FF5E00) — because `useStreamAnalysis`'s `splits` are
 * per-kilometre only, never aligned to a named workout block
 * (task-9-report.md, verify-check 1), so there is no real per-block
 * "ridden" wattage anywhere in the app, only the plan's own per-block
 * target (`SessionSummary.blocks[].watts`). An earlier pass coloured these
 * bars `var(--m-load)` (the pen's accent, the Ridden row's own colour) and
 * labelled the whole thing "WHAT YOU RODE" — that rendered planned numbers
 * under a ridden heading and let a "ride not matched to its plan" reason
 * sit directly beneath a chart that implied otherwise. TodayView now owns
 * BOTH labels and renders an honestly-missing "WHAT YOU RODE" placeholder
 * ABOVE this component, and this component only ever renders "WHAT WAS
 * PLANNED" — ghost-toned bars, matching what the pen itself calls them.
 * The 1px Baseline rule (K6Hhvu, `var(--e-baseline)`) that sits between the
 * two pen rows is TodayView's to place, not this component's, since it now
 * sits between two separately-rendered blocks, not below one.
 *
 * `delta` is kept on the prop shape and rendered when non-null (Deltas row
 * colour: the tree's four examples — +1 → $e-ink, −1/−2 → $e-quiet, +3 →
 * literal #FF5E00 — read as "the single best positive delta gets the
 * accent, other positive deltas are plain ink, non-positive deltas are
 * dim," this component's own interpolation of one concrete example) so a
 * future block-matching source only has to start passing real deltas, not
 * touch this file or its label.
 *
 * Bar height is proportional to `watts` among the present blocks (capped at
 * the row's 104px); width is proportional to `minutes` via flex-grow,
 * matching the pen's duration-scaled column widths (55/37/18/37/18/37/18/
 * 37/69 — warm-up, four intervals with three recoveries, cool-down). A
 * missing `watts` value renders a minimal placeholder at the dimmer ghost
 * tone instead of inventing a height.
 */
export default function Bars({ blocks }: { blocks: BarsBlock[] }) {
  const presentWatts = blocks
    .map((b) => (isPresent(b.watts) ? b.watts.value : null))
    .filter((w): w is number => w != null)
  const maxWatts = presentWatts.length > 0 ? Math.max(...presentWatts) : 0
  const positiveDeltas = blocks
    .map((b) => b.delta)
    .filter((d): d is number => d != null && d > 0)
  const maxPositiveDelta = positiveDeltas.length > 0 ? Math.max(...positiveDeltas) : null

  return (
    <div data-bars style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end', paddingBottom: 6 }}>
        {blocks.map((b, i) => (
          <div
            key={i}
            style={{ flex: b.minutes || 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
          >
            {b.delta != null && (
              <span
                style={{
                  fontFamily: 'var(--e-body)',
                  fontSize: 10,
                  fontWeight: 800,
                  color: b.delta === maxPositiveDelta
                    ? 'var(--st-active)'
                    : b.delta > 0 ? 'var(--e-ink)' : 'var(--e-quiet)',
                }}
              >
                {formatDelta(b.delta)}
              </span>
            )}
          </div>
        ))}
      </div>

      <div style={{ width: '100%', height: 104, display: 'flex', gap: 2, alignItems: 'flex-end' }}>
        {blocks.map((b, i) => {
          const watts = b.watts
          const wattsPresent = isPresent(watts)
          const height = wattsPresent
            ? Math.max(6, Math.round((watts.value / (maxWatts || 1)) * 104))
            : 8
          return (
            <div
              key={i}
              data-block=""
              title={b.label}
              style={{
                flex: b.minutes || 1,
                height,
                borderRadius: '3px 3px 0 0',
                background: wattsPresent ? 'var(--e-bar-ghost)' : 'var(--e-bar-ghost-dim)',
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

function formatDelta(d: number): string {
  if (d > 0) return `+${d}`
  if (d < 0) return `−${Math.abs(d)}`
  return '0'
}
