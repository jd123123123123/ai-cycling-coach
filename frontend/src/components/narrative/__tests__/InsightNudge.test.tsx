import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import InsightNudge, { type InsightNudgeSignal } from '../InsightNudge'

afterEach(cleanup)

const sig = (over: Partial<InsightNudgeSignal> = {}): InsightNudgeSignal => ({
  metric: 'resting_hr', value: 40, baseline: 48, direction: 'down',
  delta: -8, unit: 'bpm', severity: 'strong', ...over,
})

const metricLabel = (m: string) => (m === 'resting_hr' ? 'Resting HR' : m === 'hrv' ? 'HRV' : m)

describe('InsightNudge', () => {
  it('renders the headline and recommendation for a warning', () => {
    render(
      <InsightNudge
        polarity="warning" level="high" eyebrow="HEALTH EARLY-WARNING"
        headline="Clear warning signal" recommendation="Rest today and listen to your body."
        signals={[sig({ direction: 'up', delta: 8, severity: 'strong' })]}
        metricLabel={metricLabel}
      />,
    )
    expect(screen.getByText('Clear warning signal')).toBeTruthy()
    expect(screen.getByText('Rest today and listen to your body.')).toBeTruthy()
    expect(screen.getByText('Resting HR')).toBeTruthy()
  })

  it('renders an opportunity in the recovery-green register, not the warning one', () => {
    const { container } = render(
      <InsightNudge
        polarity="opportunity" level="high" eyebrow="RECOVERY SIGNAL"
        headline="Excellent form" recommendation="A good moment for a hard session."
        signals={[sig()]}
        metricLabel={metricLabel}
      />,
    )
    // The card's accent must be the recovery token, not the warning tokens —
    // this is the one thing that must never invert (a good-news card that
    // LOOKS alarming would be worse than not building it).
    const html = container.innerHTML
    expect(html).toContain('--color-recovery')
    expect(html).not.toContain('--color-move')
  })

  it('escalates the warning register across the three levels', () => {
    const render1 = render(
      <InsightNudge polarity="warning" level="watch" eyebrow="E" headline="H" recommendation="R" signals={[]} metricLabel={metricLabel} />,
    )
    expect(render1.container.innerHTML).toContain('--color-stand')
    cleanup()
    const render2 = render(
      <InsightNudge polarity="warning" level="high" eyebrow="E" headline="H" recommendation="R" signals={[]} metricLabel={metricLabel} />,
    )
    expect(render2.container.innerHTML).toContain('--color-move')
  })

  it('cites each signal with its formatted delta', () => {
    render(
      <InsightNudge
        polarity="warning" level="elevated" eyebrow="E" headline="H" recommendation="R"
        signals={[sig({ metric: 'hrv', direction: 'up', delta: -14, unit: '%', value: 56, baseline: 65 })]}
        metricLabel={metricLabel}
      />,
    )
    expect(screen.getByText('HRV')).toBeTruthy()
    expect(screen.getByText(/−14/)).toBeTruthy()
  })
})
