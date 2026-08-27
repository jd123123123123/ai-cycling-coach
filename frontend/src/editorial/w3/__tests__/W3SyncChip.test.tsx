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
  useGarminStatus: () => ({ data: status.value }),
}))
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
