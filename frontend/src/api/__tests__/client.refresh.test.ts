import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AxiosAdapter, AxiosRequestConfig } from 'axios'

/**
 * THE 401 REFRESH QUEUE, under the traffic a cold start actually produces.
 *
 * A cold load fires several protected reads at once before the in-memory access
 * token exists. The first 401 starts a refresh; the rest are meant to queue and
 * be replayed with the new token. This pins the window where that goes wrong.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** A fake backend: 401 until a token is presented, with a controllable delay. */
function makeAdapter(opts: { retryDelayMs: number }) {
  const calls: string[] = []
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig) => {
    const url = String(config.url)
    calls.push(url)

    if (url.includes('/auth/refresh')) {
      return { data: { access_token: 'fresh' }, status: 200, statusText: 'OK', headers: {}, config } as never
    }

    const auth = String(
      (config.headers as { get?: (k: string) => unknown })?.get?.('Authorization') ??
      (config.headers as Record<string, unknown>)?.Authorization ?? '',
    )
    if (auth.includes('fresh')) {
      // The replayed request. Slow on purpose: this is the window under test.
      await sleep(opts.retryDelayMs)
      return { data: { ok: url }, status: 200, statusText: 'OK', headers: {}, config } as never
    }

    const err = new Error('Unauthorized') as Error & { response?: unknown; config?: unknown }
    err.response = { status: 401, data: {}, headers: {}, config }
    err.config = config
    throw err
  }
  return { adapter, calls }
}

describe('apiClient · the 401 refresh queue', () => {
  beforeEach(() => vi.resetModules())

  it('replays a request that 401s while the first refresh is still retrying', async () => {
    const { apiClient, setAccessToken } = await import('../client')
    const { adapter } = makeAdapter({ retryDelayMs: 60 })
    apiClient.defaults.adapter = adapter
    setAccessToken(null)

    // A 401s first and owns the refresh. Its replay takes 60 ms.
    const a = apiClient.get('/garage')
    // B 401s inside that replay window — after the queue was drained, while the
    // refresh is still flagged in progress.
    await sleep(20)
    const b = apiClient.get('/athletes/me/streak')

    const settled = await Promise.race([
      Promise.all([a, b]).then(() => 'settled'),
      sleep(1500).then(() => 'HUNG'),
    ])
    expect(settled).toBe('settled')
  })
})

/** A backend with NO valid session: every protected read 401s, and the refresh
 *  itself 401s too. This is a logged-out visitor, and an expired cookie on a
 *  logged-in one — the two cases a cold start has to survive cheaply. */
function makeDeadSessionAdapter() {
  const calls: string[] = []
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig) => {
    const url = String(config.url)
    calls.push(url)
    const err = new Error('Unauthorized') as Error & { response?: unknown; config?: unknown }
    err.response = { status: 401, data: {}, headers: {}, config }
    err.config = config
    throw err
  }
  return { adapter, calls }
}

describe('apiClient · a refresh that already failed', () => {
  beforeEach(() => vi.resetModules())

  it('asks the server ONCE, however many reads follow', async () => {
    const { apiClient, setAccessToken } = await import('../client')
    const { adapter, calls } = makeDeadSessionAdapter()
    apiClient.defaults.adapter = adapter
    setAccessToken(null)

    // A cold, logged-in start fans out far more than this: the room alone reads
    // six endpoints and Today a dozen more. They arrive in waves, not at once,
    // so each one used to find `_isRefreshing` back at false and start its own
    // full round-trip to a refresh that had ALREADY definitively failed.
    for (const url of ['/garage', '/athletes/me/streak', '/rewards/wallet', '/weeks/current', '/athletes/me']) {
      await apiClient.get(url).catch(() => {})
    }

    const refreshes = calls.filter((c) => c.includes('/auth/refresh')).length
    expect(refreshes).toBe(1)
  })

  it('tries again once a login has actually succeeded', async () => {
    const { apiClient, setAccessToken } = await import('../client')
    const { adapter, calls } = makeDeadSessionAdapter()
    apiClient.defaults.adapter = adapter
    setAccessToken(null)

    await apiClient.get('/garage').catch(() => {})
    expect(calls.filter((c) => c.includes('/auth/refresh')).length).toBe(1)

    // The latch must not outlive the logged-out state, or a rider who signs in
    // is stuck with an app that never refreshes again.
    setAccessToken('a-real-token-from-login')
    await apiClient.get('/garage').catch(() => {})
    expect(calls.filter((c) => c.includes('/auth/refresh')).length).toBe(2)
  })
})

describe('apiClient · the boot refresh that AuthContext makes itself', () => {
  beforeEach(() => vi.resetModules())

  it('counts as the refusal, so the first read does not re-ask', async () => {
    const { apiClient, setAccessToken } = await import('../client')
    const { adapter, calls } = makeDeadSessionAdapter()
    apiClient.defaults.adapter = adapter
    setAccessToken(null)

    // This is what `AuthContext.restoreSession()` does on mount, directly —
    // not through the 401 retry path, which excludes auth endpoints.
    await apiClient.post('/auth/refresh').catch(() => {})
    // Then the app's reads begin.
    await apiClient.get('/garage').catch(() => {})
    await apiClient.get('/weeks/current').catch(() => {})

    expect(calls.filter((c) => c.includes('/auth/refresh')).length).toBe(1)
  })
})
