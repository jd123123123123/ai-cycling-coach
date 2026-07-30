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

  it('renders nothing when there are no climbs', () => {
    const { container } = render(<ClimbCards climbs={[]} segments={[]} de />)
    expect(container.textContent).toBe('')
  })
})
