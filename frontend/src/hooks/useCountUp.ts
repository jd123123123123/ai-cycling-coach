import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../utils/motion'

// Count-up animation — the Strava recap signature. Used sparingly so it stays
// meaningful: hero numbers, celebration surfaces, never ambient data.
//
// Runs once when the target value first becomes stable. If the target
// changes again later (e.g., query refetch), we re-animate from the previous
// displayed value for continuity rather than snapping.
//
// Respects `prefers-reduced-motion` — users who have opted out get the final
// value instantly without the count-up. WCAG 2.1 (2.3.3) baseline.

interface Options {
  /** ms — total animation duration. Strava sits around 1200–1600ms; default 1100. */
  durationMs?: number
  /** Number of decimal places to display. Defaults to 0 (integer). */
  digits?: number
  /** Skip animation if the target is 0 or NaN to avoid an awkward "0 → 0" tick. */
  skipZero?: boolean
}

/** Ease-out cubic — quick start, gentle stop. Matches Apple's default. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function useCountUp(target: number, options: Options = {}): number {
  const { durationMs = 1100, digits = 0, skipZero = true } = options
  const round = (n: number) => (digits === 0 ? Math.round(n) : Number(n.toFixed(digits)))
  const [value, setValue] = useState<number>(
    skipZero && !Number.isFinite(target) ? 0 : round(target),
  )
  const prevTargetRef = useRef<number>(target)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    if (!Number.isFinite(target)) return
    if (skipZero && target === 0) {
      setValue(0)
      return
    }

    // Honor prefers-reduced-motion: snap to the final value, no animation.
    if (prefersReducedMotion()) {
      setValue(round(target))
      prevTargetRef.current = target
      return
    }

    const from = prevTargetRef.current
    const to = target
    if (from === to) return

    const start = performance.now()
    const tick = (now: number) => {
      const elapsed = now - start
      const t = Math.min(1, elapsed / durationMs)
      const eased = easeOutCubic(t)
      const next = from + (to - from) * eased
      setValue(round(next))
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick)
      } else {
        setValue(round(to))
        prevTargetRef.current = to
      }
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  return value
}
