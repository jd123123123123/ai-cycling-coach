import { isPresent, type Value } from '../data/value'
import { MOTION_DURATION_MS, MOTION_EASE, useReveal } from '../motion/useReveal'
import { useTapHighlight } from '../motion/useTapHighlight'

const SIZE = 102
const CENTER = SIZE / 2
/** Track/Arc thickness — the pen's own Ring (`S4UZwO`/`BzrIF`/`tY3mr`,
 *  `h54Rs` "01 Right Now"): a 102×102 ellipse pair at `innerRadius: 0.82`,
 *  i.e. a ring whose inner circle is 82% of the outer radius. Converted to
 *  an SVG stroked circle: thickness = outerRadius * (1 - 0.82). */
const STROKE = CENTER * (1 - 0.82)
const RADIUS = CENTER - STROKE / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * The wake→now live ring — `h54Rs`'s "01 Right Now" section (three
 * instances: HRV `W3PK3`, RESTING HR `HzsA8`, SLEEP `L6fYBh`). Each is a
 * Track ellipse + a coloured Arc ellipse + a centred Value/Unit + a Label
 * below the ring + a Delta line below that ("+10 ms", "−4 bpm", "+41 min").
 *
 * PEN-VS-BRIEF DISAGREEMENT (see task-11-report.md): the brief's own
 * interface for this component names `wake`/`now` after `useTodaySnapshot()`'s
 * `body_battery`/`stress` `WakeNowPair`s — a real same-day wake-vs-current
 * reading. The pen's THREE actual ring instances on this frame are HRV /
 * RESTING HR / SLEEP, none of which carries a wake reading anywhere in
 * `TodayModel` (only `body_battery`/`stress` do) — confirmed by a fresh
 * `Get('h54Rs', {depth:16, resolveInstances:true})`, not the brief's
 * recollection. Rather than fabricate a wake reading these three metrics
 * don't have, `wake` here is read more generally, as "the value this ring's
 * Delta line diffs against" — the caller passes the metric's own real
 * comparison point (HRV/RESTING HR: reconstructed from `TodayModel`'s
 * already-real `delta`, since `wake` itself isn't tracked for these; SLEEP:
 * always `missing`, since `TodayModel.sleep` carries no delta field at all —
 * so its Delta line is honestly absent, never invented). `wake` stays a
 * required `Value<number>` because that shape is what the brief's own test
 * (`resting.test.tsx`) exercises and is a plausible future body_battery/
 * stress caller too — see `TodayModel.bodyBattery` (added this task, used by
 * the Hero Body's own wake→now visualisation, not by this component).
 *
 * The Arc's fill fraction: the pen's own three instances sweep to 88% / 92%
 * / 95% of the circle (HRV/RHR/Sleep) — figures that don't derive from any
 * stated max, target, or range for ms / bpm / seconds-of-sleep anywhere in
 * the tree or `TodayModel`. Rather than invent a false-precision scale (a
 * `max` prop with a guessed ceiling), every ring fills to the SAME
 * decorative constant when it has a real reading (`RING_FILL_FRACTION`,
 * the pen's own HRV figure) — "a reading exists" rendered honestly, without
 * implying a fabricated position in some range. A missing reading never
 * animates a fill at all (the "never animate a missing state" rule).
 *
 * Motion: `useReveal` sweeps the Arc from 0 to `RING_FILL_FRACTION` the
 * first time the ring enters the viewport (or immediately under reduced
 * motion / without `IntersectionObserver`, matching every other chart in
 * this file). `useTapHighlight` — the mobile "touch lifts it, second touch
 * restores" gesture every chart in this build shares — thickens the Arc's
 * stroke on tap; a single ring has no siblings to dim (unlike `Bars`/
 * `WeekRail`, which coordinate several bars at once), so this is the
 * one-element reading of the same rule.
 */
export default function LiveRing({ label, wake, now, hue, unit, format = String }: {
  label: string
  wake: Value<number>
  now: Value<number>
  hue: string
  unit?: string
  format?: (n: number) => string
}) {
  const present = isPresent(now)
  const { ref, on, reduced } = useReveal<HTMLDivElement>()
  const tap = useTapHighlight<'ring'>()

  const RING_FILL_FRACTION = 0.88
  const fraction = present && on ? RING_FILL_FRACTION : 0
  const dashoffset = CIRCUMFERENCE * (1 - fraction)
  const deltaText = present && isPresent(wake) ? signedDelta(now.value - wake.value, unit) : null

  return (
    <div
      ref={ref}
      data-live-ring
      onClick={present ? () => tap.toggle('ring') : undefined}
      style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', width: '100%', cursor: present ? 'pointer' : undefined }}
    >
      <div style={{ position: 'relative', width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="var(--d-1)" strokeWidth={STROKE} />
          {present && (
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke={hue}
              strokeWidth={tap.isSelected('ring') ? STROKE + 2 : STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashoffset}
              style={reduced ? undefined : {
                transition: `stroke-dashoffset ${MOTION_DURATION_MS}ms ${MOTION_EASE}, stroke-width 200ms ${MOTION_EASE}`,
              }}
            />
          )}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <span
            style={{
              fontFamily: 'var(--e-display)', fontSize: 26, fontWeight: 800, letterSpacing: -1, lineHeight: 1,
              color: present ? 'var(--e-ink)' : 'var(--e-lo)',
            }}
          >
            {present ? format(now.value) : '—'}
          </span>
          {present && unit && (
            <span style={{ fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1, color: 'var(--e-lo)' }}>
              {unit}
            </span>
          )}
        </div>
      </div>
      <span style={{ fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1.2, color: 'var(--e-mid)' }}>
        {label}
      </span>
      {present ? (
        deltaText && (
          <span style={{ fontFamily: 'var(--e-body)', fontSize: 11, fontWeight: 800, color: 'var(--e-ink)' }}>
            {deltaText}
          </span>
        )
      ) : (
        <span style={{ fontFamily: 'var(--e-body)', fontSize: 11, fontWeight: 600, color: 'var(--e-quiet)' }}>
          {now.missing}
        </span>
      )}
    </div>
  )
}

function signedDelta(n: number, unit?: string): string {
  const rounded = Math.round(n)
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : ''
  return `${sign}${Math.abs(rounded)}${unit ? ` ${unit}` : ''}`
}
