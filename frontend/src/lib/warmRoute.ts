/**
 * Start the current route's chunk downloading BEFORE auth resolves.
 *
 * THE SERIALISATION THIS REMOVES. `ProtectedRoute` renders `AppLoading` while
 * the session is being established and does not render its children — so
 * `React.lazy` is not asked for the page module until auth has finished. The
 * cold start therefore ran:
 *
 *     /auth/refresh  →  /auth/me  →  [page chunk]  →  page's own data
 *
 * four round trips end to end, with the chunk download waiting on two requests
 * it has nothing to do with. The chunk is a static asset on the same origin; it
 * could have been in flight the whole time.
 *
 * Called once at boot, it turns that into two things happening at once. It is a
 * PREFETCH, not a mount: the module lands in the bundler's cache and `lazy()`
 * resolves from it instantly when the route finally renders.
 *
 * Failures are swallowed on purpose — a warm that 404s after a deploy must not
 * break a boot that would otherwise have worked, because `lazyWithRetry` will
 * ask for the same chunk again through its own recovery path.
 */

/** Prefix → the module to warm. Longest match wins, so `/e/w3-ride-map` beats
 *  `/e/w3-ride`. Only the handful of routes a cold start actually lands on —
 *  warming everything would be a second entry bundle. */
const ROUTES: [string, () => Promise<unknown>][] = [
  ['/e/w3-today', () => import('../editorial/w3/W3TodayPage')],
  ['/e/w3-login', () => import('../editorial/w3/W3LoginPage')],
  ['/e/w3-rides', () => import('../editorial/w3/W3RidesPage')],
  ['/e/w3-plan', () => import('../editorial/w3/W3PlanPage')],
  ['/e/w3-crew', () => import('../editorial/w3/W3CrewPage')],
  ['/e/w3-wins', () => import('../editorial/w3/W3WinsPage')],
  ['/e/w3-biker', () => import('../editorial/w3/W3BikerPage')],
]

export function warmRoute(pathname: string = window.location.pathname): void {
  const hit = ROUTES
    .filter(([prefix]) => pathname.startsWith(prefix))
    .sort((a, b) => b[0].length - a[0].length)[0]
  // The bare app root lands on Today after the redirect, so warm that too.
  const load = hit?.[1] ?? (pathname === '/' ? ROUTES[0][1] : null)
  if (!load) return
  try {
    void load().catch(() => { /* a cold chunk that 404s is lazyWithRetry's job */ })
  } catch { /* never let a prefetch break a boot */ }
}
