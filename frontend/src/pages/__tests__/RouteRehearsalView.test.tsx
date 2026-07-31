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
    { start_m: 0, gradient_pct: 0, elevation_m: null, power_w: 200, speed_ms: 8, elapsed_s: 0, w_bal_j: 20000, climb_id: null },
    { start_m: 1000, gradient_pct: 5, elevation_m: null, power_w: 250, speed_ms: 7, elapsed_s: 150, w_bal_j: 15000, climb_id: null },
    { start_m: 2000, gradient_pct: 8, elevation_m: null, power_w: 300, speed_ms: 5, elapsed_s: 400, w_bal_j: 10000, climb_id: null },
    { start_m: 3000, gradient_pct: -3, elevation_m: null, power_w: 100, speed_ms: 12, elapsed_s: 500, w_bal_j: 18000, climb_id: null },
  ],
  band: { p10_s: 6000, p50_s: 6300, p90_s: 6600, draws: 200 },
  blow_ups: [],
  cda_is_default: false,
  durability_is_default: false,
  w_prime_is_default: false,
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

/**
 * The `can_predict: false` path had no coverage at all, which is how the
 * surface came to promise a profile it did not render: the API returned
 * `segments: []` and the profile card was gated on `segments.length > 0`, so
 * the sentence "the route profile is below regardless" pointed at nothing.
 * The terrain is measured data — it is the PREDICTION that is missing.
 */
const unpaced: Rehearsal = {
  ...rehearsal,
  can_predict: false,
  missing: ['cp'],
  band: undefined,
  total_time_s: undefined,
  total_kj: undefined,
  carbs_g_per_hour: undefined,
  segments: rehearsal.segments.map((s, i) => ({
    start_m: s.start_m,
    gradient_pct: s.gradient_pct,
    elevation_m: 1000 + i * 40,
    power_w: null,
    speed_ms: null,
    elapsed_s: null,
    w_bal_j: null,
    climb_id: null,
  })),
}

describe('RouteRehearsalView — no prediction', () => {
  it('renders the profile the verdict block promises', () => {
    const qc = new QueryClient()
    qc.setQueryData(['rehearsal', 42], unpaced)
    const { container } = renderPage(qc)

    expect(screen.getByText(/NO TIME PREDICTION|KEINE ZEITVORHERSAGE/i)).toBeTruthy()
    expect(container.querySelector('svg[viewBox="0 0 358 150"]')).toBeTruthy()
    // No time anywhere — the band is the answer, and there isn't one.
    expect(container.textContent).not.toContain('1:40')
  })

  it('scrubs the real road and dashes every projected figure', () => {
    const qc = new QueryClient()
    qc.setQueryData(['rehearsal', 42], unpaced)
    const { container } = renderPage(qc)

    const svg = container.querySelector('svg[viewBox="0 0 358 150"]')!
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 358, height: 150, right: 358, bottom: 150, x: 0, y: 0, toJSON: () => {} }) as DOMRect
    fireEvent.pointerMove(svg, { clientX: 215 })

    // km and gradient are measured off the route and still read out ...
    expect(screen.getByText('2.0')).toBeTruthy()
    expect(screen.getByText('8.0 %')).toBeTruthy()
    // ... target, speed, elapsed and W′ are projections, so all four dash.
    expect(screen.getAllByText('—').length).toBe(4)
  })
})

/**
 * The map. MapLibre needs WebGL and a tile host, so in jsdom RouteMap always
 * falls back — which is exactly the case worth pinning: a rider on a phone with
 * no WebGL, or behind a blocked tile host, must still see where the road goes.
 * These tests assert the fallback and the shared cursor, not the basemap.
 */
const mapped: Rehearsal = {
  ...rehearsal,
  segments: rehearsal.segments.map((s, i) => ({
    ...s,
    elevation_m: 1000 + i * 40,
    lat: 46.5 + i * 0.01,
    lng: 11.8 + i * 0.01,
  })),
  blow_ups: [{ distance_m: 2000, climb_id: null }],
}

describe('RouteRehearsalView — the map', () => {
  it('draws the route outline even when the basemap cannot load', () => {
    const qc = new QueryClient()
    qc.setQueryData(['rehearsal', 42], mapped)
    const { container } = renderPage(qc)

    expect(container.querySelector('svg[viewBox="0 0 358 232"]')).toBeTruthy()
  })

  it('offers the fly-through', () => {
    const qc = new QueryClient()
    qc.setQueryData(['rehearsal', 42], mapped)
    renderPage(qc)

    expect(screen.getByRole('button', { name: /fly-through|Durchfahrt/i })).toBeTruthy()
  })

  it('has no map at all for a rehearsal stored before coordinates shipped', () => {
    // `rehearsal`'s segments carry no lat/lng. Drawing a map from nothing --
    // or from defaulted zeroes -- would put the route in the Atlantic.
    const qc = new QueryClient()
    qc.setQueryData(['rehearsal', 42], rehearsal)
    const { container } = renderPage(qc)

    expect(container.querySelector('svg[viewBox="0 0 358 232"]')).toBeNull()
    // The profile still scrubs, so the page is not degraded beyond the map.
    expect(container.querySelector('svg[viewBox="0 0 358 150"]')).toBeTruthy()
  })

  it('draws the W′ trace and names the lowest point of the ride', () => {
    const qc = new QueryClient()
    qc.setQueryData(['rehearsal', 42], mapped)
    renderPage(qc)

    // 10000 J of a 20000 J capacity is the deepest the route goes.
    expect(screen.getByText(/lowest 50%|tiefster Stand 50 %/i)).toBeTruthy()
  })

  it('moves one cursor: scrubbing the profile also marks the W′ trace', () => {
    const qc = new QueryClient()
    qc.setQueryData(['rehearsal', 42], mapped)
    const { container } = renderPage(qc)

    const profile = container.querySelector('svg[viewBox="0 0 358 150"]')!
    const trace = container.querySelector('svg[viewBox="0 0 358 54"]')!
    // Before the finger lands, neither carries a cursor.
    const cursorsIn = (svg: Element) => svg.querySelectorAll('circle').length

    const beforeTrace = cursorsIn(trace)
    profile.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 358, height: 150, right: 358, bottom: 150, x: 0, y: 0, toJSON: () => {} }) as DOMRect
    fireEvent.pointerMove(profile, { clientX: 215 })

    expect(cursorsIn(trace)).toBeGreaterThan(beforeTrace)
  })
})
