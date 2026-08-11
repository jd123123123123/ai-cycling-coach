import { useCountUp } from '../motion/useCountUp'
import { useScrub } from '../motion/useScrub'

export interface FormValue {
  fitness: number
  fatigue: number
  form: number
  note: string
  series: { ctl: number; atl: number }[]
}

const W = 342
const HEIGHT = 190
const PAD = 12

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

function Kicker({ children, tone = 'quiet' }: { children: React.ReactNode; tone?: 'quiet' | 'mid' }) {
  return (
    <span style={{
      fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 800,
      letterSpacing: '0.16em', textTransform: 'uppercase',
      color: tone === 'mid' ? 'var(--e-mid)' : 'var(--e-quiet)',
    }}>{children}</span>
  )
}

/** The chart's key. Three marks, named — the ribbon is the one that needs
 *  saying out loud, because "the space between two lines" is not a thing a
 *  reader should be expected to infer. */
function Legend() {
  const items: [string, string][] = [
    ['var(--e-ink)', 'Fitness'],
    ['var(--e-mid)', 'Fatigue'],
    ['var(--st-a40)', 'The gap = form'],
  ]
  return (
    <div style={{ display: 'flex', gap: 14, paddingBottom: 12 }}>
      {items.map(([color, label]) => (
        <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 3, borderRadius: 2, background: color, flexShrink: 0 }} />
          <Kicker>{label}</Kicker>
        </span>
      ))}
    </div>
  )
}

/**
 * Where you stand — the chart, and the three numerals it explains, as one
 * interactive block.
 *
 * Fitness and fatigue are drawn as two curves with the gap between them
 * filled, because the gap IS form: the ribbon states the subtraction the
 * numerals underneath then name. The ribbon changes tone where the curves
 * cross — grey while fatigue sits above fitness, accent from the day it flips
 * — so the single most important date in the block is visible rather than
 * inferred.
 *
 * REPLACED a 42-pair bar chart on the evidence of a render at 390×844: 84 bars
 * at 8px apiece, scaled from a zero baseline, resolved into one grey textured
 * slab with neither series legible. Bars encode independent readings; this is
 * a continuous quantity. The vertical scale is the data's own range now, so a
 * real 59→82 movement uses the whole box instead of its top quarter.
 *
 * The numerals ARE the readout. Drag across the chart and all three count back
 * through the block with the day you are touching; let go and they stay there
 * until you tap away. That is the whole point of making it interactive — not
 * to add a tooltip, but to let a rider feel the gap opening.
 */
