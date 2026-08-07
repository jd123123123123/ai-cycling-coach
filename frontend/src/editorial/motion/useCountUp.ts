import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from './useReveal'

/**
 * Counts 0 → target so the numeral arrives WITH the chain. Returns the target
 * unchanged under reduced motion, and passes a missing target straight through
 * so a withheld reading never animates from a number we do not have.
 */
export function useCountUp(target: number | null, durationMs: number): number | null {
  const [shown, setShown] = useState<number | null>(target)
  const frame = useRef<number | null>(null)

  useEffect(() => {
    if (target == null) { setShown(null); return }
    if (prefersReducedMotion() || durationMs <= 0) { setShown(target); return }

    const started = Date.now()
    setShown(0)
    const tick = () => {
      const t = Math.min(1, (Date.now() - started) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(Math.round(target * eased))
      if (t < 1) frame.current = window.setTimeout(tick, 16)
      else setShown(target)
    }
    frame.current = window.setTimeout(tick, 16)
    return () => { if (frame.current != null) window.clearTimeout(frame.current) }
  }, [target, durationMs])

  return shown
}
