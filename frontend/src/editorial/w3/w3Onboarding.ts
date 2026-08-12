/**
 * First-open gate for the W3 onboarding flow (welcome → devices → rewards →
 * garage). Backed by localStorage, no DB migration — this is a purely local
 * "has this browser seen the intro" flag, not account state.
 *
 * The Garage step's "Start riding" (and any Skip) calls markW3OnboardingSeen();
 * the W3 landing route reads hasSeenW3Onboarding() to decide whether to show
 * the intro on first open.
 */
const KEY = 'w3_onboarded'

export function hasSeenW3Onboarding(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    // Storage blocked (private mode / SSR) → never trap the rider in a loop.
    return true
  }
}

export function markW3OnboardingSeen(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* best-effort — a blocked write just means they may see the intro again */
  }
}
