import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import W3SyncChip from '../W3SyncChip'

/**
 * The two things about this button that are quiet enough to regress unnoticed.
 *
 * A broken sync chip does not throw and does not look wrong — it renders a
 * perfectly good button that either should not be there, or that fires and
 * leaves the screen it is standing on unchanged. Neither shows up in a
 * screenshot, so both are pinned here.
 */
const status = vi.hoisted(() => ({ value: null as unknown }))
const sync = vi.hoisted(() => ({ fn: vi.fn() }))

vi.mock('../../../hooks/useGarminStatus', () => ({
  // `dataUpdatedAt` is part of the shape the chip reads: staleness is measured
  // against WHEN THE SERVER ANSWERED rather than against `Date.now()`, which is
  // both impure in a render body and a clock that drifts as a tab sits open.
  useGarminStatus: () => ({ data: status.value, dataUpdatedAt: NOW }),
}))
/** A fixed "now" for the fetch, so the staleness cases are arithmetic and not
 *  a race with the test's own runtime. */
const NOW = Date.now()
vi.mock('../../../api/garmin', () => ({
  forceGarminSync: (...a: unknown[]) => sync.fn(...a),
}))

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <W3SyncChip />
      </QueryClientProvider>,
    ),
  }
}

describe('the Today sync chip', () => {
  afterEach(cleanup)

  beforeEach(() => {
    sync.fn.mockReset().mockResolvedValue({
      activities_synced: 1, metrics_days: 1, message: 'ok',
    })
  })

  it('draws nothing at all without a connected watch', () => {
    // `POST /garmin/sync` answers 404 with no account linked, so a button here
    // could only ever produce an error. The rider with no Garmin has nothing
    // to force and the place to fix that is the devices screen.
    status.value = { connected: false, sync_enabled: null, last_sync_at: null, sync_status: null }
    const { container } = mount()
    expect(container.querySelector('button')).toBeNull()
  })

  it('is already busy when the server says a sync is running', () => {
    // The hourly scheduler can be mid-sync when this mounts. Offering a button
    // that starts a second one gets a 409 and tells the rider their own tap
    // failed, when what actually happened is the thing they wanted was
    // already happening.
    status.value = { connected: true, sync_enabled: true, last_sync_at: null, sync_status: 'syncing' }
    mount()
    const btn = screen.getByRole('button') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(btn.getAttribute('aria-busy')).toBe('true')
  })

  it('refreshes what Today reads, not just the old dashboard', async () => {
    // THE REGRESSION THIS EXISTS FOR. `useForceSync` was written for the
    // legacy dashboard and invalidated its keys. Mounted on Today it would
    // fetch the ride and then leave the week strip, the streak and the chest
    // showing the state from before the ride existed — the screen the rider
    // pressed the button on would be the one screen that did not update.
    status.value = { connected: true, sync_enabled: true, last_sync_at: null, sync_status: 'ok' }
    const { qc } = mount()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    fireEvent.click(screen.getByRole('button'))

    // Waited on the ASSERTION, not on the request: `onSuccess` fires a tick
    // after the mutation resolves, so waiting for the call itself races the
    // invalidation this test is about.
    await waitFor(() => {
      const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey))
      for (const k of ['activities', 'weeks', 'streak', 'rewards', 'adaptive']) {
        expect(keys.some((j) => j?.includes(k)), `invalidates ${k}`).toBe(true)
      }
    })
    expect(sync.fn).toHaveBeenCalledTimes(1)
  })
})

/**
 * BROKEN AND EMPTY MUST NOT LOOK THE SAME.
 *
 * `last_sync_at` and `sync_status` were on the response from the beginning and
 * nothing drew them, so a rider whose Garmin token had expired saw exactly what
 * a rider who simply had not ridden saw. One of those people should press this
 * button and the other should go and reconnect their watch, and the app told
 * neither of them which they were.
 */
describe('what the chip says about the state of the connection', () => {
  afterEach(cleanup)

  const fresh = new Date(NOW - 5 * 60_000).toISOString()
  const old = new Date(NOW - 9 * 3.6e6).toISOString()

  it('says nothing when the last sync was recent', () => {
    status.value = { connected: true, sync_enabled: true, last_sync_at: fresh, sync_status: 'ok' }
    mount()
    expect(screen.getByRole('button').getAttribute('title')).toBeNull()
  })

  it('marks a connection that is actually broken', () => {
    status.value = { connected: true, sync_enabled: true, last_sync_at: fresh, sync_status: 'auth_error' }
    mount()
    const b = screen.getByRole('button')
    expect(b.getAttribute('title')).toContain('gestört')
    expect(b.getAttribute('aria-label')).toContain('gestört')
  })

  it('marks a sync that has plainly not run in hours', () => {
    status.value = { connected: true, sync_enabled: true, last_sync_at: old, sync_status: 'ok' }
    mount()
    expect(screen.getByRole('button').getAttribute('title')).toContain('synchronisiert')
  })

  it('treats a watch that has never delivered as stale, not as fine', () => {
    status.value = { connected: true, sync_enabled: true, last_sync_at: null, sync_status: 'ok' }
    mount()
    expect(screen.getByRole('button').getAttribute('title')).toBeTruthy()
  })

  it('stays quiet while a sync is actually running', () => {
    status.value = { connected: true, sync_enabled: true, last_sync_at: null, sync_status: 'syncing' }
    mount()
    // Busy is not stale: the thing the mark would ask for is already happening.
    expect(screen.getByRole('button').getAttribute('title')).toBeNull()
  })
})
