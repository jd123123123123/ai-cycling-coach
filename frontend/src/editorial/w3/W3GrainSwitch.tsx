import { motion, useReducedMotion } from 'motion/react'
import { T, FONT } from './w3tokens'

/**
 * W3 · THE GRAIN SWITCH — season / month / week, in one control.
 *
 * It was born on Erfolge (`W3WinsRhythm`) and the Fahrten dock now asks the
 * same question of the same data, so it is the same control — not a second one
 * that happens to look similar. Two screens that let a rider zoom between a
 * season, a month and a week must not do it with two different gestures; that
 * is how an app stops reading as one app.
 *
 * A real segmented control, not three links: the selected grain carries the
 * whole readout beneath it, so the control has to look like it holds state.
 * The lit pill slides between the three with a layout animation — the one
 * piece of motion here that is not data.
 *
 * `track` and `off` exist because the control sits on two different grounds:
 * a `lux` card on Erfolge, the hero dock on Fahrten. The SHAPE is the idiom;
 * the tone belongs to whatever it is lying on.
 */

export type W3Grain = 'season' | 'month' | 'week'

export interface W3GrainOption {
  key: W3Grain
  label: string
}

export default function W3GrainSwitch({
  value, options, onChange, layoutId, track = T.d1, off = T.mid,
}: {
  value: W3Grain
  options: W3GrainOption[]
  onChange: (g: W3Grain) => void
  /** Unique per mounted switch — two sharing one id would fight over the pill. */
  layoutId: string
  track?: string
  off?: string
}) {
  const reduce = useReducedMotion()
  return (
    <div role="tablist" style={{
      display: 'flex', width: '100%', gap: 3, padding: 3,
      background: track, borderRadius: 100,
    }}>
      {options.map((o) => {
        const on = o.key === value
        return (
          <button
            key={o.key}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.key)}
            style={{
              position: 'relative', flex: 1, height: 30, border: 0, background: 'transparent',
              cursor: 'pointer', fontFamily: FONT, padding: 0,
            }}
          >
            {on && (
              <motion.div
                layoutId={layoutId}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                style={{ position: 'absolute', inset: 0, borderRadius: 100, background: T.acid }}
              />
            )}
            <span style={{
              position: 'relative', fontSize: 9.5, fontWeight: 700, letterSpacing: 1.1,
              color: on ? T.bg : off,
            }}>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
