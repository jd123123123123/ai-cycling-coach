import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query'

/**
 * The query cache, kept across page loads.
 *
 * WHY: the cache was memory-only, so every full load started empty. `gcTime`
 * only ever helped within one page session — open the app a second time and
 * the whole serial chain ran again (refresh → me → consents → chunk → data)
 * with a loading screen in front of it. A rider who opened the app this
 * morning has all of yesterday's answers on their device; there is no reason
 * to make them wait for the network to say the same thing again. The refetch
 * still runs; it just lands underneath data that is already on screen — the
 * same argument `queryClient`'s `gcTime` comment makes, extended past reload.
 *
 * WHAT IS NOT KEPT, and why it is measured rather than named:
 * this app inlines rendered images as base64 data URLs (a bike collectible is
 * ~200–400 kB, a composed scene similar). Persisting those would blow
 * localStorage's ~5 MB quota on the first write and throw. Rather than keep a
 * denylist of key prefixes — which rots the moment somebody adds a screen —
 * anything that serialises too large is simply dropped. Images are big; that
 * is a structural fact about them, not a naming convention.
 *
 * The store is cleared on sign-out and whenever it turns out to belong to a
 * different rider, so a shared device never shows one person another's numbers.
 */

const KEY = 'ridr.qc.v1'

/** Bumped by hand when a cached shape changes in a way hydration can't survive. */
const VERSION = 1

/** Older than this and the network is a better answer than the disk. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000

/** One query bigger than this is an image. Dropped, never persisted. */
const MAX_QUERY_BYTES = 40_000

/** Total budget. localStorage gives ~5 MB; we take a small fraction of it. */
const MAX_TOTAL_BYTES = 1_500_000

interface Envelope {
  v: number
  at: number
  /** Who this cache belongs to. Verified once the session resolves. */
  uid: number | null
  state: unknown
}

function read(): Envelope | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const env = JSON.parse(raw) as Envelope
    if (env.v !== VERSION) return null
    if (!env.at || Date.now() - env.at > MAX_AGE_MS) return null
    return env
  } catch {
    return null
  }
}

export function clearPersistedQueries(): void {
  try { localStorage.removeItem(KEY) } catch { /* private mode; nothing to clear */ }
}

/**
 * Put yesterday's answers back before the first render.
 *
 * Called at module scope so the very first paint already has data — hydrating
 * inside an effect would render the empty state first and defeat the point.
 */
export function hydratePersistedQueries(client: QueryClient): void {
  const env = read()
  if (!env) return
  try {
    hydrate(client, env.state)
  } catch {
    // A shape we can't read is a shape we shouldn't keep.
    clearPersistedQueries()
  }
}

/**
 * The rider this cache is for, as recorded at write time.
 * `null` when nothing is stored or it predates a known user.
 */
export function persistedUserId(): number | null {
  return read()?.uid ?? null
}

let _uid: number | null = null

/** Tell the store whose data it is now holding. */
export function setPersistUser(id: number | null): void {
  _uid = id
}

function write(client: QueryClient): void {
  try {
    const state = dehydrate(client, {
      shouldDehydrateQuery: (q) => {
        if (q.state.status !== 'success' || q.state.data === undefined) return false
        try {
          return JSON.stringify(q.state.data).length <= MAX_QUERY_BYTES
        } catch {
          return false   // not serialisable → not persistable
        }
      },
    })
    const payload = JSON.stringify({ v: VERSION, at: Date.now(), uid: _uid, state } satisfies Envelope)
    if (payload.length > MAX_TOTAL_BYTES) return
    localStorage.setItem(KEY, payload)
  } catch {
    // Quota, private mode, or a value that would not stringify. A cache that
    // cannot be written is not an error the rider should ever hear about.
  }
}

/**
 * Write on the way out rather than on every change.
 *
 * `pagehide` is the event that actually fires when a mobile browser puts the
 * page away — `beforeunload` does not, reliably, on iOS — and `visibilitychange`
 * covers the app being backgrounded without being unloaded, which on a phone is
 * the common case by a wide margin.
 */
export function startPersistingQueries(client: QueryClient): () => void {
  const save = () => write(client)
  const onHidden = () => { if (document.visibilityState === 'hidden') save() }

  window.addEventListener('pagehide', save)
  document.addEventListener('visibilitychange', onHidden)

  return () => {
    window.removeEventListener('pagehide', save)
    document.removeEventListener('visibilitychange', onHidden)
  }
}
