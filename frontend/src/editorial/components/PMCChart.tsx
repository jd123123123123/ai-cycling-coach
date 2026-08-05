import { isPresent, type Value } from '../data/value'
import type { PmcPoint } from '../data/useTodayModel'

const WIDTH = 342
const HEIGHT = 113

const LEGEND: { label: string; color: string }[] = [
  { label: 'FITNESS', color: 'var(--m-load)' },
  { label: 'FATIGUE', color: 'var(--m-fatigue)' },
  { label: 'FORM', color: 'var(--m-form)' },
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
 */
export default function PMCChart({ series, days }: { series: Value<PmcPoint[]>; days: 42 }) {
  const present = isPresent(series)
  const points = present ? series.value.slice(-days) : []
  const hasChart = present && points.length > 1

  return (
    <div data-pmc-chart style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 5 }}>
      {hasChart ? (
        <svg
          width="100%"
          height={HEIGHT}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Fitness, fatigue and form over the last ${days} days`}
        >
          {buildLines(points).map((l) => (
            <polyline
              key={l.key}
              points={l.pointsAttr}
              fill="none"
              stroke={l.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
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
          <div key={l.label} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
            <span style={{ fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1.2, color: 'var(--e-mid)' }}>
              {l.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function buildLines(points: PmcPoint[]) {
  const all = points.flatMap((p) => [p.ctl, p.atl, p.tsb])
  const min = Math.min(...all)
  const max = Math.max(...all)
  const span = max - min || 1
  const x = (i: number) => (i / (points.length - 1)) * WIDTH
  const y = (v: number) => HEIGHT - ((v - min) / span) * HEIGHT
  const line = (key: string, color: string, pick: (p: PmcPoint) => number) => ({
    key,
    color,
    pointsAttr: points.map((p, i) => `${x(i)},${y(pick(p))}`).join(' '),
  })
  return [
    line('ctl', 'var(--m-load)', (p) => p.ctl),
    line('atl', 'var(--m-fatigue)', (p) => p.atl),
    line('tsb', 'var(--m-form)', (p) => p.tsb),
  ]
}
