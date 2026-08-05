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
 * segment's own bar width) sitting above a single bar row (Ridden, sFosG:
 * height 104, gap 2, alignItems end, cornerRadius [3,3,0,0] on each bar),
 * with a 1px Baseline rule (K6Hhvu, `var(--e-baseline)`, #FFFFFF66) beneath.
 *
 * The pen shows TWO bar rows — an orange "Ridden" row (sFosG) and a dim
 * ghost "Planned" row beneath it (BBZZe) — because its mock data carries
 * both a plan and a separately-measured result per block. TodayModel cannot
 * supply that: `useStreamAnalysis`'s `splits` are per-kilometre only, never
 * aligned to a named workout block (task-9-report.md, verify-check 1), so
 * there is no real per-block "ridden" wattage anywhere in the app — only
 * the plan's own per-block target (`SessionSummary.blocks[].watts`).
 * Rendering two rows from one real dataset would fabricate the second one,
 * so this component renders the single row it can ground. `delta` is kept
 * on the prop shape and rendered when non-null so a future block-matching
 * source only has to start passing real deltas, not touch this file.
 *
 * Delta colour: the tree's four examples (+1 → $e-ink, −1/−2 → $e-quiet,
 * +3 → literal #FF5E00) don't reduce to a plain sign rule — the tree's own
 * "BEST" tag two rows down in Peak Power marks the standout result the same
 * way. Read as: the single best positive delta gets the accent
 * (var(--st-active)), other positive deltas are plain ink, non-positive
 * deltas are dim. This is this component's own interpolation of one
 * concrete example, not a value the pen states as a formula.
 *
 * Bar height is proportional to `watts` among the present blocks (capped at
 * the row's 104px); width is proportional to `minutes` via flex-grow,
 * matching the pen's duration-scaled column widths (55/37/18/37/18/37/18/
 * 37/69 — warm-up, four intervals with three recoveries, cool-down). A
 * missing `watts` value renders a minimal dim placeholder instead of
 * inventing a height.
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
                background: wattsPresent ? 'var(--m-load)' : 'var(--e-bar-dim)',
              }}
            />
          )
        })}
      </div>

      <div style={{ width: '100%', height: 1, background: 'var(--e-baseline)' }} />
    </div>
  )
}

function formatDelta(d: number): string {
  if (d > 0) return `+${d}`
  if (d < 0) return `−${Math.abs(d)}`
  return '0'
}
