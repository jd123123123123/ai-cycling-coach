import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import MetricTrack from '../components/MetricTrack'
import StatTile from '../components/StatTile'
import Verdict from '../components/Verdict'
import { missing, present } from '../data/value'

afterEach(cleanup)

describe('MetricTrack', () => {
  it('renders the value, unit and delta when present', () => {
    render(<MetricTrack label="HRV" state="ABOVE RANGE" value={present(68)} unit="ms"
      delta={4} band={{ low: 52, high: 66, position: 'above' }} hue="var(--m-hrv)" />)
    expect(screen.getByText('68')).toBeTruthy()
    expect(screen.getByText('ms')).toBeTruthy()
    expect(screen.getByText('ABOVE RANGE')).toBeTruthy()
  })

  it('renders an em dash and the reason when the reading is missing — and keeps the frame', () => {
    const { container } = render(<MetricTrack label="HRV" state="ABOVE RANGE"
      value={missing('No wearable reading since Tue.')} unit="ms" delta={null} band={null} hue="var(--m-hrv)" />)
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.getByText('No wearable reading since Tue.')).toBeTruthy()
    expect(screen.getByText('HRV')).toBeTruthy()
    expect(container.querySelector('[data-metric-track]')).not.toBeNull()
  })

  it('never prints a delta when the value is missing', () => {
    render(<MetricTrack label="HRV" state="" value={missing('r')} unit="ms" delta={4} band={null} hue="var(--m-hrv)" />)
    expect(screen.queryByText(/▲|▼/)).toBeNull()
  })

  it('renders three distinct font sizes across md/lg/xl', () => {
    const sizes: ('md' | 'lg' | 'xl')[] = ['md', 'lg', 'xl']
    const rendered = sizes.map((size) => {
      const { unmount, getByText } = render(
        <MetricTrack label="L" state="" value={present(1)} unit="U" delta={null} band={null} hue="var(--m-hrv)" size={size} />,
      )
      const fontSize = getByText('1').style.fontSize
      unmount()
      return fontSize
    })
    expect(new Set(rendered).size).toBe(3)
  })

  it('defaults to lg (146px) when size is omitted', () => {
    render(<MetricTrack label="L" state="" value={present(1)} unit="U" delta={null} band={null} hue="var(--m-hrv)" />)
    expect(screen.getByText('1').style.fontSize).toBe('146px')
  })
})

describe('StatTile', () => {
  it('dashes a missing stat', () => {
    render(<StatTile label="TSS" value={missing('No ride recorded.')} unit="" />)
    expect(screen.getByText('—')).toBeTruthy()
  })
})

describe('Verdict', () => {
  it('withholds the body but keeps the block when the coach has not spoken', () => {
    render(<Verdict headline={missing('The coach has not weighed in yet today.')} body={missing('The coach has not weighed in yet today.')} />)
    expect(screen.getByText('The coach has not weighed in yet today.')).toBeTruthy()
  })
})
