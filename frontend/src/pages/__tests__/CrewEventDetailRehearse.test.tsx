import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { LocaleProvider } from '../../contexts/LocaleContext'
import CrewEventDetailView from '../CrewEventDetailView'

const createRehearsal = vi.fn()
vi.mock('../../api/rehearsal', () => ({
  createRehearsal: (body: unknown) => createRehearsal(body),
}))

const event = {
  id: 3,
  crew_id: 5,
  creator_user_id: 9,
  creator_handle: 'luca',
  name: 'Sunrise loop',
  kind: 'group_ride',
  starts_at: '2026-08-02T05:30:00Z',
  description: null,
  meeting_point: null,
  has_tour: true,
  tour_filename: 'loop.gpx',
  tour_polyline: [[46.0, 11.0], [46.01, 11.0], [46.02, 11.0]],
  tour_distance_m: 42000,
  tour_elevation_m: 640,
  tour_profile: [[0, 100], [1000, 180]],
  tour_descent_m: 640,
  tour_max_grade_pct: 9,
  tour_waypoints: null,
  attendees: [],
  my_status: null,
}

let hasTour = true
vi.mock('../../hooks/useCrewEvents', () => ({
  useCrewEvent: () => ({
    data: { ...event, has_tour: hasTour },
    isLoading: false,
    isError: false,
  }),
  useRsvpCrewEvent: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('../../hooks/useCrewEventWeather', () => ({
  useCrewEventWeather: () => ({ data: null }),
}))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 } }) }))
// The basemap needs a network tile source; the page already falls back to its
// own SVG track without it.
vi.mock('../../components/crew/RouteMap', () => ({ default: () => null }))

afterEach(() => {
  cleanup()
  hasTour = true
})

function renderPage() {
  return render(
    <LocaleProvider>
      <MemoryRouter initialEntries={['/crew/events/3']}>
        <Routes>
          <Route path="/crew/events/:id" element={<CrewEventDetailView />} />
          <Route path="/rehearse/:id" element={<span data-testid="landed">rehearsal</span>} />
        </Routes>
      </MemoryRouter>
    </LocaleProvider>,
  )
}

describe('CrewEventDetailView — "Rehearse this ride"', () => {
  it('rehearses the event and lands on the rehearsal page', async () => {
    createRehearsal.mockResolvedValue({ id: 55 })
    renderPage()
    fireEvent.click(screen.getByText(/Diese Runde proben|Rehearse this ride/))

    await waitFor(() => expect(screen.getByTestId('landed')).toBeTruthy())
    // A crew event is a group ride, so the projection starts in a wheel
    // rather than solo. `effort` stays unset — how hard the athlete intends
    // to ride is theirs to say, not ours to guess.
    expect(createRehearsal).toHaveBeenCalledWith(
      expect.objectContaining({
        source_kind: 'crew_event',
        source_ref: 3,
        name: 'Sunrise loop',
        draft: 'small_group',
        effort: undefined,
      }),
    )
  })

  it('is absent while the host has uploaded no tour', () => {
    hasTour = false
    renderPage()
    expect(screen.queryByText(/Diese Runde proben|Rehearse this ride/)).toBeNull()
  })
})
