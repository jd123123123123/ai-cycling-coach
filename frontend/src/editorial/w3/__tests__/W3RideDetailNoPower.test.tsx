import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ActivityRead } from '../../../api/dashboard'

/**
 * THE RIDE THAT HAS NO DEBRIEF STILL HAS TO RENDER.
 *
 * `/analytics/activity-debrief/:id` 404s for any ride with no power stream, and
 * this page treated "no view model" as "still loading" — so on a real account
 * without a power meter nine rides in twelve showed the loading label and never
 * stopped. These tests pin the two halves of that: the 404 is not retried, and
 * the page falls back to the ride's own row instead of waiting forever.
 */

// jsdom has no ResizeObserver, and the map hero's tree reaches for one.
class RO { observe() {} unobserve() {} disconnect() {} }
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO

const fetchActivityDebrief = vi.fn()
vi.mock('../../../api/debrief', () => ({
  fetchActivityDebrief: (id: number, locale: string) => fetchActivityDebrief(id, locale),
}))

const fetchActivity = vi.fn()
vi.mock('../../../api/dashboard', async (orig) => ({
  ...(await orig<typeof import('../../../api/dashboard')>()),
  fetchActivity: (id: number) => fetchActivity(id),
}))

// Peripheral reads the reduced state does not depend on. Stubbed at the hook so
// the test stays about the fallback rather than about six other endpoints.
vi.mock('../../../hooks/usePMC', () => ({ usePMC: () => ({ data: undefined }) }))
vi.mock('../../../hooks/useActivitiesRange', () => ({ useActivitiesRange: () => ({ data: undefined }) }))
vi.mock('../../../hooks/useWallet', () => ({
  useChest: () => ({ data: undefined }),
  useClaimRide: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
  useRideEarning: () => ({ data: undefined }),
}))
vi.mock('../../../hooks/useGarage', () => ({
  useRideScene: () => ({ data: undefined }),
  useRenderRideScene: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  // The shared top bar shows the rider's avatar, which reads the garage.
  useGarage: () => ({ data: undefined }),
}))
// MapLibre does not run under jsdom, and the hero's basemap is not what is
// being tested — the route SVG fallback beneath it renders either way.
vi.mock('../../../components/crew/RouteMap', () => ({ default: () => <div data-testid="routemap" /> }))

import W3RideDetailPage from '../W3RideDetailPage'

const NO_POWER_RIDE: ActivityRead = {
  id: 4711,
  started_at: '2026-08-20T15:45:00Z',
  user_id: 6,
  sport: 'cycling',
  duration_seconds: 6432,          // 01:47:12
  distance_meters: 42_200,         // 42,2 km → Ø 23,6 km/h
  elevation_gain_m: null,          // the field that is frequently NULL
  tss: 96,
  average_hr: 138,
  max_hr: 171,
  normalized_power: null,
  average_power: null,
  calories: 1240,
  title: 'Feierabendrunde',
  source: 'garmin',
  route_polyline: [[47.1, 11.2], [47.15, 11.28], [47.2, 11.31]],
  route_grades: null,
}

const notFound = () => Object.assign(new Error('Not Found'), { response: { status: 404 } })

const mount = () => {
  // Default retries left at the library's own 3, so the assertion below is
  // about the hook's predicate rather than about the test's client.
  const qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
  return render(
    <MemoryRouter initialEntries={['/e/w3-ride/4711']}>
      <QueryClientProvider client={qc}>
        <Routes><Route path="/e/w3-ride/:id" element={<W3RideDetailPage />} /></Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  fetchActivityDebrief.mockReset().mockRejectedValue(notFound())
  fetchActivity.mockReset().mockResolvedValue(NO_POWER_RIDE)
})
afterEach(cleanup)

describe('a ride recorded without a power meter', () => {
  it('renders the ride instead of the loading label', async () => {
    mount()

    // THE DEFECT: this label used to be the whole page, permanently.
    await waitFor(() => expect(screen.queryByText('Lade deine Fahrt…')).toBeNull())

    // Its real figures, from the ride's own row.
    expect(screen.getByText('01:47:12')).toBeTruthy()   // duration
    expect(screen.getByText('42,2')).toBeTruthy()       // distance, km
    expect(screen.getByText('23,6')).toBeTruthy()       // average speed, derived
    expect(screen.getByText('171 bpm')).toBeTruthy()    // max heart rate
    expect(screen.getByText('1.240 kcal')).toBeTruthy() // calories
    expect(screen.getByText('96')).toBeTruthy()         // TSS
    expect(screen.getByText('138')).toBeTruthy()        // average heart rate

    // And it says, once and plainly, what it cannot do.
    expect(screen.getByText('Leistungsdaten.')).toBeTruthy()
    expect(screen.getByText('Zonen, Bestwerte und das KI-Urteil brauchen einen Leistungsmesser.')).toBeTruthy()
  })

  it('never stands a zero in for a figure the ride does not have', async () => {
    mount()
    await waitFor(() => expect(screen.queryByText('Lade deine Fahrt…')).toBeNull())

    // Elevation, power and intensity are all genuinely absent here.
    expect(screen.getAllByText('—').length).toBe(3)
    expect(screen.queryByText('0')).toBeNull()
    expect(screen.queryByText('0,0')).toBeNull()
  })

  it('does not retry the 404 — the answer will not change', async () => {
    mount()
    await waitFor(() => expect(screen.queryByText('Lade deine Fahrt…')).toBeNull())
    expect(fetchActivityDebrief).toHaveBeenCalledTimes(1)
  })

  it('names the missing recording, not a missing meter, when the row does carry power', async () => {
    fetchActivity.mockResolvedValue({ ...NO_POWER_RIDE, average_power: 187, normalized_power: 201 })
    mount()
    await waitFor(() => expect(screen.queryByText('Lade deine Fahrt…')).toBeNull())

    expect(screen.getByText('Tiefenanalyse.')).toBeTruthy()
    expect(screen.queryByText('Leistungsdaten.')).toBeNull()
    expect(screen.getByText('201')).toBeTruthy()   // the average it does have
  })

  it('keeps showing the loading label while the debrief is still in flight', () => {
    fetchActivityDebrief.mockReturnValue(new Promise(() => {}))
    mount()
    expect(screen.getByText('Lade deine Fahrt…')).toBeTruthy()
  })
})
