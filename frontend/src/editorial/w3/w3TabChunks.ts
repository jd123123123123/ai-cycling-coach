/**
 * The W3 destinations, warmed on idle.
 *
 * THE TABS ARE DECLARED HERE, ONCE, and `App.tsx` imports the components from
 * this file. They used to be two parallel lists — loaders here, `lazyWithRetry`
 * calls in `App` — kept in step by a comment asking us to keep them in step. We
 * did not: `loadW3Garage` pointed at `W3GaragePage`, the OLD catalogue garage
 * that now only answers `/e/w3-garage-old`, while the GARAGE tab renders
 * `W3EconomyPages`. So every session quietly downloaded a screen nobody can
 * reach from the bar, and the one screen the bar does reach was never warmed at
 * all. A prefetcher that drifts from the router is worse than none, because it
 * spends the bytes and reports success. One list cannot drift.
 *
 * The page modules are still only ever reached through thunks, so what lands in
 * the entry bundle is this list and nothing it points at: the app boots with
 * five arrow functions, and a screen is downloaded when it is warmed or
 * rendered, never before.
 *
 * `scheduleW3Prefetch()` is fired from `W3TabBar` on mount (see there for why
 * idle rather than hover/touch), which makes the first tap on each destination
 * instant.
 *
 * ── Two tiers, and why ────────────────────────────────────────────────────
 * TIER 1 — the five bottom tabs. One tap away from wherever the rider is
 * standing, so they go out together on the first idle period.
 *
 * TIER 2 — the screens you reach THROUGH Today and Rides: a ride, a session,
 * the plan, a goal, readiness, the crew, the challenges, the avatar studio.
 * Just as tappable, but not all five-at-once likely, and two of them
 * (`w3-session`, `w3-avatar-onboard`) carry a large inlined base64 showcase
 * asset. So they are warmed ONE AT A TIME, after tier 1 has finished, each on
 * its own idle period. That spreads the bytes and — because only one prefetch
 * is ever in flight — a real navigation triggered mid-warm-up contends with at
 * most one background request instead of eight.
 *
 * Both tiers are skipped entirely when the browser reports Data Saver or a 2G
 * connection: on a metered phone, silently downloading thirteen screens the
 * rider may never open is not a favour.
 */

import { lazyWithRetry } from '../../lib/lazyWithRetry'

// ── Tier 1 · the bottom tabs ──────────────────────────────────────────────
// ONE list, keyed by the route slug `W3TabBar` already navigates by — so a tab
// can be warmed by the same name the bar uses to reach it, and the router and
// the prefetcher cannot disagree about what a tab IS.
const TAB_LOADERS: Record<string, () => Promise<unknown>> = {
  'w3-today': () => import('./W3TodayPage'),
  'w3-rides': () => import('./W3RidesPage'),
  'w3-garage': () => import('./W3EconomyPages'),
  'w3-wins': () => import('./W3WinsPage'),
  'w3-biker': () => import('./W3BikerPage'),
}

export const W3TodayPage = lazyWithRetry(() => import('./W3TodayPage'))
export const W3RidesPage = lazyWithRetry(() => import('./W3RidesPage'))
export const W3GarageHome = lazyWithRetry(() =>
  import('./W3EconomyPages').then((m) => ({ default: m.W3GarageHome })))
export const W3WinsPage = lazyWithRetry(() => import('./W3WinsPage'))
export const W3BikerPage = lazyWithRetry(() => import('./W3BikerPage'))

const TABS = Object.values(TAB_LOADERS)

/**
 * Fetch ONE tab's chunk now, without rendering it.
 *
 * Called on the pointer-down that precedes a tap by roughly a tenth of a
 * second — free time that would otherwise be spent waiting, and enough of it to
 * cover a warm cache hit outright. Unknown slugs are a no-op: the preview routes
 * share this bar and are not worth a special case.
 *
 * Fire-and-forget by design. A prefetch that fails is not an error; it is a tap
 * that pays the old price.
 */
export function preloadTab(route: string): void {
  void TAB_LOADERS[route]?.().catch(() => {})
}

// ── Tier 2 · the non-tab destinations reachable from Today / Rides ────────
// Ordered by how soon a rider typically reaches them, cheapest-and-likeliest
// first, so an interrupted warm-up has still bought the most.
const SECONDARY = [
  () => import('./W3ShopPage'),          // /e/w3-shop         — the garage's own CTA
  () => import('./W3RideDetailPage'),    // /e/w3-ride/:id     — tapping a ride
  () => import('./W3ReadinessPage'),     // /e/w3-readiness    — Today's hero
  () => import('./W3PlanPage'),          // /e/w3-plan         — Today's plan strip
  () => import('./W3GoalPage'),          // /e/w3-goal         — from the plan
  () => import('./W3ChallengesPage'),    // /e/w3-challenges   — from Wins
  () => import('./W3CrewPage'),          // /e/w3-crew         — from Biker
  () => import('./W3SessionPage'),       // /e/w3-session      — heavy (showcase bike)
  () => import('./W3AvatarOnboardPage'), // /e/w3-avatar-onboard — heavy (showcase rider)
]

let warmed = false

/** True when the browser says the rider is on Data Saver or a 2G-class link —
 *  the one case where a speculative download costs more than it saves. */
function metered(): boolean {
  const c = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string }
  }).connection
  if (!c) return false
  return c.saveData === true || c.effectiveType === 'slow-2g' || c.effectiveType === '2g'
}

/** Run `fn` on the browser's next idle period. Returns a cancel function. */
function onIdle(fn: () => void, timeout: number): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout })
    return () => window.cancelIdleCallback?.(id)
  }
  // Safari has no requestIdleCallback — a short timer is close enough.
  const t = window.setTimeout(fn, Math.min(timeout, 1200))
  return () => window.clearTimeout(t)
}

/** Warm the tier-2 chunks one at a time, each on its own idle period, so the
 *  warm-up never holds the connection against a real navigation. */
function warmSecondary(i = 0): void {
  if (i >= SECONDARY.length) return
  onIdle(() => {
    void SECONDARY[i]()
      .catch(() => {})
      .finally(() => warmSecondary(i + 1))
  }, 4000)
}

/** Download + evaluate every W3 destination chunk, tabs first. Idempotent;
 *  failures are ignored (a prefetch that misses just means the tap pays for the
 *  chunk, as before). */
export function prefetchW3Tabs(): void {
  if (warmed) return
  warmed = true
  void Promise.allSettled(TABS.map((load) => load())).then(() => warmSecondary())
}

/**
 * Queue the warm-up for the browser's next idle period, so it never competes
 * with the current screen's first paint or its data fetches. Returns a cancel
 * function for the caller's effect cleanup — it cancels the tier-1 kick-off;
 * once that has started, the tier-2 chain runs to completion (it is idle-paced
 * and idempotent, and the module registry is process-wide, so there is nothing
 * to unwind).
 */
export function scheduleW3TabPrefetch(): () => void {
  if (warmed || metered()) return () => {}
  return onIdle(prefetchW3Tabs, 2500)
}
