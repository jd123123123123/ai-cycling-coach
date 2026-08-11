import { MOTION_EASE, prefersReducedMotion } from '../motion/useReveal'

/**
 * The morning, turning over behind the deck.
 *
 * Two blooms low on the screen — indigo for the hour before light, orange for
 * the hour after — cross-faded by how far through the chapters you are. It is
 * the only thing in the deck that moves continuously, and it is deliberately
 * the only thing that carries no data: the accent means something, so the
 * mood is not allowed to borrow it.
 *
 * The blooms sit BELOW the deck (z-index) and are pointer-transparent, so
 * they never intercept the scroll they are reacting to.
 */
export default function DawnAura({ progress }: { progress: number }) {
  const t = Math.min(1, Math.max(0, progress))
  const transition = prefersReducedMotion() ? undefined : `opacity 700ms ${MOTION_EASE}, transform 700ms ${MOTION_EASE}`

  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute', inset: 0, opacity: 1 - t, transition,
          background: 'radial-gradient(132% 60% at 50% 108%, color-mix(in srgb, var(--e-dawn-night) 52%, transparent) 0%, transparent 66%)',
        }}
      />
      {/* The risen bloom also climbs a little as it arrives — a sunrise that
          only brightened in place would read as a dimmer, not a dawn. */}
      <div
        data-testid="dawn-risen"
        style={{
          position: 'absolute', inset: 0, opacity: t, transition,
          transform: `translateY(${(1 - t) * 6}%)`,
          background: 'radial-gradient(126% 66% at 50% 104%, color-mix(in srgb, var(--e-dawn-risen) 44%, transparent) 0%, transparent 64%)',
        }}
      />
    </div>
  )
}
