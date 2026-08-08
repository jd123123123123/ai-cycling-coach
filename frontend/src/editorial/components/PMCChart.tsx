import { isPresent, type Value } from '../data/value'
import type { PmcPoint } from '../data/useTodayModel'
import { MOTION_DURATION_MS, MOTION_EASE, staggerDelay, useReveal } from '../motion/useReveal'
import { useTapHighlight } from '../motion/useTapHighlight'
import { useScrub } from '../motion/useScrub'
import { useCopy } from '../i18n/useCopy'
import { intlLocale } from '../i18n/copy'
import type { CopyKey } from '../i18n/copy'

const WIDTH = 342
const HEIGHT = 113

const LEGEND_DEFS: { key: 'ctl' | 'atl' | 'tsb'; labelKey: CopyKey; color: string }[] = [
  { key: 'ctl', labelKey: 'pmcFitness', color: 'var(--m-load)' },
  { key: 'atl', labelKey: 'pmcFatigue', color: 'var(--m-fatigue)' },
  { key: 'tsb', labelKey: 'pmcForm', color: 'var(--m-form)' },
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
 *
 * Interaction (chart-interaction task): the legend's dimming was the ONLY
 * interaction this chart had — it dims lines, it never lets you read a
 * value at a point. `useScrub` adds that: the plot area (the svg's own
 * wrapping div, NOT the legend row below it — the two stay independent) is
 * one focusable, pointer-capturing overlay spanning all `points.length`
 * days. Touch or drag it and a vertical hairline snaps to the nearest day,
 * a dot lands on each of the three lines at that day's real value, and an
 * `aria-live="polite"` readout below prints the day's date plus all three
 * numbers — reachable identically by mouse/touch (drag) and by keyboard
 * (ArrowLeft/Right move a day at a time once focused, Home/End jump to the
 * oldest/newest day, Escape clears). Release leaves the last-read day
 * visible; a pointerdown outside the plot clears it. None of this mounts
 * when there's no chart to scrub (`hasChart` false) — a missing/too-short
 * series exposes no interactive target at all.
 */
export default function PMCChart({ series, days }: { series: Value<PmcPoint[]>; days: 42 }) {
  const present = isPresent(series)
  const points = present ? series.value.slice(-days) : []
  const hasChart = present && points.length > 1
  const { ref, on, reduced } = useReveal<HTMLDivElement>()
  const tap = useTapHighlight<'ctl' | 'atl' | 'tsb'>()
  const positions = hasChart ? points.map((_, i) => (i / (points.length - 1)) * 100) : []
  const {
    ref: scrubRef, index: scrubIndex, tabIndex: scrubTabIndex,
    onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onKeyDown,
  } = useScrub<HTMLDivElement>(positions)
  const { t, locale } = useCopy()
  const LEGEND = LEGEND_DEFS.map((l) => ({ ...l, label: t(l.labelKey) }))
  const lines = hasChart ? buildLines(points) : []
  const scrubbed = scrubIndex != null ? points[scrubIndex] : null

  return (
    <div ref={ref} data-pmc-chart style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 5 }}>
      {hasChart ? (
        <div
          ref={scrubRef}
          data-pmc-plot
          role="img"
          tabIndex={scrubTabIndex}
          aria-label={`${t('pmcAriaLabel', { days })}. ${t('pmcPlotAriaHint')}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onKeyDown={onKeyDown}
          style={{ width: '100%', touchAction: 'none', cursor: 'crosshair' }}
        >
          <svg
            width="100%"
            height={HEIGHT}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {lines.map((l, i) => {
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
            {/* Today, marked at rest. Without this the three lines end in
                mid-air and nothing says which end is now — the same "a chart
                has to argue one point" rule the bento tiles follow. Hidden
                while scrubbing, so the scrub's own dots are the only marks
                competing for the eye at that moment. */}
            {scrubIndex == null && points.length > 0 && lines.map((l) => {
              const end = l.coords[l.coords.length - 1]
              return (
                <circle
                  key={`now-${l.key}`}
                  data-pmc-now={l.key}
                  cx={end.x}
                  cy={end.y}
                  r={tap.isDimmed(l.key) ? 2.5 : 3.5}
                  fill={tap.isDimmed(l.key) ? 'var(--d-2)' : l.color}
                  style={{
                    opacity: on ? 1 : 0,
                    transition: reduced
                      ? undefined
                      : `opacity 200ms ${MOTION_EASE} ${MOTION_DURATION_MS}ms`,
                  }}
                />
              )
            })}
            {scrubIndex != null && (
              <>
                <line
                  data-pmc-hairline
                  x1={xForIndex(scrubIndex, points.length)}
                  x2={xForIndex(scrubIndex, points.length)}
                  y1={0}
                  y2={HEIGHT}
                  stroke="var(--e-hairline)"
                  strokeWidth={1}
                />
                {lines.map((l) => (
                  <circle
                    key={l.key}
                    data-pmc-dot={l.key}
                    cx={l.coords[scrubIndex].x}
                    cy={l.coords[scrubIndex].y}
                    r={3}
                    fill={tap.isDimmed(l.key) ? 'var(--d-2)' : l.color}
                  />
                ))}
              </>
            )}
          </svg>
        </div>
      ) : (
        <p style={{ fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 600, color: 'var(--e-quiet)', margin: 0 }}>
          {present ? t('pmcNotEnoughHistory') : series.missing}
        </p>
      )}

      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', paddingTop: 8 }}>
        <span style={{ fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1.2, color: 'var(--e-lo)' }}>
          {t('pmcDaysAgo', { days })}
        </span>
        <span style={{ fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1.2, color: 'var(--st-active)' }}>
          {t('pmcNow')}
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

      {hasChart && (
        <div
          data-pmc-readout
          aria-live="polite"
          style={{ minHeight: 12, fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1, color: 'var(--st-active)' }}
        >
          {scrubbed
            ? t('pmcScrubReadout', {
                date: new Date(`${scrubbed.date}T00:00:00`).toLocaleDateString(intlLocale(locale), { day: '2-digit', month: 'short' }),
                ctl: Math.round(scrubbed.ctl),
                atl: Math.round(scrubbed.atl),
                tsb: Math.round(scrubbed.tsb),
              })
            : ''}
        </div>
      )}
    </div>
  )
}

/** Same x scale `buildLines` uses internally, exposed for the hairline —
 *  every line shares one x axis, so the hairline needs it once, not per-line. */
function xForIndex(i: number, count: number): number {
  return (i / (count - 1)) * WIDTH
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
  const x = (i: number) => xForIndex(i, points.length)
  const line = (key: 'ctl' | 'atl' | 'tsb', color: string, pick: (p: PmcPoint) => number) => {
    const values = points.map(pick)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min || 1
    const y = (v: number) => HEIGHT - ((v - min) / span) * HEIGHT
    const coords = points.map((p, i) => ({ x: x(i), y: y(pick(p)) }))
    return {
      key,
      color,
      coords,
      pointsAttr: coords.map((c) => `${c.x},${c.y}`).join(' '),
    }
  }
  return [
    line('ctl', 'var(--m-load)', (p) => p.ctl),
    line('atl', 'var(--m-fatigue)', (p) => p.atl),
    line('tsb', 'var(--m-form)', (p) => p.tsb),
  ]
}
