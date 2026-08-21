import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

/**
 * Wrapper around React.lazy that self-heals stale-chunk failures.
 *
 * After a deploy the browser may still hold an old index.html that references
 * chunk filenames which no longer exist on the server. The dynamic import()
 * then rejects with a "Failed to fetch dynamically imported module" /
 * ChunkLoadError. When that happens we perform a ONE-TIME full page reload so
 * the browser fetches the fresh index.html (and the new chunk names) instead of
 * white-screening. A sessionStorage flag guards against reload loops in case
 * the failure is genuine (offline, real 404) rather than a stale deploy.
 */
/** A lazy component that can also be asked for its chunk EARLY. See `preload`. */
export type Preloadable<T extends ComponentType<unknown>> =
  LazyExoticComponent<T> & { preload: () => void }

export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): Preloadable<T> {
  const component = lazy(async () => {
    const flagKey = 'chunk-reload-attempted'
    try {
      const component = await factory()
      // Successful load — clear the guard so a future stale deploy can reload again.
      window.sessionStorage.removeItem(flagKey)
      return component
    } catch (error) {
      const alreadyReloaded = window.sessionStorage.getItem(flagKey)
      if (!alreadyReloaded) {
        window.sessionStorage.setItem(flagKey, '1')
        window.location.reload()
        // Return a never-resolving promise so nothing renders before the reload.
        return new Promise<{ default: T }>(() => {})
      }
      // Already tried a reload — genuine failure, let the ErrorBoundary handle it.
      throw error
    }
  }) as Preloadable<T>

  /**
   * Fetch this route's chunk NOW, without rendering it.
   *
   * A tap on a tab otherwise costs a network round-trip before the screen can
   * even begin to render — the one wait the rider always notices, because it
   * happens after they have already committed to going somewhere. Calling this
   * during idle time, or on the pointer-down that precedes the tap by roughly
   * a tenth of a second, means the module is in memory by the time the router
   * asks for it.
   *
   * Deliberately fire-and-forget: a prefetch that fails is not an error, it is
   * simply a tap that pays the old price. The rejection is swallowed so it
   * cannot reach the retry logic above and reload the page for a screen the
   * rider never asked to see.
   */
  component.preload = () => { void factory().catch(() => {}) }
  return component
}
