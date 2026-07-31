import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import TargetTimeCard from '../TargetTimeCard'
import type { Rehearsal } from '../../../api/rehearsal'

const base: Rehearsal = {
  id: 1,
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
  segments: [],
  band: { p10_s: 6000, p50_s: 6300, p90_s: 6600, draws: 200 },
  blow_ups: [],
  cda_is_default: false,
  durability_is_default: false,
  w_prime_is_default: false,
  weather_used: false,
}

afterEach(cleanup)

describe('TargetTimeCard', () => {
  it('says nothing when no target time was asked for', () => {
    const { container } = render(<TargetTimeCard data={base} de={false} />)
    expect(container.innerHTML).toBe('')
  })

  it('confirms a reachable target and names the intensity it demands', () => {
    render(
      <TargetTimeCard
        data={{
          ...base,
          target_time_s: 17100,
          target_reachable: true,
          target_costs_blow_up: false,
          target_intensity_pct: 104,
        }}
        de={false}
      />,
    )
    expect(screen.getByText(/that works/i)).toBeTruthy()
    expect(screen.getByText(/104% of your chosen effort/i)).toBeTruthy()
  })

  it('separates "the clock allows it" from "your body allows it"', () => {
    // The failure this guards: a rider reads a green "yes", rides to it, and
    // blows up at km 84 — failed by the card, not by their legs.
    render(
      <TargetTimeCard
        data={{
          ...base,
          target_time_s: 17100,
          target_reachable: true,
          target_costs_blow_up: true,
          target_intensity_pct: 118,
        }}
        de={false}
      />,
    )
    expect(screen.getByText(/empties you/i)).toBeTruthy()
    expect(screen.getByText(/ceiling, not a plan/i)).toBeTruthy()
    expect(screen.queryByText(/^that works$/i)).toBeNull()
  })

  it('refuses an impossible target and says what IS possible', () => {
    render(
      <TargetTimeCard
        data={{
          ...base,
          target_time_s: 7200,
          target_reachable: false,
          target_costs_blow_up: false,
          fastest_possible_s: 16200,
        }}
        de={false}
      />,
    )
    expect(screen.getByText(/out of reach/i)).toBeTruthy()
    // 16200 s = 4:30 — the honest alternative, not the requested 2:00.
    expect(screen.getByText(/4:30/)).toBeTruthy()
    // And it does not show an intensity, because there is no plan to ride.
    expect(screen.queryByText(/of your chosen effort/i)).toBeNull()
  })

  it('speaks German', () => {
    render(
      <TargetTimeCard
        data={{
          ...base,
          target_time_s: 17100,
          target_reachable: true,
          target_costs_blow_up: false,
          target_intensity_pct: 104,
        }}
        de
      />,
    )
    expect(screen.getByText(/Das geht/)).toBeTruthy()
    expect(screen.getByText(/ZIELZEIT 4:45/)).toBeTruthy()
  })
})
