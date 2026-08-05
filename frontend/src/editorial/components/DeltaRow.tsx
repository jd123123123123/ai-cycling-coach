export interface DeltaBlock {
  label: string
  minutes: number
  delta: number | null
}

/**
 * Transcribed from "Plan vs Ridden" (Fpt7K, `01 The Session`)'s Deltas row
 * (Z7tZK): 8 columns alternating value/spacer, widths matching each
 * segment's own bar width (55/37/18/37/18/37/18/37/69), gap 2, padding
 * bottom 6.
 *
 * EXTRACTED from `Bars.tsx` (coordinator review round 3, defect 1): reading
 * `Fpt7K` by node path shows `Z7tZK` sits between the Kicker Row and the
 * **Ridden** bars (`sFosG`), before the Baseline (`K6Hhvu`) — never above
 * `BBZZe` (Planned), which is the only row `Bars` renders (see that file's
 * own doc comment for why). Deltas describe how the ride compared to the
 * plan, so they belong with the ridden row, not the planned one. This
 * component is now rendered by `TodayView` directly above its
 * honestly-missing "WHAT YOU RODE" placeholder, matching the tree's actual
 * order: Kicker Row → DeltaRow → (honest-missing) Ridden → Baseline → Bars
 * (Planned) → "WHAT WAS PLANNED".
 *
 * Colour: the tree's four concrete examples (+1 → $e-ink, −1/−2 → $e-quiet,
 * +3 → literal #FF5E00) don't reduce to a plain sign rule — read as "the
 * single best positive delta gets the accent (var(--st-active)), other
 * positive deltas are plain ink, non-positive deltas are dim." This is this
 * component's own interpolation of one concrete example, not a value the
 * pen states as a formula. Every `delta` is null today (task-9-report.md,
 * verify-check 1 — no source aligns a ride's stream to a named workout
 * block), so this renders empty spacer columns until a real block-matching
 * source exists.
 */
export default function DeltaRow({ blocks }: { blocks: DeltaBlock[] }) {
  const positiveDeltas = blocks
    .map((b) => b.delta)
    .filter((d): d is number => d != null && d > 0)
  const maxPositiveDelta = positiveDeltas.length > 0 ? Math.max(...positiveDeltas) : null

  return (
    <div data-deltas-row style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end', paddingBottom: 6 }}>
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
  )
}

function formatDelta(d: number): string {
  if (d > 0) return `+${d}`
  if (d < 0) return `−${Math.abs(d)}`
  return '0'
}
