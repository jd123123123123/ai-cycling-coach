/**
 * The W3 destinations, as dynamic-import loaders, warmed on idle.
 *
 * These are the SAME module specifiers `App.tsx` hands to `lazyWithRetry`, so
 * the bundler emits exactly one chunk per page and the ES module registry
 * dedupes: once a loader here has run, `React.lazy`'s own call resolves from
 * the already-evaluated module instead of hitting the network. (Keep the two
 * lists in step — a typo'd path here would silently prefetch a second copy.)
 *
 * Nothing is imported at module scope, only thunks, and the sole importer is
 * `W3TabBar` — which is itself inside the lazy page chunks. So this file never
 * touches the entry bundle: the app boots exactly as before, and only a rider
 * who has actually reached a W3 screen pays for the warm-up.
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

// ── Tier 1 · the bottom tabs ──────────────────────────────────────────────
export const loadW3Today = () => import('./W3TodayPage')
export const loadW3Rides = () => import('./W3RidesPage')
export const loadW3BikeStudio = () => import('./W3BikeStudioPage')
export const loadW3Wins = () => import('./W3WinsPage')
export const loadW3Biker = () => import('./W3BikerPage')

const TABS = [loadW3Today, loadW3Rides, loadW3BikeStudio, loadW3Wins, loadW3Biker]

// ── Tier 2 · the non-tab destinations reachable from Today / Rides ────────
// Ordered by how soon a rider typically reaches them, cheapest-and-likeliest
// first, so an interrupted warm-up has still bought the most.
const SECONDARY = [
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
