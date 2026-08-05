import { ArrowLeftRight, Undo2 } from 'lucide-react'
import type { DayState } from '../state/dayState'

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
 * The root frame's own fill (#0A0B05 / #05100A / #120B05 / #051012 /
 * #0A0816 across the five instances) is an EXACT match for --g-rest /
 * --g-training / --g-trained / --g-resting / --g-evening respectively —
 * i.e. the rail is painted with var(--e-ground), the same ground
 * EditorialRoot already binds. It carries no padding of its own (matches
 * EditorialRoot's "every section pads itself" convention) and no width —
 * it is meant to fill a 24px-padded parent.
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

const SWITCH_ACTION: Record<DayState, { label: string; icon: 'swap' | 'undo' }> = {
  rest: { label: 'MAKE IT A TRAINING DAY', icon: 'swap' },
  training: { label: 'MAKE IT A REST DAY', icon: 'swap' },
  trained: { label: 'BACK TO PLANNED', icon: 'undo' },
  resting: { label: 'BACK TO SESSION DONE', icon: 'undo' },
  evening: { label: 'BACK TO SESSION DONE', icon: 'undo' },
}

export default function DayRail({
  state,
  showSwitchAction = false,
  onSwapDayType,
}: {
  state: DayState
  showSwitchAction?: boolean
  onSwapDayType?: () => void
}) {
  const activeIndex = ACTIVE_INDEX[state]
  const labels = [state === 'rest' ? 'REST DAY' : 'TRAINING DAY', 'SESSION', 'RECOVERY', 'LIGHTS OUT']
  const action = SWITCH_ACTION[state]
  const ActionIcon = action.icon === 'swap' ? ArrowLeftRight : Undo2

  return (
    <div style={{ width: '100%', background: 'var(--e-ground)', display: 'flex', flexDirection: 'column' }}>
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
            DAY STATE
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
              {action.label}
            </span>
          </button>
        </div>
      )}
      <div style={{ height: 14 }} />
      <div style={{ width: '100%', height: 1, background: 'var(--e-rule)' }} />
      <div style={{ height: 16 }} />
      <div style={{ display: 'flex', gap: 8, width: '100%' }}>
        {STEP_KEYS.map((key, i) => {
          const isActive = i === activeIndex
          const isCompleted = i < activeIndex
          const tickColor = isActive ? 'var(--st-active)' : isCompleted ? 'var(--d-3)' : 'var(--d-1)'
          const tickHeight = isActive ? 6 : 2
          const labelColor = isActive ? 'var(--st-active)' : isCompleted ? 'var(--e-mid)' : 'var(--e-off)'
          return (
            <div
              key={key}
              data-step={key}
              data-active={String(isActive)}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}
            >
              <div style={{ height: 6, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
