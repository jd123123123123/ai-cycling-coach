import { useEffect, useRef, useState } from 'react'

// Tiny motion helpers — a single source of truth for:
//   • prefers-reduced-motion detection (WCAG 2.3.3)
//   • scroll-triggered enter animations (IntersectionObserver-based useInView)
//   • inline keyframes used to animate DOM on mount without adding a global
//     CSS rule (keeps each component self-contained)

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Fire once when the element enters the viewport. Used to kick off count-ups,
 * fade-slides, and milestone flashes only when the user actually scrolls to
 * them — avoids burning animation budget on below-the-fold content.
 *
 * Returns `[ref, inView]`. Safe for SSR.
 */
export function useInViewOnce(
  rootMargin = '0px 0px -10% 0px',
): [(node: Element | null) => void, boolean] {
  const [inView, setInView] = useState(false)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const currentElRef = useRef<Element | null>(null)

  const refCb = (node: Element | null) => {
    // Unobserve any prior element to avoid leaks if the node changes.
    if (observerRef.current && currentElRef.current) {
      observerRef.current.unobserve(currentElRef.current)
    }
    currentElRef.current = node
    if (!node) return
    if (observerRef.current) observerRef.current.observe(node)
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      // Fallback: always render as in-view.
      setInView(true)
      return
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true)
            obs.disconnect()
            return
          }
        }
      },
      { rootMargin, threshold: 0 },
    )
    observerRef.current = obs
    if (currentElRef.current) obs.observe(currentElRef.current)
    return () => obs.disconnect()
  }, [rootMargin])

  return [refCb, inView]
}

/**
 * Inline style object that fades + slides a node into place. Designed to
 * be merged into any element's `style` prop. Skips animation when the user
 * has asked for reduced motion.
 */
export function fadeSlideUp({
  delayMs = 0,
  durationMs = 420,
  active = true,
}: { delayMs?: number; durationMs?: number; active?: boolean } = {}): React.CSSProperties {
  if (!active || prefersReducedMotion()) {
    return { opacity: 1, transform: 'none' }
  }
  return {
    opacity: 1,
    transform: 'translateY(0)',
    transition: `opacity ${durationMs}ms ease-out ${delayMs}ms, transform ${durationMs}ms cubic-bezier(.22,1,.36,1) ${delayMs}ms`,
  }
}

/**
 * Matching initial-state style — apply before `active` flips true.
 */
export const fadeSlideInitial: React.CSSProperties = {
  opacity: 0,
  transform: 'translateY(6px)',
}

// ----- Apple spring tokens (apple-2027 §2.1) -----
// Framer Motion mapping: stiffness k = (2π/response)², damping c = 2 × damping × √k
// Values precomputed so components stay declarative.
export const springs = {
  smooth:      { type: 'spring' as const, stiffness: 130,  damping: 19 },
  snappy:      { type: 'spring' as const, stiffness: 322,  damping: 32 },
  interactive: { type: 'spring' as const, stiffness: 1754, damping: 71 },
  gentle:      { type: 'spring' as const, stiffness: 62,   damping: 15 },
  bouncy:      { type: 'spring' as const, stiffness: 195,  damping: 18 },
} as const

export type SpringToken = keyof typeof springs
