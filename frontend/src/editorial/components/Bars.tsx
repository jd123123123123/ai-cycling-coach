import { isPresent, type Value } from '../data/value'

export interface BarsBlock {
  label: string
  minutes: number
  watts: Value<number>
}

/**
 * Transcribed from "Plan vs Ridden" (Fpt7K, `01 The Session`)'s "Planned"
 * ghost bar row (BBZZe: height 96, gap 2, work-block fill #FFFFFF42 →
 * var(--e-bar-ghost), non-work-block fill #FFFFFF21 → var(--e-bar-ghost-dim)).
 * The pen draws Planned as a downward mirror below a shared baseline
 * (cornerRadius [0,0,3,3]); this component doesn't mirror — it renders its
 * own upward chart on its own local baseline, matching every other bar
 * chart in this file, so corners round at the top ([3,3,0,0]) instead.
 *
 * CORRECTED (coordinator review round 2, defect 1, task-9-report.md): this
 * component renders ONLY the pen's "Planned" row — never the accent-coloured
 * "Ridden" row (sFosG, #FF5E00) — because `useStreamAnalysis`'s `splits` are
 * per-kilometre only, never aligned to a named workout block
 * (task-9-report.md, verify-check 1), so there is no real per-block
 * "ridden" wattage anywhere in the app, only the plan's own per-block
 * target (`SessionSummary.blocks[].watts`). TodayView owns the "WHAT YOU
 * RODE" / "WHAT WAS PLANNED" labels and renders an honestly-missing
 * placeholder for the former; this component is only ever the latter.
 *
 * CORRECTED (coordinator review round 3, defect 1): `delta` was removed
 * from this component entirely. Reading the tree again by node path — in
 * `Fpt7K`, the Deltas row `Z7tZK` sits between the Kicker Row and the
 * **Ridden** bars `sFosG`, BEFORE the Baseline `K6Hhvu`; `BBZZe` (Planned,
 * what this component renders) comes AFTER the Baseline and has no Deltas
 * row associated with it anywhere in the tree. An earlier pass kept `delta`
 * on this component's own prop shape and rendered it above these Planned
 * bars — invisible today only because every delta is null, but positioned
 * to render against the wrong row the day real per-block deltas exist.
 * Deltas now live in `DeltaRow` (`components/DeltaRow.tsx`), rendered by
 * TodayView directly above the honestly-missing "WHAT YOU RODE" placeholder
 * — where the tree actually puts them.
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

  return (
    <div data-bars style={{ width: '100%', height: 104, display: 'flex', gap: 2, alignItems: 'flex-end' }}>
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
  )
}
