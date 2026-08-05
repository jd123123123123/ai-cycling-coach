import { isPresent, type Value } from '../data/value'
import type { PmcPoint } from '../data/useTodayModel'
import { MOTION_DURATION_MS, MOTION_EASE, staggerDelay, useReveal } from '../motion/useReveal'
import { useTapHighlight } from '../motion/useTapHighlight'

const WIDTH = 342
const HEIGHT = 113

const LEGEND: { key: 'ctl' | 'atl' | 'tsb'; label: string; color: string }[] = [
  { key: 'ctl', label: 'FITNESS', color: 'var(--m-load)' },
  { key: 'atl', label: 'FATIGUE', color: 'var(--m-fatigue)' },
  { key: 'tsb', label: 'FORM', color: 'var(--m-form)' },
]

/**
 * `03 Trajectory`'s "Chart" node (tIejg) is, in the tree, a decorative
 * 7-bucket bar chart with two ambiguous series (a "FRESH"/"FATIGUED"
 * legend over bars named "F"/"A" that don't map cleanly to CTL/ATL/TSB —
 * flagged in task-9-report.md as a pen/brief disagreement). The brief's own
 * component contract for this task overrides that: `PMCChart` is specified
 * as a hand-rolled SVG plotting real CTL/ATL/TSB across `days`, using the
 * three existing metric hues. That contract is well-supported by real data
 * (`TodayModel.pmc.value.series`, already `PmcPoint[]`) and is unambiguous
 * where the tree's own bar chart is not, so this component follows the
 * brief, not the bar-chart node — the pen's dimensions (chart ~342×113,
 * an axis row below, a legend row below that) are kept as the layout
 * envelope, since those aren't in dispute.
 *
 * Motion (Task 10.5): each of the three lines draws in on first viewport
 * entry via `pathLength`/`strokeDasharray`/`strokeDashoffset` (a
 * browser-normalized 0-1 length so the trick works regardless of the line's
 * real geometry), staggered so FITNESS draws first, then FATIGUE, then
 * FORM. The legend doubles as the tap target — mobile has no hover — and
 * selecting a metric lifts its line's stroke weight while the other two
 * drop to a dim tone; tapping the same legend swatch again restores all
 * three.
 */
export default function PMCChart({ series, days }: { series: Value<PmcPoint[]>; days: 42 }) {
  const present = isPresent(series)
  const points = present ? series.value.slice(-days) : []
  const hasChart = present && points.length > 1
  const { ref, on, reduced } = useReveal<HTMLDivElement>()
  const tap = useTapHighlight<'ctl' | 'atl' | 'tsb'>()

  return (
    <div ref={ref} data-pmc-chart style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 5 }}>
      {hasChart ? (
        <svg
          width="100%"
          height={HEIGHT}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Fitness, fatigue and form over the last ${days} days`}
        >
          {buildLines(points).map((l, i) => {
            const selected = tap.isSelected(l.key)
            const dimmed = tap.isDimmed(l.key)
            return (
              <polyline
                key={l.key}
                data-pmc-line={l.key}
                points={l.pointsAttr}
                fill="none"
                stroke={dimmed ? 'var(--d-2)' : l.color}
                strokeWidth={selected ? 3 : 2}
                strokeLinejoin="round"
                strokeLinecap="round"
                pathLength={1}
                style={{
                  strokeDasharray: 1,
                  strokeDashoffset: on ? 0 : 1,
                  transition: reduced
                    ? undefined
                    : `stroke-dashoffset ${MOTION_DURATION_MS}ms ${MOTION_EASE} ${staggerDelay(i)}ms, stroke-width 200ms ${MOTION_EASE}, stroke 200ms ${MOTION_EASE}`,
                }}
              />
            )
          })}
        </svg>
      ) : (
        <p style={{ fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 600, color: 'var(--e-quiet)', margin: 0 }}>
          {present ? 'Not enough training history to chart yet.' : series.missing}
        </p>
      )}

      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', paddingTop: 8 }}>
        <span style={{ fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1.2, color: 'var(--e-lo)' }}>
          {days} DAYS AGO
        </span>
        <span style={{ fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1.2, color: 'var(--st-active)' }}>
          NOW
        </span>
      </div>

      <div style={{ width: '100%', display: 'flex', gap: 16, alignItems: 'center', paddingTop: 14 }}>
        {LEGEND.map((l) => (
          <div
            key={l.label}
            data-pmc-legend={l.key}
            onClick={hasChart ? () => tap.toggle(l.key) : undefined}
            style={{ display: 'flex', gap: 5, alignItems: 'center', cursor: hasChart ? 'pointer' : undefined }}
          >
            <div style={{ width: 8, height: 8, borderRadius: 2, background: tap.isDimmed(l.key) ? 'var(--d-2)' : l.color }} />
            <span
              style={{
                fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1.2,
                color: tap.isSelected(l.key) ? 'var(--e-ink)' : 'var(--e-mid)',
              }}
            >
              {l.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * CTL/ATL live on roughly the same scale (both TSS-per-day rolling
 * averages, typically 0-150); TSB is their *difference*, routinely an
 * order of magnitude smaller (single digits to low tens). A shared axis
 * across all three (the first pass here) pins TSB flat along the bottom —
 * technically correct, but reads as if form never moves at all
 * (coordinator review, observation). Each line is normalised to its OWN
 * min/max instead: still no shared-axis "10 fitness points = 10 fatigue
 * points" comparison (this was never a literal-value chart the pen
 * specifies precisely — see this file's own top comment on why it departs
 * from the tree's bar chart), but every one of the three lines now
 * actually shows its own shape, which is what a trend chart is for.
 */
function buildLines(points: PmcPoint[]) {
  const x = (i: number) => (i / (points.length - 1)) * WIDTH
  const line = (key: 'ctl' | 'atl' | 'tsb', color: string, pick: (p: PmcPoint) => number) => {
    const values = points.map(pick)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min || 1
    const y = (v: number) => HEIGHT - ((v - min) / span) * HEIGHT
    return {
      key,
      color,
      pointsAttr: points.map((p, i) => `${x(i)},${y(pick(p))}`).join(' '),
    }
  }
  return [
    line('ctl', 'var(--m-load)', (p) => p.ctl),
    line('atl', 'var(--m-fatigue)', (p) => p.atl),
    line('tsb', 'var(--m-form)', (p) => p.tsb),
  ]
}
