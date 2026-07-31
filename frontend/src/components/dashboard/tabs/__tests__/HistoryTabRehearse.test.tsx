import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LocaleProvider } from '../../../../contexts/LocaleContext'
import type { ActivityRead } from '../../../../api/dashboard'
import HistoryTab from '../HistoryTab'

const createRehearsal = vi.fn()
vi.mock('../../../../api/rehearsal', () => ({
  createRehearsal: (body: unknown) => createRehearsal(body),
}))
// ExtraSessionsCard is a surface of its own with its own queries; this test is
// about the recent-activity rows.
vi.mock('../../ExtraSessionsCard', () => ({ default: () => null }))
vi.mock('../../../../hooks/useStreak', () => ({ useStreak: () => ({ data: { streak: 0 } }) }))

const activities: ActivityRead[] = [
  {
    id: 11,
    sport: 'cycling',
    started_at: '2026-07-28T08:00:00Z',
    distance_meters: 42000,
    duration_seconds: 5400,
    tss: 90,
    title: 'Sunday loop',
    route_polyline: [[46.0, 11.0], [46.01, 11.0], [46.02, 11.0]],
  } as ActivityRead,
  {
    id: 12,
    sport: 'cycling',
    started_at: '2026-07-27T18:00:00Z',
    distance_meters: 0,
    duration_seconds: 3600,
    tss: 60,
    title: 'Trainer session',
    route_polyline: null,
  } as ActivityRead,
]

vi.mock('../../../../hooks/useActivitiesRange', () => ({
  useActivitiesRange: () => ({ data: { activities } }),
}))

afterEach(cleanup)

function renderTab() {
  return render(
    <LocaleProvider>
      <MemoryRouter>
        <HistoryTab />
      </MemoryRouter>
    </LocaleProvider>,
  )
}

describe('HistoryTab — "Ride it again"', () => {
  it('offers a rehearsal only for rides that actually have a route', () => {
    renderTab()
    // Both rides are listed…
    expect(screen.getByText('Sunday loop')).toBeTruthy()
    expect(screen.getByText('Trainer session')).toBeTruthy()
    // …but the indoor one has no track to ride again, so it gets no offer at
    // all rather than one that would be refused by the API.
    const offers = screen.getAllByText(/Nochmal fahren|Ride it again/)
    expect(offers).toHaveLength(1)
  })

  it('creates an activity rehearsal for the row that was tapped', async () => {
    createRehearsal.mockResolvedValue({ id: 99 })
    renderTab()
    fireEvent.click(screen.getByText(/Nochmal fahren|Ride it again/))

    await waitFor(() =>
      expect(createRehearsal).toHaveBeenCalledWith({
        source_kind: 'activity',
        source_ref: 11,
        name: 'Sunday loop',
      }),
    )
  })
})
