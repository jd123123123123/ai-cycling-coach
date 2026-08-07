import { MOTION_DURATION_MS, MOTION_EASE, staggerDelay, useReveal } from '../motion/useReveal'

/**
 * Mechanic J — segmented meter (roadbook, 2026-08-06).
 *
 * Discrete ticks rather than a continuous fill: it reads as a budget being
 * spent, which is the right grammar for a week's planned load. It replaces
 * the PMC chart the shipped screen drew at a size the design pass measured
 * as unreadable at 390px.
 *
 * The last two ticks carry the warning hue, so a week already at its budget
 * says so before a number does. An over-spent week clamps to full rather
 * than overflowing — the meter's job is "how much of the plan is gone", and
 * past 100% the answer is "all of it".
 *
 * This component never decides whether it should render: it takes two real
 * numbers. The caller withholds it entirely when the plan carries no total,
 * because a meter with an invented denominator is exactly the fabricated
 * number the missing-data rule exists to prevent.
 *
 * Motion (owner's ruling, 2026-08-06): spent ticks fill left to right,
 * staggered, the first time the meter enters the viewport (`useReveal`,
 * same contract as WeekRail/BlockStrip). An unspent tick's own colour never
 * changes between its baseline and revealed state, so it carries a
 * `transition` but never actually animates — "never animate a missing
 * state" applied to a tick that has nothing spent on it yet.
 */
export default function SegmentedMeter({ label, spent, planned, segments = 20 }: {
  label: string
  spent: number
  planned: number
  segments?: number
}) {
  const { ref, on, reduced } = useReveal<HTMLDivElement>()
  const ratio = planned > 0 ? Math.min(spent / planned, 1) : 0
  const filled = Math.round(ratio * segments)
  return (
    <div data-segmented-meter="" style={{ display: 'flex', flexDirection: 'column', gap: 9, width: '100%' }}>
      <span
        style={{
          fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800,
          letterSpacing: 1.4, color: 'var(--e-mid)',
        }}
      >
        {label}
      </span>
      <div ref={ref} style={{ display: 'flex', width: '100%', gap: 3, height: 14 }}>
        {Array.from({ length: segments }, (_, i) => {
          const isSpent = i < filled
          const isLastTwo = i >= segments - 2
          const spentColor = isLastTwo ? 'var(--s-mid)' : 'var(--d-3)'
          return (
            <div
              key={i}
              data-tick=""
              {...(isSpent ? { 'data-spent': '' } : {})}
              style={{
                flex: 1,
                height: '100%',
                borderRadius: 1,
                background: isSpent ? (on ? spentColor : 'var(--d-1)') : 'var(--d-1)',
                transition: reduced ? undefined : `background ${MOTION_DURATION_MS}ms ${MOTION_EASE}`,
                transitionDelay: reduced ? undefined : `${staggerDelay(i)}ms`,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
