import { useEffect, useRef, useState } from 'react'

/** Owner's ruling, 2026-08-05: 400-700ms, a soft decelerating ease. */
export const MOTION_DURATION_MS = 550
export const MOTION_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
/** Per-sibling stagger so a row resolves as a wave, not a jump. */
export const MOTION_STAGGER_MS = 35

/** `transition-delay` for the Nth sibling in a staggered reveal. */
export function staggerDelay(index: number): number {
  return index * MOTION_STAGGER_MS
}

/**
 * `prefers-reduced-motion: reduce`, guarded for jsdom — `window.matchMedia`
 * is not implemented there by default, so an unguarded call throws in every
 * component test that mounts a chart. Anywhere that guard would matter,
 * treat "can't ask" the same as "no preference."
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export interface Reveal<T extends HTMLElement> {
  /** Attach to the element whose entry into the viewport should trigger the reveal. */
  ref: React.RefObject<T | null>
  /** False until the element has resolved to its final ("revealed") state — once true, it never goes back to false. */
  on: boolean
  /** True when the visitor has asked for reduced motion — `on` is true from the first render in that case. */
  reduced: boolean
}

/**
 * The one mount-animation primitive every chart shares (Bars, PMCChart,
 * FatigueCurve, ZoneRows, WeekRail here; LiveRing reuses it in the next
 * task). Render the chart's baseline/zero state while `on` is false and its
 * real values while `on` is true, with a CSS `transition` on the animated
 * property (height, `strokeDashoffset`, …) built from MOTION_DURATION_MS /
 * MOTION_EASE — omit the `transition` string entirely when `reduced` is
 * true, so the final state paints on the very first frame instead of a
 * transition that merely completes instantly.
 *
 * `on` flips true exactly once, either:
 *  - immediately, if `prefers-reduced-motion` is set (never animate for a
 *    visitor who asked not to see it), or
 *  - immediately, if `IntersectionObserver` isn't available at all (jsdom by
 *    default has neither `matchMedia` nor `IntersectionObserver` — the
 *    fallback here is "reveal now," which is also what keeps every existing
 *    DOM-assertion test meaningful without a real browser), or
 *  - the first time the attached element enters the viewport.
 */
export function useReveal<T extends HTMLElement>(): Reveal<T> {
  const [reduced] = useState(prefersReducedMotion)
  // Reduced motion, or no IntersectionObserver to wait on (jsdom's default,
  // and the honest "reveal now" fallback) both resolve synchronously at
  // init — never via a setState inside the effect body below, which would
  // just be a same-tick cascading render for a value we already know.
  const [on, setOn] = useState(() => reduced || typeof IntersectionObserver === 'undefined')
  const ref = useRef<T | null>(null)

  useEffect(() => {
    if (on) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setOn(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [on])

  return { ref, on, reduced }
}
