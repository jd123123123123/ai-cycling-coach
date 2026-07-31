import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ActualVsPredicted from '../ActualVsPredicted'
import type { RehearsalActual } from '../../../api/rehearsal'

const actual = (over: Partial<RehearsalActual> = {}): RehearsalActual => ({
  actual_time_s: 17100, // 4:45
  predicted_time_s: 18000, // 5:00
  error_s: 900,
  error_pct: 5.26,
  inside_band: true,
  ...over,
})

afterEach(cleanup)

describe('ActualVsPredicted', () => {
  it('shows what was ridden next to what was predicted', () => {
    render(<ActualVsPredicted actual={actual()} de={false} />)
    expect(screen.getByText('4:45')).toBeTruthy()
    expect(screen.getByText('5:00')).toBeTruthy()
  })

  it('blames the model, not the rider, when the prediction missed', () => {
    // The athlete rode exactly as fast as they rode. The thing that was wrong
    // is the model, and the copy has to say so.
    render(<ActualVsPredicted actual={actual()} de={false} />)
    expect(screen.getByText(/15 minutes slower/i)).toBeTruthy()
    expect(screen.getByText(/model being wrong, not you/i)).toBeTruthy()
  })

  it('admits when it was too optimistic', () => {
    render(
      <ActualVsPredicted
        actual={actual({ predicted_time_s: 16200, error_s: -900, error_pct: -5.26 })}
        de={false}
      />,
    )
    expect(screen.getByText(/too optimistic/i)).toBeTruthy()
  })

  it('claims no precision it does not have on a near miss', () => {
    // 40 s over a five-hour ride is not "the model was wrong".
    render(
      <ActualVsPredicted
        actual={actual({ predicted_time_s: 17140, error_s: 40, error_pct: 0.23 })}
        de={false}
      />,
    )
    expect(screen.getByText(/got this route right/i)).toBeTruthy()
  })

  it('reports a band that was too narrow separately from the error', () => {
    // A prediction can be close and still expose a bad band; these are
    // different facts about the model.
    render(
      <ActualVsPredicted
        actual={actual({ error_s: 40, error_pct: 0.23, inside_band: false })}
        de={false}
      />,
    )
    expect(screen.getByText(/got this route right/i)).toBeTruthy()
    expect(screen.getByText(/outside the range — it was too narrow/i)).toBeTruthy()
  })

  it('says nothing about a band it was not told about', () => {
    render(<ActualVsPredicted actual={actual({ inside_band: null })} de={false} />)
    expect(screen.queryByText(/range/i)).toBeNull()
  })

  it('speaks German', () => {
    render(<ActualVsPredicted actual={actual()} de />)
    expect(screen.getByText(/VORHERSAGE GEGEN WIRKLICHKEIT/)).toBeTruthy()
    expect(screen.getByText(/das Modell hat sich geirrt, nicht du/)).toBeTruthy()
  })
})