export default function FormBlock({ form }: { form: FormValue }) {
  const series = form.series
  const last = series.length - 1

  const positions = series.length > 1 ? series.map((_, i) => (i / last) * 100) : []
  const {
    ref: scrubRef, index: scrubIndex, tabIndex,
    onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onKeyDown,
  } = useScrub<HTMLDivElement>(positions)

  const scrubbing = scrubIndex != null && series.length > 1
  const at = scrubbing ? series[scrubIndex] : null

  // Today's numbers count up on arrival; a scrubbed day replaces them outright.
  // Animating toward a value the finger is already moving would lag the touch.
  const shownFitness = useCountUp(scrubbing ? null : form.fitness, 800)
  const shownFatigue = useCountUp(scrubbing ? null : form.fatigue, 800)
  const shownForm = useCountUp(scrubbing ? null : form.form, 800)

  const fitness = at ? Math.round(at.ctl) : shownFitness ?? form.fitness
  const fatigue = at ? Math.round(at.atl) : shownFatigue ?? form.fatigue
  const formNow = at ? Math.round(at.ctl - at.atl) : shownForm ?? form.form

  const x = (i: number) => (i / Math.max(last, 1)) * W
  const vals = series.flatMap((d) => [d.ctl, d.atl])
  const lo = Math.min(...vals)
  const span = Math.max(Math.max(...vals) - lo, 1)
  const y = (v: number) => PAD + (1 - (v - lo) / span) * (HEIGHT - PAD * 2)

  const line = (pick: (d: { ctl: number; atl: number }) => number) =>
    'M ' + series.map((d, i) => `${x(i).toFixed(1)},${y(pick(d)).toFixed(1)}`).join(' L ')

  // Runs of constant sign, so each stretch of the ribbon carries its own tone.
  // Consecutive runs overlap by one segment; the ribbon is degenerately thin
  // exactly there (that is what a crossing IS), so the seam is invisible.
  const runs: { from: number; to: number; fresh: boolean }[] = []
  let start = 0
  let fresh = series[0].ctl >= series[0].atl
  for (let i = 1; i < series.length; i++) {
    const f = series[i].ctl >= series[i].atl
    if (f !== fresh) {
      runs.push({ from: start, to: i, fresh })
      start = i - 1
      fresh = f
    }
  }
  runs.push({ from: start, to: last, fresh })

  const ribbon = (from: number, to: number) => {
    const top: string[] = []
    const back: string[] = []
    for (let i = from; i <= to; i++) {
      top.push(`${x(i).toFixed(1)},${y(series[i].ctl).toFixed(1)}`)
      back.unshift(`${x(i).toFixed(1)},${y(series[i].atl).toFixed(1)}`)
    }
    return `M ${top.join(' L ')} L ${back.join(' L ')} Z`
  }

  const daysAgo = scrubbing ? last - scrubIndex : 0
  const when = !scrubbing ? 'Today' : daysAgo === 0 ? 'Today' : `${daysAgo} ${daysAgo === 1 ? 'day' : 'days'} ago`

  return (
    <div style={{ paddingBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 12 }}>
        <Kicker tone="mid">The last {series.length} days</Kicker>
        <Kicker>Drag to read any day</Kicker>
      </div>
      <Legend />

      <div
        ref={scrubRef}
        data-testid="form-plot"
        role="img"
        aria-label={`Your fitness and fatigue over the last ${series.length} days. Fitness now ${Math.round(form.fitness)}, fatigue ${Math.round(form.fatigue)}, form ${signed(form.form)}. Drag across or use the arrow keys to read any day.`}
        tabIndex={tabIndex}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
        style={{ touchAction: 'none', cursor: 'crosshair', outline: 'none' }}
      >
        <svg viewBox={`0 0 ${W} ${HEIGHT}`} width="100%" height={HEIGHT} style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
          {/* The fresh ribbon lights from its top edge — the fitness curve — so
              the fill has depth instead of reading as one flat brown wash,
              which is what any single accent alpha over near-black becomes. */}
          <defs>
            <linearGradient id="mFormFresh" x1="0" y1="0" x2="0" y2={HEIGHT} gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="var(--st-a40)" />
              <stop offset="100%" stopColor="var(--st-a12)" />
            </linearGradient>
          </defs>
          {runs.map((r, i) => (
            <path key={i} d={ribbon(r.from, r.to)} fill={r.fresh ? 'url(#mFormFresh)' : 'var(--d-2)'} />
          ))}
          <path d={line((d) => d.atl)} fill="none" stroke="var(--e-mid)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <path d={line((d) => d.ctl)} fill="none" stroke="var(--e-ink)" strokeWidth={2} vectorEffect="non-scaling-stroke" />

          {scrubbing ? (
            <>
              <line data-testid="form-hairline" x1={x(scrubIndex)} x2={x(scrubIndex)} y1={0} y2={HEIGHT} stroke="var(--e-rule-strong)" strokeWidth={1} />
              <circle cx={x(scrubIndex)} cy={y(series[scrubIndex].atl)} r={3} fill="var(--e-mid)" />
              <circle cx={x(scrubIndex)} cy={y(series[scrubIndex].ctl)} r={4} fill="var(--st-active)" />
            </>
          ) : (
            <>
              <circle cx={x(last)} cy={y(series[last].atl)} r={3} fill="var(--e-mid)" />
              <circle cx={x(last)} cy={y(series[last].ctl)} r={4} fill="var(--st-active)" />
            </>
          )}
        </svg>
      </div>

      {/* The numerals are the readout. Reserved height, always mounted, so
          scrubbing never reflows the page under the finger doing it. */}
      <div data-testid="form-when" aria-live="polite" style={{ paddingTop: 18, minHeight: 14 }}>
        <span style={{
          fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 800,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: scrubbing ? 'var(--st-active)' : 'var(--e-quiet)',
        }}>{when}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 13, paddingTop: 8 }}>
        {([
          ['fitness', fitness, '−'],
          ['fatigue', fatigue, '='],
          ['form', formNow, null],
        ] as const).map(([label, v, op]) => (
          <span key={label} style={{ display: 'flex', alignItems: 'flex-end', gap: 13 }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{
                fontFamily: 'var(--e-display)', fontSize: label === 'form' ? 44 : 32, fontWeight: 800,
                lineHeight: 0.88, letterSpacing: '-0.045em',
                color: label === 'form' ? 'var(--st-active)' : 'var(--e-ink)',
              }}>
                {label === 'form' ? signed(v) : v}
              </span>
              <Kicker>{label}</Kicker>
            </span>
            {op && <span style={{ fontFamily: 'var(--e-display)', fontSize: 19, color: 'var(--e-lo)', paddingBottom: 17 }}>{op}</span>}
          </span>
        ))}
      </div>

      <p style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', lineHeight: 1.45, color: 'var(--e-mid)', margin: '18px 0 0' }}>
        {form.note}
      </p>
    </div>
  )
}
