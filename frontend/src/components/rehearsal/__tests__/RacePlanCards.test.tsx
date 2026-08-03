import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import SegmentPlan from '../SegmentPlan'
import RouteRecord from '../RouteRecord'
import FuelPlanCard from '../FuelPlanCard'
import type { RehearsalChapter, RehearsalFuel, RehearsalHistory } from '../../../api/rehearsal'

afterEach(cleanup)

const chapters: RehearsalChapter[] = [
  { start_m: 0, end_m: 24000, length_m: 24000, avg_gradient_pct: 0.4, avg_power_w: 195, duration_s: 3130, zone: 2, climb_id: null, kind: 'flat' },
  { start_m: 24000, end_m: 28200, length_m: 4200, avg_gradient_pct: 6.1, avg_power_w: 245, duration_s: 1360, zone: 4, climb_id: 1, kind: 'climb' },
  { start_m: 28200, end_m: 50000, length_m: 21800, avg_gradient_pct: -3.2, avg_power_w: 165, duration_s: 2910, zone: 1, climb_id: null, kind: 'descent' },
]

describe('SegmentPlan', () => {
  it('gives each stretch its zone, target and duration', () => {
    render(<SegmentPlan chapters={chapters} de={false} />)
    expect(screen.getByText('Z4')).toBeTruthy()
    expect(screen.getByText('@ 245 W')).toBeTruthy()
    expect(screen.getByText('22:40')).toBeTruthy()
  })

  it('names stretches the way a rider would', () => {
    render(<SegmentPlan chapters={chapters} de={false} />)
    expect(screen.getByText('Flat run')).toBeTruthy()
    expect(screen.getByText('The climb')).toBeTruthy()
    expect(screen.getByText('Descent')).toBeTruthy()
  })

  it('shows the gradient only where it is the point', () => {
    render(<SegmentPlan chapters={chapters} de={false} />)
    // The climb carries its gradient; the flat does not need one.
    expect(screen.getByText(/4\.2 km @ 6\.1 %/)).toBeTruthy()
    expect(screen.getByText(/24\.0 km ·/)).toBeTruthy()
  })

  it('renders nothing without a plan', () => {
    const { container } = render(<SegmentPlan chapters={[]} de={false} />)
    expect(container.innerHTML).toBe('')
  })

  it('speaks German', () => {
    render(<SegmentPlan chapters={chapters} de />)
    expect(screen.getByText('DER PLAN, KM FÜR KM')).toBeTruthy()
    expect(screen.getByText('Anstieg')).toBeTruthy()
  })
})

const history: RehearsalHistory = {
  attempts: [
    { activity_id: 2, date: '2026-03-14', duration_s: 12960, avg_power_w: 192 },
    { activity_id: 1, date: '2025-10-02', duration_s: 13260, avg_power_w: 186 },
  ],
  best_s: 12960,
  forecast_vs_best_s: -720,
  count: 2,
  trend_is_meaningful: true,
}

describe('RouteRecord', () => {
  it('puts past rides next to the forecast', () => {
    render(<RouteRecord history={history} forecastS={12240} de={false} />)
    expect(screen.getByText('3:36')).toBeTruthy()
    expect(screen.getByText('3:24')).toBeTruthy()
    expect(screen.getByText('forecast')).toBeTruthy()
  })

  it('says how the forecast sits against the best', () => {
    render(<RouteRecord history={history} forecastS={12240} de={false} />)
    expect(screen.getByText(/12 minutes quicker than your best/i)).toBeTruthy()
  })

  it('refuses to read a direction of travel from one ride', () => {
    // Two points are not a trend; drawing one would be exactly the confident
    // overreach this page exists to avoid.
    const single: RehearsalHistory = {
      ...history,
      attempts: [history.attempts[0]],
      count: 1,
      trend_is_meaningful: false,
    }
    render(<RouteRecord history={single} forecastS={12240} de={false} />)
    expect(screen.getByText(/too few to read a direction/i)).toBeTruthy()
  })

  it('states the PR chance as coming from the range above it', () => {
    render(
      <RouteRecord
        history={history}
        pr={{ pr_s: 12960, probability: 0.83, margin_s: 720, is_estimate: true }}
        forecastS={12240}
        de={false}
      />,
    )
    expect(screen.getByText(/PR within reach/i)).toBeTruthy()
    expect(screen.getByText(/83% chance of 3:36 — read from the range above/i)).toBeTruthy()
  })

  it('does not promise a PR when the odds are against it', () => {
    render(
      <RouteRecord
        history={history}
        pr={{ pr_s: 11000, probability: 0.08, margin_s: -1240, is_estimate: true }}
        forecastS={12240}
        de={false}
      />,
    )
    expect(screen.getByText(/Not a PR day/i)).toBeTruthy()
  })

  it('renders nothing without a single past ride', () => {
    const { container } = render(<RouteRecord history={null} forecastS={12240} de={false} />)
    expect(container.innerHTML).toBe('')
  })
})

const fuel: RehearsalFuel = {
  carbs_g_per_hour_low: 70,
  carbs_g_per_hour_high: 95,
  carbs_g_total: 280,
  energy_kcal: 2431,
  fluid_l: 2.6,
  bottles: 4,
  sweat_l_per_hour: 0.75,
  temperature_c: 18,
  is_estimate: true,
}

describe('FuelPlanCard', () => {
  it('leads with carbohydrate per hour, as a range', () => {
    render(<FuelPlanCard fuel={fuel} de={false} />)
    expect(screen.getByText('70–95')).toBeTruthy()
    expect(screen.getByText(/g carbs\/hour/i)).toBeTruthy()
  })

  it('never speaks the language of a diet', () => {
    // The framing ORDER is the mechanism of harm. This card must not read as
    // a deficit, a balance, or a weight target anywhere.
    const { container } = render(<FuelPlanCard fuel={fuel} de={false} />)
    const text = (container.textContent ?? '').toLowerCase()
    for (const word of ['deficit', 'burn', 'balance', 'weight', 'surplus', 'net ']) {
      expect(text).not.toContain(word)
    }
  })

  it('adds a heat warning only when it is actually hot', () => {
    const { container } = render(<FuelPlanCard fuel={fuel} de={false} />)
    expect((container.textContent ?? '')).not.toMatch(/refill stop/i)

    cleanup()
    render(<FuelPlanCard fuel={{ ...fuel, temperature_c: 31, sweat_l_per_hour: 1.14 }} de={false} />)
    expect(screen.getByText(/31 °C expected/)).toBeTruthy()
    expect(screen.getByText(/refill stop/i)).toBeTruthy()
  })

  it('explains why the target is a range', () => {
    render(<FuelPlanCard fuel={fuel} de={false} />)
    expect(screen.getByText(/your gut is the limiter/i)).toBeTruthy()
  })

  it('renders nothing without a fuel plan', () => {
    const { container } = render(<FuelPlanCard fuel={null} de={false} />)
    expect(container.innerHTML).toBe('')
  })
})
