import { useEffect, useRef } from 'react'
import { MOTION_EASE, prefersReducedMotion } from '../motion/useReveal'

/**
 * The deck's one navigation AND its one progress indicator.
 *
 * The archive deck runs two — a masthead you cannot touch and a tick rail on
 * the right edge — which means the thing that tells you where you are is not
 * the thing that takes you somewhere. Here they are the same object: the lit
 * label is the position, the hairline underneath is the distance, and every
 * label is a real button, so a rider who only wants the verdict can take one
 * tap instead of three flicks.
 *
 * Buttons, not a tab list: this navigates one scroll container rather than
 * swapping panels, so `aria-current` is the honest annotation and the deck
 * keeps its own `region` semantics.
 */
export default function ChapterRail({
  labels,
  index,
  onSelect,
}: {
  labels: readonly string[]
  index: number
  onSelect: (i: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)

  // Keep the active label on screen when the deck is scrolled rather than
  // tapped. Guarded: jsdom implements neither of these.
  useEffect(() => {
    const el = trackRef.current?.children[index] as HTMLElement | undefined
    if (!el || typeof el.scrollIntoView !== 'function') return
    el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [index])

  const progress = labels.length > 1 ? (index / (labels.length - 1)) * 100 : 0

  return (
    <nav
      className="morning-rail"
      aria-label="Morning wrap chapters"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        // The veil is why the rail stays readable over the open chapter's
        // photograph without painting an opaque bar across it.
        background: 'linear-gradient(180deg, color-mix(in srgb, var(--e-ground) 88%, transparent) 0%, color-mix(in srgb, var(--e-ground) 62%, transparent) 62%, transparent 100%)',
      }}
    >
      <div ref={trackRef} className="m-rail-track">
        {labels.map((label, i) => (
          <button
            key={label}
            type="button"
            data-testid="rail-item"
            data-active={String(i === index)}
            aria-current={i === index ? 'true' : undefined}
            onClick={() => onSelect(i)}
            style={{
              flexShrink: 0,
              background: 'none',
              border: 'none',
              padding: '10px 0',
              cursor: 'pointer',
              fontFamily: 'var(--e-body)',
              fontSize: 'var(--t-micro)',
              fontWeight: 800,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: i === index ? 'var(--st-active)' : 'var(--e-lo)',
              textShadow: 'var(--e-label-shadow)',
              transition: prefersReducedMotion() ? undefined : `color 260ms ${MOTION_EASE}`,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* One continuous hairline, filled to how far through the morning you
          are. Position is the lit label; distance is this. */}
      <div style={{ height: 1, background: 'var(--e-hairline)', position: 'relative' }}>
        <div
          data-testid="rail-progress"
          style={{
            position: 'absolute',
            inset: '0 auto 0 0',
            width: `${progress}%`,
            background: 'var(--st-active)',
            transition: prefersReducedMotion() ? undefined : `width 420ms ${MOTION_EASE}`,
          }}
        />
      </div>
    </nav>
  )
}
