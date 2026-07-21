// Optional, feature-detected haptics. A subtle tactile confirmation for genuine
// positive actions — never a substitute for visual feedback, and a silent no-op
// on hardware without a vibration motor (desktop, iOS Safari) or when the user
// prefers reduced motion. Guarded so a missing/blocked API can never throw.

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator === 'undefined') return
    if (reducedMotion()) return
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }
    if (typeof nav.vibrate !== 'function') return
    nav.vibrate(pattern)
  } catch {
    /* ignore — haptics are strictly optional */
  }
}

/** A light single tick — for a satisfying confirmation (RPE logged, tab done). */
export function hapticTick(): void {
  vibrate(12)
}

/** A celebratory double-pop — for an earned achievement (PB, streak, target). */
export function hapticCelebrate(): void {
  vibrate([0, 22, 60, 42])
}
