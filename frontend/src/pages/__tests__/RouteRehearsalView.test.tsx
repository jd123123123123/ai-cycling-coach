import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LocaleProvider } from '../../contexts/LocaleContext'
import { LanguageProvider } from '../../contexts/LanguageContext'
import type { Rehearsal } from '../../api/rehearsal'
import RouteRehearsalView from '../RouteRehearsalView'

/**
 * This suite was rewritten on 2026-08-04 when the page was rebuilt 1:1 from
 * the pencil frame "V4 · Route Forecast (GPX)".
 *
 * The previous version tested the scrub readout, the W′ trace and the map
 * fly-through — all removed with the rest of the non-frame surface. Those
 * tests were deleted rather than adapted: coverage of a feature that no longer
 * renders is not coverage, it is a suite that fails for the right reason and
 * gets muted for the wrong one.
 *
 * What is asserted here is what the frame actually promises, plus the two
 * invariants the frame cannot express: the headline is a RANGE, and a
 * rehearsal with no FTP gets no invented time.
 */

// DashboardShell pulls in CoachChat, ShaderCanvas, MobileBottomNav etc. — a
// whole surface of its own with its own coverage. Stubbed to its one
// load-bearing job here: rendering children.
vi.mock('../../components/dashboard/DashboardShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// The basemap needs WebGL, which jsdom has not got. The SVG fallback is what
// this page renders until a tile paints, and it is what these tests read.
vi.mock('../../components/crew/RouteMap', () => ({
  default: () => <div data-testid="route-map" />,
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
  assumptions: { draft: 'solo', effort: 'fondo', use_weather: false, surface: 'asphalt' },
  can_predict: true,
  missing: [],
  climbs: [],
  segments: [
    { start_m: 0, gradient_pct: 0, elevation_m: 100, lat: 46.4, lng: 12.0, power_w: 200, speed_ms: 8, elapsed_s: 0, w_bal_j: 20000, climb_id: null },
    { start_m: 1000, gradient_pct: 5, elevation_m: 150, lat: 46.41, lng: 12.01, power_w: 250, speed_ms: 7, elapsed_s: 150, w_bal_j: 15000, climb_id: null },
    { start_m: 2000, gradient_pct: 8, elevation_m: 240, lat: 46.42, lng: 12.02, power_w: 300, speed_ms: 5, elapsed_s: 400, w_bal_j: 10000, climb_id: null },
    { start_m: 3000, gradient_pct: -3, elevation_m: 180, lat: 46.43, lng: 12.03, power_w: 100, speed_ms: 12, elapsed_s: 500, w_bal_j: 18000, climb_id: null },
  ],
  band: { p10_s: 6000, p50_s: 6300, p90_s: 6600, draws: 200 },
  blow_ups: [],
  cda_is_default: false,
  durability_is_default: false,
  w_prime_is_default: false,
  weather_used: false,
  training_effect: {
    aerobic: 3.4,
    anaerobic: 1.2,
    recovery_hours_low: 24,
    recovery_hours_high: 36,
    is_estimate: true,
  },
}

function renderPage(qc: QueryClient) {
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        {/* The page reads today's readiness (for the "fits today" pill and the
            coach note), and that hook needs the language context. */}
        <LanguageProvider>
          <MemoryRouter initialEntries={['/rehearse/42']}>
            <Routes>
              <Route path="/rehearse/:id" element={<RouteRehearsalView />} />
            </Routes>
          </MemoryRouter>
        </LanguageProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  )
}

function withData(data: Rehearsal = rehearsal) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(['rehearsal', 42], data)
  return qc
}

describe('RouteRehearsalView — the frame', () => {
  it('names the route and its source in the header', () => {
    renderPage(withData())
    expect(screen.getByText(/Route Forecast|Streckenvorschau/)).toBeTruthy()
    // Name plus relative age, so the reader knows WHICH road and how fresh.
    expect(screen.getAllByText(/Col du Test/).length).toBeGreaterThan(0)
    expect(screen.getByText('GPX')).toBeTruthy()
  })

  it('captions the map with the route and its shape', () => {
    renderPage(withData())
    expect(screen.getByTestId('route-map')).toBeTruthy()
    expect(screen.getByText(/40[.,]0 km · 800/)).toBeTruthy()
  })

  it('states the values the forecast is computed from', () => {
    renderPage(withData())
    expect(screen.getByText(/BASED ON YOUR CURRENT VALUES|BASIEREND AUF DEINEN WERTEN/)).toBeTruthy()
  })

  it('shows what the ride will cost and what the watch will say', () => {
    renderPage(withData())
    expect(screen.getByText(/WHAT YOUR GARMIN WILL SAY|WAS DEINE UHR SAGEN WIRD/)).toBeTruthy()
  })

  it('offers the export and the two secondary actions', () => {
    renderPage(withData())
    expect(screen.getByRole('button', { name: /Export pacing plan|Pacing-Plan exportieren/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Ask Coach|Coach fragen/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Save route|Route speichern/ })).toBeTruthy()
  })
})

describe('RouteRehearsalView — the invariants the frame cannot express', () => {
  it('puts a RANGE in the ring, never a lone median', () => {
    // The design shows one confident time. A bare p50 is the specific trust
    // wound this feature can cause, so the band is what renders — and the
    // median must not appear on its own anywhere.
    renderPage(withData())
    expect(screen.getByText('1:40–1:50')).toBeTruthy()
    expect(screen.queryByText('1:45')).toBeNull()
  })

  it('invents no time when the athlete has no FTP', () => {
    renderPage(
      withData({ ...rehearsal, can_predict: false, band: undefined, missing: ['cp'] }),
    )
    expect(screen.getByText(/NO TIME PREDICTION|KEINE ZEITVORHERSAGE/)).toBeTruthy()
    expect(screen.queryByText('1:40–1:50')).toBeNull()
  })

  it('names the place the ride comes apart', () => {
    renderPage(
      withData({ ...rehearsal, blow_ups: [{ distance_m: 2500, climb_id: null }] }),
    )
    expect(screen.getByText(/km 2[.,]5/)).toBeTruthy()
  })

  it('renders no map at all for a rehearsal stored before coordinates shipped', () => {
    const noCoords = {
      ...rehearsal,
      segments: rehearsal.segments.map((s) => ({ ...s, lat: undefined, lng: undefined })),
    }
    renderPage(withData(noCoords as Rehearsal))
    expect(screen.queryByTestId('route-map')).toBeNull()
  })
})
