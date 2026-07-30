import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LocaleProvider } from '../../contexts/LocaleContext'
import type { Rehearsal } from '../../api/rehearsal'
import RouteRehearsalView from '../RouteRehearsalView'

// DashboardShell pulls in CoachChat, ShaderCanvas, MobileBottomNav etc. — a
// whole surface of its own that already has coverage elsewhere. This test is
// about RouteRehearsalView's own derived numbers, so the shell is stubbed to
// its one load-bearing job: rendering children.
vi.mock('../../components/dashboard/DashboardShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

afterEach(cleanup)

const rehearsal: Rehearsal = {
  id: 42,
  name: 'Col du Test',
  source_kind: 'gpx',
  source_ref: null,
  distance_m: 40000,
  ascent_m: 800,
  created_at: '2026-07-01T00:00:00Z',
  assumptions: { draft: 'solo', effort: 'fondo', use_weather: false },
  can_predict: true,
  missing: [],
  climbs: [],
  segments: [
    { start_m: 0, gradient_pct: 0, power_w: 200, speed_ms: 8, elapsed_s: 0, w_bal_j: 20000, climb_id: null },
    { start_m: 1000, gradient_pct: 5, power_w: 250, speed_ms: 7, elapsed_s: 150, w_bal_j: 15000, climb_id: null },
    { start_m: 2000, gradient_pct: 8, power_w: 300, speed_ms: 5, elapsed_s: 400, w_bal_j: 10000, climb_id: null },
    { start_m: 3000, gradient_pct: -3, power_w: 100, speed_ms: 12, elapsed_s: 500, w_bal_j: 18000, climb_id: null },
  ],
  band: { p10_s: 6000, p50_s: 6300, p90_s: 6600, draws: 200 },
  blow_ups: [],
  cda_is_default: false,
  durability_is_default: false,
  weather_used: false,
}

function renderPage(qc: QueryClient) {
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter initialEntries={['/rehearse/42']}>
          <Routes>
            <Route path="/rehearse/:id" element={<RouteRehearsalView />} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  )
}

describe('RouteRehearsalView — scrub readout', () => {
  it("shows the scrubbed point's W′ as a percentage of the route's full capacity", () => {
    const qc = new QueryClient()
    qc.setQueryData(['rehearsal', 42], rehearsal)
    const { container } = renderPage(qc)

    // Not container.querySelector('svg') — the header's back-arrow icon is
    // also an <svg> and comes first in document order. The profile is the
    // one with the explicit viewBox this test set up.
    const svg = container.querySelector('svg[viewBox="0 0 358 150"]')!
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 358, height: 150, right: 358, bottom: 150, x: 0, y: 0, toJSON: () => {} }) as DOMRect

    // frac 0.6 of 4 segments → floor(2.4) = index 2, w_bal_j 10000 of a
    // 20000 J capacity (the max seen across the route) → 50 %.
    fireEvent.pointerMove(svg, { clientX: 215 })

    expect(screen.getByText('50 %')).toBeTruthy()
  })

  it('shows the placeholder hint, not a readout, before any scrub', () => {
    const qc = new QueryClient()
    qc.setQueryData(['rehearsal', 42], rehearsal)
    renderPage(qc)

    expect(screen.getByText(/watts, speed and W′ at any point/i)).toBeTruthy()
    expect(screen.queryByText('50 %')).toBeNull()
  })
})
