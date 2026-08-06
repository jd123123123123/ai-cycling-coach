import { isPresent, type Value } from '../data/value'
import { MOTION_DURATION_MS, MOTION_EASE, staggerDelay, useReveal } from '../motion/useReveal'
import { useTapHighlight } from '../motion/useTapHighlight'

/**
 * Transcribed from Rest's hero-body "Bars"/"BarLabels" (XD8oR/dfQOB,
 * `RYP0r`, depth 1): a 7-column Mon-Sun strip, columns fill_container.
 * CORRECTED (Audit A1, finding 3): the bar row's own gap is 6, and the
 * label row's own gap is 5 — verified directly against `XD8oR`/`dfQOB`.
 * An earlier pass hardcoded both to 2, on a doc-comment claim ("matching
 * every other bar row in this file") that was never backed by the pen —
 * `XD8oR`'s own gap is 6, not 2. Each bar has cornerRadius 5, height
 * literal per day (22/64/12/40/24/68/44 in the pen's own mock), fill
 * `$d-2` (var(--d-2)) except the CURRENT day's bar, which is the state
 * accent (`$C8FF00` in Rest → var(--st-active)).
 * BarLabels: 10px/800 Inter, `$e-quiet` (#767D87) except the current day's
 * letter, which is `$e-ink` (#FFFFFF, plain white — NOT accent-tinted,
 * confirmed at `GX9bc`, the "W" label sitting under the accent bar).
 *
 * A day with no matching PMC entry (`TodayModel.week[i].tss` missing) draws
 * a literal dash where its bar would be, rather than a fabricated
 * zero-height bar — the pen has no "no ride" example to transcribe, so
 * this rendering is this component's own honest-missing choice, not a pen
 * value. Distinct reasons print once each below the strip, in the same
 * register `InsightStrip` uses for its own deduped reasons.
 *
 * `todayIndex` (0 = Monday … 6 = Sunday) is not part of the pen's own data
 * (the mock's "today" is baked into which literal bar is tinted) — it is
 * how a real week, which can land on any weekday, tells this component
 * which column to accent.
 *
 * Motion (Task 10.5): present-value bars grow from zero the first time the
 * strip enters the viewport, staggered Monday to Sunday (`useReveal`) — a
 * day with no matching entry keeps its dash, never a growing zero-bar
 * (the "never animate a missing state" rule). Tapping a day's bar lifts it
 * to `var(--st-active)` and drops the rest to `var(--d-2)`
 * (`useTapHighlight`), surfacing its exact TSS; tapping it again restores
 * the current-day accent.
 */
export default function WeekRail({
  days,
  todayIndex,
}: {
  days: { letter: string; tss: Value<number> }[]
  todayIndex?: number
}) {
  const presentValues = days
    .map((d) => (isPresent(d.tss) ? d.tss.value : null))
    .filter((v): v is number => v != null)
  const maxTss = presentValues.length > 0 ? Math.max(...presentValues) : 0

  const reasons = [...new Set(
    days.map((d) => d.tss).filter((v): v is { missing: string } => !isPresent(v)).map((v) => v.missing),
  )]

  const { ref, on, reduced } = useReveal<HTMLDivElement>()
  const tap = useTapHighlight<number>()

  return (
    <div data-week-rail style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      <div ref={ref} style={{ width: '100%', height: 70, display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        {days.map((d, i) => {
          const isToday = i === todayIndex
          const tss = d.tss
          const selected = isPresent(tss) && tap.isSelected(i)
          const dimmed = isPresent(tss) && tap.isDimmed(i)
          return (
            <div
              key={i}
              data-week-day
              title={isPresent(tss) ? `${tss.value} TSS` : tss.missing}
              onClick={isPresent(tss) ? () => tap.toggle(i) : undefined}
              style={{
                flex: 1, height: 70, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                alignItems: 'center', cursor: isPresent(tss) ? 'pointer' : undefined,
              }}
            >
              {isPresent(tss) ? (
                <div
                  style={{
                    width: '100%',
                    height: on ? Math.max(8, Math.round((tss.value / (maxTss || 1)) * 70)) : 0,
                    borderRadius: 5,
                    background: selected ? 'var(--st-active)' : dimmed ? 'var(--d-2)' : isToday ? 'var(--st-active)' : 'var(--d-2)',
                    transition: reduced
                      ? undefined
                      : `height ${MOTION_DURATION_MS}ms ${MOTION_EASE} ${staggerDelay(i)}ms, background 200ms ${MOTION_EASE}`,
                  }}
                />
              ) : (
                <span style={{ fontFamily: 'var(--e-body)', fontSize: 14, fontWeight: 800, color: 'var(--e-off)' }}>—</span>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ width: '100%', display: 'flex', gap: 5, paddingTop: 8 }}>
        {days.map((d, i) => (
          <span
            key={i}
            style={{
              flex: 1,
              textAlign: 'center',
              fontFamily: 'var(--e-body)',
              fontSize: 10,
              fontWeight: 800,
              color: i === todayIndex ? 'var(--e-ink)' : 'var(--e-quiet)',
            }}
          >
            {d.letter}
          </span>
        ))}
      </div>
      {reasons.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 8 }}>
          {reasons.map((reason) => (
            <span key={reason} style={{ fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 600, color: 'var(--e-quiet)' }}>
              {reason}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
