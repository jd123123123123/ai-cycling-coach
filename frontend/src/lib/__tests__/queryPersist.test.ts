import { describe, it, expect, beforeEach, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import {
  hydratePersistedQueries, startPersistingQueries, clearPersistedQueries,
  persistedUserId, setPersistUser,
} from '../queryPersist'

const KEY = 'ridr.qc.v1'

/** A client holding one already-resolved query, the way a live session would. */
async function clientWith(key: unknown[], data: unknown) {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await c.fetchQuery({ queryKey: key, queryFn: async () => data })
  return c
}

/** Fire the event the persister actually listens for. */
function putPageAway() {
  window.dispatchEvent(new Event('pagehide'))
}

beforeEach(() => {
  localStorage.clear()
  setPersistUser(null)
})

describe('queryPersist · what comes back', () => {
  it('has the data on the first render of the next load, with no fetch', async () => {
    const a = await clientWith(['today'], { ftp: 286 })
    startPersistingQueries(a)()   // subscribe, then unsubscribe — listeners stay for the test
    startPersistingQueries(a)
    putPageAway()

    const b = new QueryClient()
    hydratePersistedQueries(b)

    expect(b.getQueryData(['today'])).toEqual({ ftp: 286 })
  })

  it('drops a query too large to be anything but an image', async () => {
    const bike = `data:image/webp;base64,${'A'.repeat(300_000)}`
    const c = await clientWith(['garage'], { bike_image: bike })
    await c.fetchQuery({ queryKey: ['today'], queryFn: async () => ({ ftp: 286 }) })
    startPersistingQueries(c)
    putPageAway()

    const b = new QueryClient()
    hydratePersistedQueries(b)

    expect(b.getQueryData(['garage'])).toBeUndefined()
    expect(b.getQueryData(['today'])).toEqual({ ftp: 286 })
    expect(localStorage.getItem(KEY)!.length).toBeLessThan(50_000)
  })

  it('ignores a store older than a day rather than showing yesterday as today', async () => {
    const c = await clientWith(['today'], { ftp: 286 })
    startPersistingQueries(c)
    putPageAway()

    const env = JSON.parse(localStorage.getItem(KEY)!)
    env.at = Date.now() - 25 * 60 * 60 * 1000
    localStorage.setItem(KEY, JSON.stringify(env))

    const b = new QueryClient()
    hydratePersistedQueries(b)
    expect(b.getQueryData(['today'])).toBeUndefined()
  })

  it('ignores a store written by an older version', async () => {
    const c = await clientWith(['today'], { ftp: 286 })
    startPersistingQueries(c)
    putPageAway()

    const env = JSON.parse(localStorage.getItem(KEY)!)
    env.v = 0
    localStorage.setItem(KEY, JSON.stringify(env))

    const b = new QueryClient()
    hydratePersistedQueries(b)
    expect(b.getQueryData(['today'])).toBeUndefined()
  })
})

describe('queryPersist · whose data it is', () => {
  it('records the rider it was written for', async () => {
    setPersistUser(42)
    const c = await clientWith(['today'], { ftp: 286 })
    startPersistingQueries(c)
    putPageAway()

    expect(persistedUserId()).toBe(42)
  })

  it('takes the data off the device when it is cleared', async () => {
    const c = await clientWith(['today'], { ftp: 286 })
    startPersistingQueries(c)
    putPageAway()
    expect(localStorage.getItem(KEY)).not.toBeNull()

    clearPersistedQueries()
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(persistedUserId()).toBeNull()
  })
})

describe('queryPersist · a store that cannot be used is never an error', () => {
  it('survives corrupt JSON', () => {
    localStorage.setItem(KEY, '{not json')
    const b = new QueryClient()
    expect(() => hydratePersistedQueries(b)).not.toThrow()
  })

  it('survives a full or refusing localStorage', async () => {
    const c = await clientWith(['today'], { ftp: 286 })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    startPersistingQueries(c)
    expect(() => putPageAway()).not.toThrow()
    setItem.mockRestore()
  })
})
