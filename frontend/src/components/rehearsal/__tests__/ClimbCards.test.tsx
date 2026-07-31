import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ClimbCards from '../ClimbCards'
import type { RehearsalClimb, RehearsalSegment } from '../../../api/rehearsal'

const climb: RehearsalClimb = {
  climb_id: 1,
  start_m: 1000,
  end_m: 3000,
  length_m: 2000,
  elev_gain_m: 160,
  avg_grade_pct: 8,
}

const seg = (o: Partial<RehearsalSegment> & { start_m: number }): RehearsalSegment => ({
  gradient_pct: 8,
  elevation_m: null,
  power_w: 0,
  speed_ms: 5,
  elapsed_s: 0,
  w_bal_j: 20000,
  climb_id: 1,
  ...o,
})

describe('ClimbCards', () => {
  afterEach(cleanup)

  // The card's entire reason to exist is: a genuine 0 W must never be
  // confused with "no data". A truthiness check (`stats.meanPowerW`
  // instead of `!= null`) would collapse these two cases silently.
  it('renders a real 0 W target as "0 W", not a dash', () => {
    render(
      <ClimbCards
        climbs={[climb]}
        segments={[seg({ start_m: 1000, power_w: 0 }), seg({ start_m: 2000, power_w: 0 })]}
        de
      />,
    )
    expect(screen.getByText('0 W')).toBeTruthy()
    expect(screen.queryByText('—')).toBeNull()
  })

  it('renders a dash, not "0 W", when the climb has no pacing behind it', () => {
    render(<ClimbCards climbs={[climb]} segments={[]} de />)
    expect(screen.queryByText('0 W')).toBeNull()
    // Target power, time and W′ cost all fall back to the dash.
    expect(screen.getAllByText('—').length).toBe(3)
  })

  // A rider on profile FTP carries no W′, so the simulator's balance series
  // is flat zero. `max(0, 0 − 0)` printed "0,0 kJ" on every climb — a
  // fabricated measurement, and precisely the number the athlete would use to
  // decide the climb is cheap.
  it('renders a dash, not "0,0 kJ", when no W′ backs the projection', () => {
    render(
      <ClimbCards
        climbs={[climb]}
        segments={[
          seg({ start_m: 1000, power_w: 300, elapsed_s: 0, w_bal_j: 0 }),
          seg({ start_m: 2000, power_w: 300, elapsed_s: 400, w_bal_j: 0 }),
        ]}
        de
      />,
    )
    expect(screen.queryByText('0,0 kJ')).toBeNull()
    // Target power and time are still real; only the W′ cost is unknown.
    expect(screen.getByText('300 W')).toBeTruthy()
    expect(screen.getAllByText('—').length).toBe(1)
  })

  it('still reports a real W′ cost when a measured W′ backs it', () => {
    render(
      <ClimbCards
        climbs={[climb]}
        segments={[
          seg({ start_m: 1000, w_bal_j: 20000 }),
          seg({ start_m: 2000, w_bal_j: 14000 }),
        ]}
        de
      />,
    )
    expect(screen.getByText('6,0 kJ')).toBeTruthy()
  })

  it('renders nothing when there are no climbs', () => {
    const { container } = render(<ClimbCards climbs={[]} segments={[]} de />)
    expect(container.textContent).toBe('')
  })
})
