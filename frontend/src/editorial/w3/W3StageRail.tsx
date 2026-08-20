import { motion, useReducedMotion } from 'framer-motion'
import { useSwipeStep } from '../motion/useSwipeStep'
import { T, FONT, EASE } from './w3tokens'
import type { Stage } from '../../api/garage'

/**
 * Where the bike is standing, and how the rider moves it.
 *
 * TWO WAYS TO DO ONE THING, on purpose. The rail is a row of dots with the
 * current stage named beside them — tappable, so the target is never smaller
 * than a finger — and the whole stage area above it is swipeable, because
 * flicking the picture itself is what a rider will try first. Both go through
 * `useSwipeStep`'s ordering so they can never disagree about what "next" is.
 *
 * ONLY OWNED STAGES ARE HERE. The gallery is where a rider sees what they could
 * have; this is the set they already own, and every one of them is one tap away
 * with nothing to buy in between. A rail that mixed the two would make the
 * commonest gesture in the app — glance, swipe, glance — into a shop.
 *
 * IT DRAWS NOTHING WHEN THERE IS NOTHING TO CHOOSE. One stage means no
 * decision, and a rail with a single dot is furniture pretending to be a
 * control.
 */
export interface W3StageRailVm {
  stages: Stage[]
  current: string
  onSelect: (id: string) => void
  /** True while a switch is composing a picture that does not exist yet. */
  rendering?: boolean
}

export default function W3StageRail({ vm }: { vm: W3StageRailVm }) {
  const reduce = useReducedMotion()
  const ids = vm.stages.map((s) => s.id)
  const swipe = useSwipeStep(ids, vm.current, vm.onSelect)

  if (vm.stages.length < 2) return null

  const here = vm.stages.find((s) => s.id === vm.current) ?? vm.stages[0]

  return (
    <div
      {...swipe}
      style={{
        position: 'absolute', left: 0, right: 0, bottom: 10, zIndex: 3,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
        fontFamily: FONT, touchAction: 'pan-y',
      }}
    >
      {/* The name of where the bike is. Keyed on the id so it cross-fades on a
          switch rather than mutating in place — the label changing is the
          feedback that the swipe landed, and a silent text swap reads as a
          glitch. */}
      <motion.span
        key={here.id}
        initial={reduce ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: EASE }}
        style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1.3, textTransform: 'uppercase',
          color: vm.rendering ? T.quiet : T.ink, opacity: vm.rendering ? 0.7 : 1,
        }}
      >
        {here.name}
        {/* A place the rider EARNED reads differently from a stage the app
            handed them. One glyph, not a badge: the rail is 10 px tall. */}
        {here.is_place && <span style={{ color: T.acid, marginLeft: 5 }}>◆</span>}
      </motion.span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {vm.stages.map((s) => {
          const on = s.id === vm.current
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => { if (!on) vm.onSelect(s.id) }}
              aria-label={s.name}
              aria-current={on}
              style={{
                // 28 px of hit area around a 6 px dot: the dot is the drawing,
                // the button is the target.
                width: 28, height: 28, padding: 0, border: 0, background: 'none',
                display: 'grid', placeItems: 'center', cursor: on ? 'default' : 'pointer',
                margin: '0 -11px',
              }}
            >
              <motion.span
                animate={{
                  width: on ? 18 : 6,
                  backgroundColor: on ? T.acid : T.quiet,
                  opacity: on ? 1 : 0.55,
                }}
                transition={reduce ? { duration: 0 } : { duration: 0.28, ease: EASE }}
                style={{ height: 6, borderRadius: 100, display: 'block' }}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
