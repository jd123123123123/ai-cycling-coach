import { ArrowLeftRight, Undo2, X } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { dayRailStepTargets, type DayState } from '../state/dayState'
import { useCopy } from '../i18n/useCopy'
import type { CopyKey } from '../i18n/copy'
import { MOTION_DURATION_MS, MOTION_EASE, prefersReducedMotion } from '../motion/useReveal'

/**
 * IMPORTANT DEVIATION FROM THE BRIEF — read before touching this file.
 *
 * The brief's sketch describes `DayRail` as a weekly calendar strip
 * (`{ letter, iso, load, isToday }[]`, seven marks, one "today"). The pen
 * component actually named "DayRail" (uKzuZ) is not that: it is a
 * four-step progress rail through the phases of *today* —
 * REST DAY|TRAINING DAY → SESSION → RECOVERY → LIGHTS OUT — with one step
 * "active" per Today state. This is confirmed by every real usage: it sits
 * inside RYP0r's Hero (right after the Meta row, before the Statement),
 * and every flagship instance (RYP0r rest, x4AxA5 training, LdBJ4 trained,
 * h54Rs resting, KYS6e evening) advances the same four steps one further
 * and re-tints the active tick/label with that state's own accent. There is
 * no weekly-strip component anywhere in the pen. The tree wins: this file
 * transcribes uKzuZ, not the brief's guess, and `chrome.test.tsx` was
 * rewritten to match. Flagging this loudly per the task brief's own
 * instruction to say so rather than silently picking one.
 *
 * Step → activeIndex mapping (from the five flagship instances):
 *   rest → 0, training → 0, trained → 1, resting → 2, evening → 3.
 * Step 0's label is "REST DAY" only in the rest state; every other state
 * shows "TRAINING DAY" there (confirmed across training/trained/resting/
 * evening instances) — a day that reached any state past 'rest' was, by
 * construction, a training day.
 *
 * Tick/label colour per step, verified identically across all five
 * instances:
 *   - completed (before the active step): tick height 2, fill var(--d-3)
 *     (#FFFFFF4D exact), label var(--e-mid) (#8A9099 exact).
 *   - active: tick height 6, fill var(--st-active), with a 16px glow at the
 *     pen's own alpha (#XXXXXX66 ≈ 40%); label var(--st-active).
 *   - upcoming (after the active step): tick height 2, fill var(--d-1)
 *     (#FFFFFF14 exact); label colour #3E444C is now var(--e-off), a token
 *     added specifically for this value — it is a distinct hex in the tree,
 *     darker than --e-lo, not a near-miss that --e-lo should stand in for.
 *
 * CORRECTED (topbar task, owner ruling "make sure the bar has a transparent
 * and not black background"): an earlier pass read the root frame's own
 * fill (#0A0B05 / #05100A / #120B05 / #051012 / #0A0816 — an EXACT match for
 * --g-rest / --g-training / --g-trained / --g-resting / --g-evening) and
 * painted THIS component with `background: var(--e-ground)`. That match is
 * real, but it describes `bUuzT` the FRAME's own background — the same
 * frame whose Meta row and DayRail sit ON TOP of a full-bleed photo (see
 * `Cover.tsx`'s own doc comment on the photographic stack). Painting DayRail
 * itself opaque put a solid ground-coloured bar between the athlete and the
 * cover photo, at exactly the strip where the pen shows the photo showing
 * through. `Cover` already renders that same ground colour as its own base
 * layer (`background: var(--e-ground)` on the Cover root, task 10.5) for the
 * no-photo case — DayRail doesn't need to repaint it, and must not, so the
 * photo is never blocked when one exists. This component is now transparent;
 * it carries no padding of its own (matches EditorialRoot's "every section
 * pads itself" convention) and no width — it is meant to fill a 24px-padded
 * parent (`Cover`, its only real caller).
 *
 * Topbar task — browsing: the four steps are now real buttons. Tapping one
 * (or swiping the screen body left/right, see `pages/TodayView.tsx`'s own
 * `useSwipeStep`) calls `onStepSelect` with that step's target `DayState` —
 * wired by the page to `useDayState().preview`, which OVERLAYS `state`
 * without writing the stored override (`setOverride`). That is the whole
 * reason browsing can never change the athlete's real day: `preview` is a
 * plain React state value, gone on reload, never touching `localStorage`.
 * Step 0 (day type) is shared by two real states — `dayRailStepTargets`
 * below resolves it from `derived` (the REAL, non-overridden day, per
 * `useDayState()`), not from whatever is currently being previewed, so
 * tapping "back" to step 0 from LIGHTS OUT always lands on the day's own
 * actual type rather than a guess.
 *
 * The "DAY STATE" header + swap action (r3xsHB) is `enabled: false` in
 * every one of the five real flagship instances — every real Today screen
 * hides it. It is kept here, off by default, behind `showSwitchAction`, so
 * a future task can opt in without re-deriving its layout. Its swap-action
 * copy/icon by state (also verified across all five instances):
 *   rest → "MAKE IT A TRAINING DAY" / swap_horiz
 *   training → "MAKE IT A REST DAY" / swap_horiz
 *   trained → "BACK TO PLANNED" / undo
 *   resting, evening → "BACK TO SESSION DONE" / undo
 * ("swap_horiz"/"undo" are Material Symbols; this project has no Material
 * Symbols font loaded and already depends on lucide-react, so
 * ArrowLeftRight/Undo2 stand in — a technical substitution, not a colour
 * approximation.) The pill fill/stroke (#XXXXXX12 / #XXXXXX47, the state
 * accent at the pen's own ~7%/~28% alpha) is var(--st-a07) / var(--st-a28);
 * the active tick's glow (#XXXXXX66, ~40% alpha) is var(--st-a40).
 */

