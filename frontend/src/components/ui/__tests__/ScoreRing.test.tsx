import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import ScoreRing from '../ScoreRing'

/**
 * The dial is a hero on two screens, so the things worth pinning are the ones
 * a redesign would quietly break: that it reports the REAL score to assistive
 * tech no matter where the animation happens to be, and that an unknown score
 * never rolls up from zero as if it were a measurement.
 */
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const SEGMENTS = 60

describe('ScoreRing', () => {
  it('announces the true value, not the swept one', async () => {
    // The sweep starts at zero. Screen-reader users must never be told "0".
    render(<ScoreRing score={78} color="#16E08A" size={200} />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('78 of 100')
  })

  it('draws a whole dial so a low score reads as unlit, not broken', () => {
    const { container } = render(<ScoreRing score={4} color="#16E08A" size={200} />)
    // Every segment is present as an unlit path from the first frame.
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(SEGMENTS)
  })

  it('lights the dial as the sweep advances', async () => {
    const { container } = render(<ScoreRing score={100} color="#16E08A" size={200} />)
    const before = container.querySelectorAll('path').length
    // Ignition adds lit segments on top of the unlit dial.
    await waitFor(() => {
      expect(container.querySelectorAll('path').length).toBeGreaterThan(before)
    })
  })

  it('rolls the centre content up with the dial', async () => {
    render(
      <ScoreRing score={62} color="#16E08A" size={200}>
        {(swept) => <span data-testid="n">{Math.round(swept)}</span>}
      </ScoreRing>,
    )
    // Starts at zero and climbs to the score.
    await waitFor(() => expect(screen.getByTestId('n').textContent).toBe('62'))
  })

  it('still accepts plain children', () => {
    render(
      <ScoreRing score={62} color="#16E08A" size={200}>
        <span data-testid="n">—</span>
      </ScoreRing>,
    )
    expect(screen.getByTestId('n').textContent).toBe('—')
  })

  it('clamps a score outside 0–100 instead of sweeping past the dial', () => {
    render(<ScoreRing score={140} color="#16E08A" size={200} />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('100 of 100')
  })

  it('survives a missing score without drawing a NaN arc', () => {
    const { container } = render(
      <ScoreRing score={Number.NaN} color="#16E08A" size={200} />,
    )
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('0 of 100')
    expect(container.innerHTML).not.toContain('NaN')
  })

  it('arrives at the value immediately under prefers-reduced-motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('reduce'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }))
    render(
      <ScoreRing score={62} color="#16E08A" size={200}>
        {(swept) => <span data-testid="n">{Math.round(swept)}</span>}
      </ScoreRing>,
    )
    // No ignition to watch: the number is simply there.
    expect(screen.getByTestId('n').textContent).toBe('62')
  })
})
