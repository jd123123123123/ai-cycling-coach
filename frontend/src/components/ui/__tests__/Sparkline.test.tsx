import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import Sparkline from '../Sparkline'

afterEach(cleanup)

describe('Sparkline', () => {
  it('draws a polyline and a filled area through the values', () => {
    const { container } = render(<Sparkline values={[10, 12, 11, 14, 18]} color="var(--color-recovery)" />)
    expect(container.querySelector('polyline')).toBeTruthy()
    expect(container.querySelector('path')).toBeTruthy()
  })

  it('renders nothing at all below two points — one point is not a trend', () => {
    expect(render(<Sparkline values={[42]} color="red" />).container.querySelector('svg')).toBeNull()
    cleanup()
    expect(render(<Sparkline values={[]} color="red" />).container.querySelector('svg')).toBeNull()
  })

  it('survives a flat series without dividing by a zero range', () => {
    // All-equal values give range 0; a naive (v - min) / (max - min) would be
    // NaN and emit "NaN" into the points attribute, silently drawing nothing.
    const { container } = render(<Sparkline values={[50, 50, 50, 50]} color="red" />)
    const pts = container.querySelector('polyline')!.getAttribute('points')!
    expect(pts).not.toContain('NaN')
    expect(pts.length).toBeGreaterThan(0)
  })

  it('uses the colour it is given for both stroke and fill', () => {
    const { container } = render(<Sparkline values={[1, 2, 3]} color="var(--color-move)" />)
    expect(container.innerHTML).toContain('--color-move')
  })

  it('is decorative by default and described when given a label', () => {
    const { container: plain } = render(<Sparkline values={[1, 2, 3]} color="red" />)
    expect(plain.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true')
    cleanup()
    const { container: labelled } = render(<Sparkline values={[1, 2, 3]} color="red" label="HRV trend" />)
    expect(labelled.querySelector('svg')!.getAttribute('aria-hidden')).toBeNull()
    expect(labelled.querySelector('title')!.textContent).toBe('HRV trend')
  })

  it('marks the most recent point so the eye lands on today', () => {
    const { container } = render(<Sparkline values={[1, 2, 3]} color="red" />)
    expect(container.querySelector('circle')).toBeTruthy()
  })
})
