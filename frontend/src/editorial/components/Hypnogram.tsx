import { useReveal, MOTION_EASE, staggerDelay } from '../motion/useReveal'
import { useTapHighlight } from '../motion/useTapHighlight'
import { useListNav } from '../motion/useListNav'
import { isPresent, type Value } from '../data/value'

export interface SleepStage { key: 'deep' | 'rem' | 'light' | 'awake'; label: string; seconds: number }

const DEPTH: Record<SleepStage['key'], number> = { awake: 0, light: 1, rem: 2, deep: 3 }
const TONE: Record<SleepStage['key'], string> = {
  awake: 'var(--d-1)',
  light: 'var(--d-2)',
  rem: 'var(--d-3)',
  deep: 'var(--st-active)',
}
const NAME: Record<SleepStage['key'], string> = { awake: 'Awake', light: 'Light', rem: 'REM', deep: 'Deep' }

/** "22:47" → 1367. Anything unparseable returns null, and the readout simply
 *  omits the clock rather than printing a guessed time. */
function toMinutes(hhmm: string | undefined): number | null {
  if (!hhmm) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

function toClock(total: number): string {
  const t = ((total % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

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
 *
 * Tap a segment to read it. The shape answers "was it a good night"; the tap
 * answers "what happened at 3am", which the shape alone cannot — and which was
 * previously unanswerable, since this chart was the only one in the deck a
 * reader could not interrogate. Selecting dims every other segment, the house
 * rule for tap-to-read (see Bars, ZoneRows), and the readout sits above the
 * chart in a reserved row so nothing reflows under the finger.
 */
export default function Hypnogram({
  stages,
  segments,
  height = 88,
  startTime,
}: {
  stages: Value<SleepStage[]>
  /** Ordered slices of the night. Absent → the four totals are drawn as one
   *  block each, in stage order, which is honest about being a summary. */
  segments?: Value<{ stage: SleepStage['key']; minutes: number }[]>
  height?: number
  /** Clock time of the first segment, e.g. "22:47". Given it, each segment can
   *  name its own window; without it the readout drops the clock. */
  startTime?: string
}) {
  const { ref, on, reduced } = useReveal<HTMLDivElement>()
  const tap = useTapHighlight<number>()

  const run = segments != null && isPresent(segments)
    ? segments.value
    : isPresent(stages)
      ? stages.value.map((s) => ({ stage: s.key, minutes: Math.round(s.seconds / 60) }))
      : []

  const onKeyDown = useListNav(run.map((_, i) => i), tap)

  if (!isPresent(stages)) {
    return <p style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', color: 'var(--e-quiet)', margin: 0 }}>{stages.missing}</p>
  }

  // Each segment's own window, accumulated from lights-out.
  const base = toMinutes(startTime)
  let cursor = base
  const windows = run.map((s) => {
    if (cursor == null) return null
    const from = cursor
    cursor = from + s.minutes
    return `${toClock(from)} → ${toClock(cursor)}`
  })

  const sel = tap.selected
  const picked = sel != null ? run[sel] : null

  return (
    <div ref={ref} style={{ width: '100%' }}>
      {/* Reserved row: mounted whether or not anything is selected, so tapping
          never shifts the chart out from under the finger that tapped it. */}
      <div
        data-testid="hypnogram-readout"
        aria-live="polite"
        style={{ minHeight: 15, paddingBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}
      >
        {picked && (
          <>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: TONE[picked.stage], flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--e-ink)' }}>
              {NAME[picked.stage]} · {picked.minutes} min
            </span>
            {windows[sel!] && (
              <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 700, color: 'var(--st-active)' }}>
                {windows[sel!]}
              </span>
            )}
          </>
        )}
        {!picked && (
          <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--e-quiet)' }}>
            Tap any block to read it
          </span>
        )}
      </div>

      <div
        data-testid="hypnogram"
        role="group"
        aria-label="Your night, block by block. Tap a block or use the arrow keys to read it."
        tabIndex={run.length > 0 ? 0 : undefined}
        onKeyDown={run.length > 0 ? onKeyDown : undefined}
        style={{ display: 'flex', alignItems: 'stretch', gap: 2, height, width: '100%', outline: 'none' }}
      >
        {run.map((s, i) => {
          const depth = DEPTH[s.stage]
          // deepest = tallest bar, drawn from the floor: the night's shape
          const h = ((depth + 1) / 4) * height
          const selected = tap.isSelected(i)
          const dimmed = tap.isDimmed(i)
          return (
            // The tap target is the full-height column, not the coloured bar.
            // Bars.tsx records the same finding: an absolute overlay sized for
            // a finger overflows a thin column and lets a sibling steal the tap.
            <span
              key={i}
              onClick={() => tap.toggle(i)}
              style={{
                flexGrow: Math.max(s.minutes, 1),
                flexShrink: 0,
                flexBasis: 0,
                minWidth: 7,
                display: 'flex',
                alignItems: 'flex-end',
                cursor: 'pointer',
              }}
            >
              <span
                data-testid="hypnogram-bar"
                data-stage={s.stage}
                data-selected={String(selected)}
                style={{
                  width: '100%',
                  height: on ? h : 2,
                  borderRadius: 2,
                  background: selected ? 'var(--st-active)' : dimmed ? 'var(--d-1)' : TONE[s.stage],
                  transition: reduced ? undefined : `height 520ms ${MOTION_EASE} ${staggerDelay(i)}ms, background 220ms ${MOTION_EASE}`,
                }}
              />
            </span>
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
