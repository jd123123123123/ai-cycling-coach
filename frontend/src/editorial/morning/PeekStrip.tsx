import { MOTION_EASE, prefersReducedMotion } from '../motion/useReveal'

export interface Peek {
  /** "02" — the chapter you are about to reach, not the one you are on. */
  num: string
  title: string
  /** The next chapter's headline figure, or null when it is withheld. Showing
   *  the number early is the whole point of the strip; inventing one to fill
   *  the slot would be the one thing this design system never does. */
  value: string | null
}

/**
 * What is coming, one chapter ahead.
 *
 * A scroll hint that only says "scroll" asks for a flick and promises
 * nothing. This one names the next chapter AND shows its headline figure, so
 * the reward is visible before you reach it — you go looking for the 88
 * rather than discovering it. That is the entire difference between a deck
 * that gets read and a deck that gets abandoned at chapter two.
 *
 * It is also a button. Scroll is the natural gesture, but a thumb already
 * resting at the bottom of a 390px phone should not have to travel.
 */
export default function PeekStrip({ peek, onAdvance }: { peek: Peek; onAdvance: () => void }) {
  const reduced = prefersReducedMotion()

  return (
    <div
      className="morning-peek"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        // Tall enough that chapter content dissolves into the ground above the
        // strip instead of colliding with its top edge.
        background: 'linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--e-ground) 76%, transparent) 34%, var(--e-ground) 76%)',
      }}
    >
      <button
        type="button"
        data-testid="peek-strip"
        onClick={onAdvance}
        aria-label={`Next chapter: ${peek.title}`}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 24px',
          height: 'var(--m-peek-h)',
          background: 'none',
          border: 'none',
          borderTop: '1px solid var(--e-hairline)',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'inherit',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            fontFamily: 'var(--e-display)',
            fontSize: 'var(--t-micro)',
            fontWeight: 800,
            letterSpacing: '0.06em',
            color: 'var(--st-active)',
            animation: reduced ? undefined : `mDrift 2000ms ${MOTION_EASE} infinite`,
          }}
        >
          ↓
        </span>

        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'var(--e-body)',
            fontSize: 'var(--t-label)',
            fontWeight: 800,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--e-mid)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {peek.num} · {peek.title}
        </span>

        {peek.value && (
          <span
            data-testid="peek-value"
            style={{
              flexShrink: 0,
              fontFamily: 'var(--e-display)',
              fontSize: 'var(--t-lead)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: 'var(--e-ink)',
              opacity: 0.62,
            }}
          >
            {peek.value}
          </span>
        )}
      </button>
    </div>
  )
}
