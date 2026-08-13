/**
 * The five bottom-tab destinations, as dynamic-import loaders.
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
 * `prefetchW3Tabs()` is fired from `W3TabBar` on idle (see there for why idle
 * rather than hover/touch), which makes the first tap on each tab instant.
 */

export const loadW3Today = () => import('./W3TodayPage')
export const loadW3Rides = () => import('./W3RidesPage')
export const loadW3BikeStudio = () => import('./W3BikeStudioPage')
export const loadW3Wins = () => import('./W3WinsPage')
export const loadW3Biker = () => import('./W3BikerPage')

const LOADERS = [loadW3Today, loadW3Rides, loadW3BikeStudio, loadW3Wins, loadW3Biker]

let warmed = false

/** Download + evaluate all five tab chunks. Idempotent; failures are ignored
 *  (a prefetch that misses just means the tap pays for the chunk, as before). */
export function prefetchW3Tabs(): void {
  if (warmed) return
  warmed = true
  for (const load of LOADERS) {
    void load().catch(() => {})
  }
}

/**
 * Queue the warm-up for the browser's next idle period, so it never competes
 * with the current screen's first paint or its data fetches. Returns a cancel
 * function for the caller's effect cleanup.
 */
export function scheduleW3TabPrefetch(): () => void {
  if (warmed) return () => {}
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => prefetchW3Tabs(), { timeout: 2500 })
    return () => window.cancelIdleCallback?.(id)
  }
  // Safari has no requestIdleCallback — a short timer is close enough.
  const t = window.setTimeout(prefetchW3Tabs, 1200)
  return () => window.clearTimeout(t)
}
