import { useMemo } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { T } from './w3tokens'

/**
 * W3 · THE PAYOFF — the half-second after the knob snaps.
 *
 * Coins thrown out of the centre on real trajectories: each one gets its own
 * angle, distance, spin and delay, so the burst reads as a handful of objects
 * rather than one animated texture. That difference is the entire effect; a
 * symmetrical fan of identical dots looks like a loading spinner.
 *
 * It draws over everything, catches no pointer events, and lasts under a
 * second — a celebration the rider has to wait out is a toll, not a reward.
 *
 * Under `prefers-reduced-motion` it renders one calm ring instead. Something
 * still happens, because acknowledgement is not decoration; it just does not
 * fly across the screen.
 */

const COUNT = 22

export interface W3CoinBurstProps {
  /** Flip to true at the moment of the claim. */
  active: boolean
  tone?: string
}

export default function W3CoinBurst({ active, tone = T.acid }: W3CoinBurstProps) {
  const reduce = useReducedMotion()

  // Fixed once per mount: a burst that re-randomises on re-render would jitter
  // mid-flight, and React re-renders plenty during a mutation.
  const coins = useMemo(
    () => Array.from({ length: COUNT }, (_, i) => {
      const angle = (i / COUNT) * Math.PI * 2 + (i % 3) * 0.28
      const reach = 110 + ((i * 37) % 90)
      return {
        x: Math.cos(angle) * reach,
        y: Math.sin(angle) * reach * 0.78 - 40,   // biased upward: they are thrown, not spilled
        size: 9 + ((i * 13) % 9),
        delay: ((i * 17) % 120) / 1000,
        spin: (i % 2 ? 1 : -1) * (180 + (i * 29) % 220),
      }
    }),
    [],
  )

  if (!active) return null

  if (reduce) {
    return (
      <motion.div aria-hidden
        initial={{ opacity: 0.9, scale: 0.4 }}
        animate={{ opacity: 0, scale: 1.9 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        style={{
          position: 'fixed', left: '50%', top: '42%', width: 220, height: 220,
          marginLeft: -110, marginTop: -110, borderRadius: 999,
          border: `2px solid ${tone}`, pointerEvents: 'none', zIndex: 90,
        }} />
    )
  }

  return (
    <div aria-hidden style={{
      position: 'fixed', left: '50%', top: '42%', width: 0, height: 0,
      pointerEvents: 'none', zIndex: 90,
    }}>
      {coins.map((c, i) => (
        <motion.span
          key={i}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.4, rotate: 0 }}
          animate={{
            x: c.x,
            // Up, then gravity takes it — two keyframes are the difference
            // between thrown and merely moved.
            y: [0, c.y, c.y + 70],
            opacity: [0, 1, 0],
            scale: [0.4, 1, 0.85],
            rotate: c.spin,
          }}
          transition={{ duration: 0.9, delay: c.delay, ease: [0.16, 0.8, 0.3, 1] }}
          style={{
            position: 'absolute', width: c.size, height: c.size, borderRadius: 999,
            background: tone, boxShadow: `0 0 12px ${tone}80`,
          }} />
      ))}
      {/* One shockwave under the coins, so the burst has an origin. */}
      <motion.span
        initial={{ opacity: 0.5, scale: 0.2 }}
        animate={{ opacity: 0, scale: 2.4 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        style={{
          position: 'absolute', left: -90, top: -90, width: 180, height: 180,
          borderRadius: 999, border: `2px solid ${tone}`,
        }} />
    </div>
  )
}