const STEP_KEYS = ['daytype', 'session', 'recovery', 'lights-out'] as const

const ACTIVE_INDEX: Record<DayState, number> = {
  rest: 0,
  training: 0,
  trained: 1,
  resting: 2,
  evening: 3,
}

const SWITCH_ACTION_KEY: Record<DayState, { labelKey: CopyKey; icon: 'swap' | 'undo' }> = {
  rest: { labelKey: 'dayRailMakeTraining', icon: 'swap' },
  training: { labelKey: 'dayRailMakeRest', icon: 'swap' },
  trained: { labelKey: 'dayRailBackToPlanned', icon: 'undo' },
  resting: { labelKey: 'dayRailBackToDone', icon: 'undo' },
  evening: { labelKey: 'dayRailBackToDone', icon: 'undo' },
}

const resetButton: CSSProperties = {
  appearance: 'none',
  background: 'transparent',
  border: 'none',
  padding: 0,
  margin: 0,
  font: 'inherit',
  color: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
}

export default function DayRail({
  state,
  derived = state,
  showSwitchAction = false,
  onSwapDayType,
  onStepSelect,
  isPreviewing = false,
  onExitPreview,
}: {
  state: DayState
  /** The day's real, non-overridden state (`useDayState().derived`). Only
   *  affects which of 'rest'/'training' step 0 targets — defaults to `state`
   *  so a caller that has no browsing feature (e.g. the standalone chrome
   *  test) doesn't need to supply it separately. */
  derived?: DayState
  showSwitchAction?: boolean
  onSwapDayType?: () => void
  /** Called with a step's target state when the athlete taps it. Omit to
   *  render the steps as inert (no browsing control wired). */
  onStepSelect?: (next: DayState) => void
  /** True while a browsed (non-real) state is being shown — see
   *  `useDayState().isPreviewing`. Shows the dismissible preview chip. */
  isPreviewing?: boolean
  /** Clears the preview, returning to the athlete's real day. */
  onExitPreview?: () => void
}) {
  const { t } = useCopy()
  const activeIndex = ACTIVE_INDEX[state]
  const labels = [
    state === 'rest' ? t('dayRailRestDay') : t('dayRailTrainingDay'),
    t('dayRailSession'),
    t('dayRailRecovery'),
    t('dayRailLightsOut'),
  ]
  const targets = dayRailStepTargets(derived)
  const action = SWITCH_ACTION_KEY[state]
  const ActionIcon = action.icon === 'swap' ? ArrowLeftRight : Undo2

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      {showSwitchAction && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <span
            style={{
              fontFamily: 'var(--e-body)',
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: 1.7,
              color: 'var(--e-quiet)',
            }}
          >
            {t('dayRailDayState')}
          </span>
          <button
            type="button"
            onClick={onSwapDayType}
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              padding: '6px 11px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--st-a07)',
              border: '1px solid var(--st-a28)',
              cursor: 'pointer',
            }}
          >
            <ActionIcon size={13} color="var(--st-active)" />
            <span
              style={{
                fontFamily: 'var(--e-body)',
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: 1.2,
                color: 'var(--st-active)',
              }}
            >
              {t(action.labelKey)}
            </span>
          </button>
        </div>
      )}
      <div style={{ height: 14 }} />
      <div style={{ width: '100%', height: 1, background: 'var(--e-rule)' }} />
      <div style={{ display: 'flex', gap: 8, width: '100%' }}>
        {STEP_KEYS.map((key, i) => {
          const isActive = i === activeIndex
          const isCompleted = i < activeIndex
          const tickColor = isActive ? 'var(--st-active)' : isCompleted ? 'var(--d-3)' : 'var(--d-1)'
          const tickHeight = isActive ? 6 : 2
          const labelColor = isActive ? 'var(--st-active)' : isCompleted ? 'var(--e-mid)' : 'var(--e-off)'
          return (
            <button
              key={key}
              type="button"
              data-step={key}
              data-active={String(isActive)}
              aria-current={isActive ? 'step' : undefined}
              aria-label={labels[i]}
              onClick={() => onStepSelect?.(targets[i])}
              style={{ ...resetButton, flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}
            >
              <div style={{ height: 6, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <div
                  style={{
                    width: '100%',
                    height: tickHeight,
                    borderRadius: 3,
                    background: tickColor,
                    boxShadow: isActive ? '0 0 16px var(--st-a40)' : undefined,
                  }}
                />
              </div>
              <span
                style={{
                  fontFamily: 'var(--e-body)',
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: 1,
                  color: labelColor,
                }}
              >
                {labels[i]}
              </span>
            </button>
          )
        })}
      </div>
      {isPreviewing && (
        <div style={{ paddingTop: 12 }}>
          <PreviewChip onExit={onExitPreview} />
        </div>
      )}
    </div>
  )
}

/** The "you're just looking" affordance (topbar task) — shown only while
 *  `preview()` is overlaying a state other than the athlete's real one. A
 *  quiet, dismissible chip, never a modal or a banner: tapping it clears the
 *  preview via `onExitPreview` (`useDayState().preview(null)`), so the
 *  athlete can never mistake browsing for a real day-state change. Reuses
 *  `motion/useReveal.ts`'s `prefersReducedMotion`/duration/ease primitives
 *  for its own entrance rather than a bespoke transition. */
function PreviewChip({ onExit }: { onExit?: () => void }) {
  const { t } = useCopy()
  const [reduced] = useState(prefersReducedMotion)
  const [shown, setShown] = useState(reduced)

  useEffect(() => {
    if (reduced) return
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [reduced])

  return (
    <button
      type="button"
      data-preview-chip
      onClick={onExit}
      aria-label={t('dayRailPreviewAria')}
      style={{
        ...resetButton,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 11px',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--st-a07)',
        border: '1px solid var(--st-a28)',
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(-4px)',
        transition: reduced ? undefined : `opacity ${MOTION_DURATION_MS}ms ${MOTION_EASE}, transform ${MOTION_DURATION_MS}ms ${MOTION_EASE}`,
      }}
    >
      <X size={11} color="var(--st-active)" aria-hidden="true" />
      <span
        style={{
          fontFamily: 'var(--e-body)',
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: 1.2,
          color: 'var(--st-active)',
        }}
      >
        {t('dayRailPreviewChip')}
      </span>
    </button>
  )
}
