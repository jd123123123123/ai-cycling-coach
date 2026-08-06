import { isPresent } from '../data/value'
import type { TodayModel } from '../data/useTodayModel'
import { MOTION_DURATION_MS, MOTION_EASE, useReveal } from '../motion/useReveal'
import { useScrub } from '../motion/useScrub'
import { touchTargetOverlayStyle } from '../motion/touchTarget'
import { useCopy } from '../i18n/useCopy'

/**
 * The Cost's "Curve" (fpPGi): the pen draws a precise bezier fatigue-decay
 * path with a "NOW · 58" marker and a "NEUTRAL 42" marker. There is no
 * source for that exact curve shape, but its two endpoints ARE real:
 * "now" is `pmc.fatigue` (today's ATL) and "neutral" is `pmc.fitness`
 * (form returns to zero — TSB back to neutral — when ATL decays down to
 * CTL). This renders those two real numbers as a simple two-mark bar
 * rather than inventing the bezier's exact decay shape. The caption uses
 * `recovery.clearAtLabel` (the same already-computed ETA the hero itself
 * uses) when present, and that Value's own reason otherwise.
 *
 * Motion (Task 10.5): the "now" bar grows from zero width the first time
 * the section enters the viewport, and the "neutral" marker's position is
 * revealed alongside it — both via `useReveal`, both skipped entirely when
 * `pmc` itself is missing (never animate a value that isn't there).
 *
 * Interaction (chart-interaction task): replaces the old per-mark
 * `useTapHighlight` with `useScrub` keyed on the two marks' own real x
 * positions (`nowPct`, `neutralPct`) — a genuine two-point scrub, not just a
 * pair of independent buttons. The whole plot region is one focusable,
 * pointer-capturing overlay (`{selectOnPointerDown: false}` — see
 * `useScrub`'s own doc comment for why): dragging across it re-reads
 * whichever mark is nearer as the finger crosses the midpoint, and a
 * vertical hairline tracks it; a plain tap directly on a mark toggles it via
 * `scrub.tapToggle`, the exact same click-driven contract this component
 * shipped with (a tap on an already-selected mark clears it again).
 * Keyboard: ArrowLeft/Right (or Up/Down) move between the two marks,
 * Home/End land on "now"/"neutral" directly, Escape clears. `aria-live=
 * "polite"` on the readout line means the exact reading a fingertip finds is
 * also what a screen reader announces. None of this mounts when `pmc` is
 * missing — the early-return branch below stays a plain paragraph, no
 * interactive target at all.
 */
export default function FatigueCurve({ pmc, recovery }: { pmc: TodayModel['pmc']; recovery: TodayModel['recovery'] }) {
  const { ref, on, reduced } = useReveal<HTMLDivElement>()
  const { t } = useCopy()
  const present = isPresent(pmc)
  const now = present ? pmc.value.fatigue : 0
  const neutral = present ? pmc.value.fitness : 0
  const max = Math.max(now, neutral, 1) * 1.15
  const nowPct = Math.min(100, Math.round((now / max) * 100))
  const neutralPct = Math.min(100, Math.round((neutral / max) * 100))
  const barTransition = reduced ? undefined : `width ${MOTION_DURATION_MS}ms ${MOTION_EASE}`
  // Hooks stay unconditional (rules-of-hooks) even though the plot is only
  // ever rendered when `present` — an absent reading passes an empty
  // `positions` array, so `useScrub` is a harmless no-op (its own `count`
  // guard makes every setter a no-op) rather than a conditionally-called hook.
  const {
    ref: scrubRef, index: scrubIndex, tapToggle, tabIndex: scrubTabIndex,
    onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onKeyDown,
  } = useScrub<HTMLDivElement>(present ? [nowPct, neutralPct] : [], { selectOnPointerDown: false })

  if (!present) {
    return (
      <p style={{ fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 600, color: 'var(--e-quiet)', margin: '8px 0 0 0' }}>
        {pmc.missing}
      </p>
    )
  }
  const isNow = scrubIndex === 0
  const isNeutral = scrubIndex === 1
  const dimNow = scrubIndex === 1
  const dimNeutral = scrubIndex === 0

  return (
    <div ref={ref} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div
        ref={scrubRef}
        role="img"
        tabIndex={scrubTabIndex}
        aria-label={t('fatigueCurveAriaLabel')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
        style={{ position: 'relative', width: '100%', height: 70, touchAction: 'none', cursor: 'crosshair' }}
      >
        <div style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: 1, background: 'var(--e-rule)' }} />
        {scrubIndex != null && (
          <div
            data-fatigue-hairline
            style={{ position: 'absolute', left: `${[nowPct, neutralPct][scrubIndex]}%`, top: 0, bottom: 0, width: 1, background: 'var(--e-hairline)' }}
          />
        )}
        <div
          data-fatigue-point="now"
          onClick={tapToggle(0)}
          style={{
            position: 'absolute', left: 0, bottom: 1, width: `${on ? nowPct : 0}%`, height: 6, borderRadius: 3,
            background: dimNow ? 'var(--d-2)' : 'var(--st-active)', cursor: 'pointer',
            transition: reduced ? undefined : `${barTransition}, background 200ms ${MOTION_EASE}`,
          }}
        >
          <div style={touchTargetOverlayStyle()} />
        </div>
        <div
          data-fatigue-point="neutral"
          onClick={tapToggle(1)}
          style={{
            position: 'absolute', left: `${neutralPct}%`, bottom: 1, width: 8, height: 26, marginLeft: -4,
            cursor: 'pointer', display: 'flex', justifyContent: 'center',
          }}
        >
          <div style={touchTargetOverlayStyle()} />
          <div
            style={{
              width: isNeutral ? 2 : 1, height: 26,
              background: isNeutral ? 'var(--st-active)' : 'var(--d-2)',
              opacity: on ? 1 : 0,
              transition: reduced ? undefined : `opacity ${MOTION_DURATION_MS}ms ${MOTION_EASE}, width 200ms ${MOTION_EASE}, background 200ms ${MOTION_EASE}`,
            }}
          />
        </div>
        <span
          style={{
            position: 'absolute', left: 0, top: 0, fontFamily: 'var(--e-body)', fontSize: 8.5, fontWeight: 800, letterSpacing: 0.9,
            color: dimNow ? 'var(--d-2)' : 'var(--e-ink)',
          }}
        >
          {t('fatigueCurveNow', { n: Math.round(now) })}
        </span>
        <span
          style={{
            position: 'absolute', left: `${neutralPct}%`, top: 32, transform: 'translateX(-100%)', whiteSpace: 'nowrap',
            fontFamily: 'var(--e-body)', fontSize: 8.5, fontWeight: 800, letterSpacing: 0.9,
            color: isNeutral ? 'var(--e-ink)' : dimNeutral ? 'var(--d-2)' : 'var(--e-lo)',
          }}
        >
          {t('fatigueCurveNeutral', { n: Math.round(neutral) })}
        </span>
      </div>
      <span style={{ fontFamily: 'var(--e-body)', fontSize: 10, fontWeight: 700, color: 'var(--e-mid)' }}>
        {isPresent(recovery) ? t('fatigueCurveCaption', { label: recovery.value.clearAtLabel }) : recovery.missing}
      </span>
      <span data-fatigue-readout aria-live="polite" style={{ fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1, color: 'var(--st-active)' }}>
        {isNow ? t('fatigueCurveNow', { n: Math.round(now) }) : isNeutral ? t('fatigueCurveNeutral', { n: Math.round(neutral) }) : ''}
      </span>
    </div>
  )
}
