import { lazy, type ComponentType } from 'react'

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
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
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
  })
}
