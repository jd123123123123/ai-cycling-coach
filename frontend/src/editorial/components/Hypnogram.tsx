import { useReveal, MOTION_EASE, staggerDelay } from '../motion/useReveal'
import { isPresent, type Value } from '../data/value'

export interface SleepStage { key: 'deep' | 'rem' | 'light' | 'awake'; label: string; seconds: number }

/**
 * The night, drawn as it happened rather than as a total.
 *
 * A single "7 h 45" number says how long; the hypnogram says *when* — and when
 * is what the coaching keys off ("deep sleep landed early and stayed"). The
 * bars sit at four depths, deepest lowest, so the shape of the night is
 * readable before any label is.
 *
 * Depth is encoded by vertical POSITION on a shared baseline, which is the
 * most accurately decoded visual channel there is; stage identity rides along
 * as lightness, which is only ever the secondary read.
 */
export default function Hypnogram({
  stages,
  segments,
  height = 88,
}: {
  stages: Value<SleepStage[]>
  /** Ordered slices of the night. Absent → the four totals are drawn as one
   *  block each, in stage order, which is honest about being a summary. */
  segments?: Value<{ stage: SleepStage['key']; minutes: number }[]>
  height?: number
}) {
  const { ref, on, reduced } = useReveal<HTMLDivElement>()
  if (!isPresent(stages)) {
    return <p style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', color: 'var(--e-quiet)', margin: 0 }}>{stages.missing}</p>
  }

  const DEPTH: Record<SleepStage['key'], number> = { awake: 0, light: 1, rem: 2, deep: 3 }
  const TONE: Record<SleepStage['key'], string> = {
    awake: 'var(--d-1)',
    light: 'var(--d-2)',
    rem: 'var(--d-3)',
    deep: 'var(--st-active)',
  }

  const run = segments != null && isPresent(segments)
    ? segments.value
    : stages.value.map((s) => ({ stage: s.key, minutes: Math.round(s.seconds / 60) }))

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <div
        data-testid="hypnogram"
        style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height, width: '100%' }}
      >
        {run.map((s, i) => {
          const depth = DEPTH[s.stage]
          // deepest = tallest bar, drawn from the floor: the night's shape
          const h = ((depth + 1) / 4) * height
          return (
            <span
              key={i}
              data-testid="hypnogram-bar"
              data-stage={s.stage}
              style={{
                // longhands, not the `flex` shorthand: React drops a
                // multi-value shorthand string here and every bar collapses
                flexGrow: Math.max(s.minutes, 1),
                flexShrink: 0,
                flexBasis: 0,
                height: on ? h : 2,
                borderRadius: 2,
                background: TONE[s.stage],
                transition: reduced ? undefined : `height 520ms ${MOTION_EASE} ${staggerDelay(i)}ms`,
              }}
            />
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 0, paddingTop: 14 }}>
        {stages.value.map((s) => (
          <span key={s.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: s.key === 'deep' ? 'var(--st-active)' : 'var(--e-lo)' }}>
              {s.label}
            </span>
            <span style={{ fontFamily: 'var(--e-display)', fontSize: 'var(--t-body)', fontWeight: 700, color: 'var(--e-ink)' }}>
              {Math.floor(s.seconds / 3600)} h {String(Math.round((s.seconds % 3600) / 60)).padStart(2, '0')}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
