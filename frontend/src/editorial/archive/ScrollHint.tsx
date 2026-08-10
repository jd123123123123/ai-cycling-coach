import { MOTION_EASE, prefersReducedMotion } from '../motion/useReveal'

/**
 * The forward affordance, replacing the button the earlier draft used.
 *
 * A button at the foot of a chapter competes with the deep link beside it and
 * reads as "leave"; a scroll hint reads as "there is more of this". It also
 * matches how the deck is actually navigated — one continuous scroll, not a
 * wizard. The label names the destination so the rider knows what continuing
 * buys them, which is what the bare 3 px tick in the pen never did.
 *
 * Fades out once the section is scrolled past — a hint that persists after it
 * has been acted on is noise.
 */
export default function ScrollHint({ label, dim = false }: { label: string; dim?: boolean }) {
  const reduced = prefersReducedMotion()
  return (
    <div
      data-testid="scroll-hint"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 7,
        opacity: dim ? 0 : 1,
        transition: reduced ? undefined : `opacity 300ms ${MOTION_EASE}`,
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--ar-sans)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--ar-quiet)',
        }}
      >
        {label}
      </span>
      <svg width={16} height={22} viewBox="0 0 16 22" aria-hidden="true">
        <line x1={8} y1={0} x2={8} y2={13} stroke="var(--ar-rule)" strokeWidth={1} />
        <path
          d="M3.5 12 L8 17 L12.5 12"
          fill="none"
          stroke="var(--ar-gold)"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={
            reduced
              ? undefined
              : { animation: `arDrift 1900ms ${MOTION_EASE} infinite` }
          }
        />
      </svg>
    </div>
  )
}
