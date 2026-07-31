import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import WPrimeTrace from '../WPrimeTrace'
import type { RehearsalSegment } from '../../../api/rehearsal'

const seg = (o: Partial<RehearsalSegment> & { start_m: number }): RehearsalSegment => ({
  gradient_pct: 4,
  elevation_m: 1000,
  lat: 46.5,
  lng: 11.8,
  power_w: 240,
  speed_ms: 7,
  elapsed_s: 0,
  w_bal_j: 20000,
  climb_id: null,
  ...o,
})

const draining = [
  seg({ start_m: 0, w_bal_j: 20000 }),
  seg({ start_m: 150, w_bal_j: 14000 }),
  seg({ start_m: 300, w_bal_j: 6000 }),
  seg({ start_m: 450, w_bal_j: 1000 }),
]

afterEach(cleanup)

describe('WPrimeTrace', () => {
  it('draws the trace and names the lowest point reached', () => {
    render(<WPrimeTrace segments={draining} wPrimeJ={20000} width={300} height={54} de={false} />)
    // 1000 / 20000 = 5%
    expect(screen.getByText(/lowest 5%/i)).toBeTruthy()
    expect(screen.getByRole('img')).toBeTruthy()
  })

  it('says nothing at all when no W′ is known', () => {
    // A missing W′ makes the simulator's series flat zero. Drawing that would
    // read as "permanently empty", which is the opposite of "we don't know".
    const { container } = render(
      <WPrimeTrace segments={draining} wPrimeJ={null} width={300} height={54} de={false} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('says nothing when the segments carry no balance', () => {
    const { container } = render(
      <WPrimeTrace
        segments={[seg({ start_m: 0, w_bal_j: null }), seg({ start_m: 150, w_bal_j: null })]}
        wPrimeJ={20000}
        width={300}
        height={54}
        de={false}
      />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('clamps a balance that overshoots full instead of drawing outside the box', () => {
    // The integrator can nudge past W′ on a long descent.
    render(
      <WPrimeTrace
        segments={[seg({ start_m: 0, w_bal_j: 24000 }), seg({ start_m: 150, w_bal_j: 20000 })]}
        wPrimeJ={20000}
        width={300}
        height={54}
        de={false}
      />,
    )
    expect(screen.getByText(/lowest 100%/i)).toBeTruthy()
  })

  it('speaks German', () => {
    render(<WPrimeTrace segments={draining} wPrimeJ={20000} width={300} height={54} de />)
    expect(screen.getByText(/tiefster Stand 5 %/)).toBeTruthy()
  })
})
