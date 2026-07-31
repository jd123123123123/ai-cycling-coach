import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CompareRehearsals from '../CompareRehearsals'
import type { Rehearsal, RehearsalListItem } from '../../../api/rehearsal'

const listRehearsals = vi.hoisted(() => vi.fn())
vi.mock('../../../api/rehearsal', async (orig) => ({
  ...(await orig<typeof import('../../../api/rehearsal')>()),
  listRehearsals,
}))

const current: Rehearsal = {
  id: 1,
  name: 'Sellaronda',
  source_kind: 'gpx',
  source_ref: null,
  distance_m: 140_000,
  ascent_m: 4000,
  created_at: '2026-07-01T00:00:00Z',
  assumptions: { draft: 'solo', effort: 'fondo', use_weather: false, surface: 'asphalt' },
  can_predict: true,
  missing: [],
  climbs: [],
  segments: [],
  total_time_s: 21600, // 6:00
  band: { p10_s: 20000, p50_s: 21600, p90_s: 23000, draws: 200 },
  blow_ups: [],
  cda_is_default: false,
  durability_is_default: false,
  w_prime_is_default: false,
  weather_used: false,
}

const flatter: RehearsalListItem = {
  id: 2,
  name: 'Flachrunde',
  source_kind: 'gpx',
  distance_m: 90_000,
  ascent_m: 500,
  created_at: '2026-06-01T00:00:00Z',
  can_predict: true,
  total_time_s: 14400, // 4:00
}

function renderCompare(items: RehearsalListItem[]) {
  listRehearsals.mockResolvedValue(items)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <CompareRehearsals current={current} de={false} />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  listRehearsals.mockReset()
})

describe('CompareRehearsals', () => {
  it('offers the athlete’s other rehearsals', async () => {
    renderCompare([flatter])
    expect(await screen.findByRole('button', { name: 'Flachrunde' })).toBeTruthy()
  })

  it('puts the two times side by side once one is picked', async () => {
    renderCompare([flatter])
    fireEvent.click(await screen.findByRole('button', { name: 'Flachrunde' }))

    await waitFor(() => expect(screen.getByText('6:00')).toBeTruthy())
    expect(screen.getByText('4:00')).toBeTruthy()
  })

  it('explains the gap with terrain, not just with minutes', async () => {
    // Five hours over 140 km and 4,000 m is not "slower" than four hours over
    // 90 km flat — the two figures under the time are what make it mean
    // anything.
    renderCompare([flatter])
    fireEvent.click(await screen.findByRole('button', { name: 'Flachrunde' }))

    await waitFor(() => expect(screen.getByText(/120 minutes longer/i)).toBeTruthy())
    expect(screen.getByText('+50.0 km')).toBeTruthy()
    expect(screen.getByText('+3500 m')).toBeTruthy()
  })

  it('never offers itself', async () => {
    renderCompare([flatter, { ...flatter, id: current.id, name: 'Sellaronda' }])
    await screen.findByRole('button', { name: 'Flachrunde' })
    expect(screen.queryByRole('button', { name: 'Sellaronda' })).toBeNull()
  })

  it('skips rehearsals with nothing to compare', async () => {
    // A rehearsal with no prediction would answer nothing when tapped.
    renderCompare([{ ...flatter, can_predict: false, total_time_s: null }])
    await waitFor(() => expect(listRehearsals).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Flachrunde' })).toBeNull()
  })

  it('renders nothing at all when there is nothing to compare against', async () => {
    const { container } = renderCompare([])
    await waitFor(() => expect(listRehearsals).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
  })
})
