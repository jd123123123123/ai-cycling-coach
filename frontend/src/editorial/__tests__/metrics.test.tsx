import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import InsightStrip from '../components/InsightStrip'
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

  it('renders a short numeral at the full 146px size — the common case', () => {
    render(<MetricTrack label="HRV" state="" value={present(68)} unit="ms" delta={null} band={null} hue="var(--m-hrv)" />)
    expect(screen.getByText('68').style.fontSize).toBe('146px')
  })

  it('renders unitSub as the unit stack\'s second line, and no top caption when label is empty', () => {
    const { container } = render(
      <MetricTrack label="" state="" value={present(98)} unit="TSS" unitSub="SESSION LOAD"
        delta={null} band={null} hue="var(--m-load)" />,
    )
    expect(screen.getByText('SESSION LOAD')).toBeTruthy()
    expect(screen.getByText('TSS')).toBeTruthy()
    // with label/state empty, band null, and the value present, the only
    // child of the root is the value/unit row — no top caption block
    const root = container.querySelector('[data-metric-track]')
    expect(root?.children.length).toBe(1)
  })

  it('spaces the value and unit stack 9px apart, per the Trained frame\'s own ilUFr node', () => {
    render(<MetricTrack label="" state="" value={present(98)} unit="TSS" unitSub="SESSION LOAD"
      delta={null} band={null} hue="var(--m-load)" />)
    const valueSpan = screen.getByText('98')
    expect(valueSpan.parentElement?.style.gap).toBe('9px')
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

  it('renders the missing reason at the quiet register, not the body\'s normal colour', () => {
    render(<Verdict headline={missing('r')} body={missing('r')} />)
    expect(screen.getByText('r').style.color).toBe('var(--e-quiet)')
  })

  it('renders a present body at its normal colour', () => {
    render(<Verdict headline={present('Headline')} body={present('Body copy.')} />)
    expect(screen.getByText('Body copy.').style.color).toBe('var(--e-mid)')
  })
})

describe('InsightStrip', () => {
  it('keeps a missing item\'s label in its slot, and keeps all three columns', () => {
    render(
      <InsightStrip
        items={[
          { label: 'PEAK POWER', value: missing('No peak-power analysis yet.') },
          { label: 'UNTIL BACK TO NEUTRAL', value: present('26 h') },
          { label: 'FITNESS', value: present('68') },
        ]}
      />,
    )
    // three signal columns survive regardless of missing state — the label
    // is never replaced by the reason text
    expect(screen.getByText('PEAK POWER')).toBeTruthy()
    expect(screen.getByText('UNTIL BACK TO NEUTRAL')).toBeTruthy()
    expect(screen.getByText('FITNESS')).toBeTruthy()
    expect(screen.queryByText('No peak-power analysis yet.')).toBeTruthy()
  })

  it('prints one reason line when two items share the same missing reason', () => {
    render(
      <InsightStrip
        items={[
          { label: 'PEAK POWER', value: missing('No location from a recent ride.') },
          { label: 'UNTIL BACK TO NEUTRAL', value: missing('No location from a recent ride.') },
          { label: 'FITNESS', value: present('68') },
        ]}
      />,
    )
    expect(screen.getAllByText('No location from a recent ride.').length).toBe(1)
  })

  it('prints both reasons when two items are missing for different reasons', () => {
    render(
      <InsightStrip
        items={[
          { label: 'PEAK POWER', value: missing('No peak-power analysis yet.') },
          { label: 'UNTIL BACK TO NEUTRAL', value: missing('No recovery estimate yet.') },
          { label: 'FITNESS', value: present('68') },
        ]}
      />,
    )
    expect(screen.getByText('No peak-power analysis yet.')).toBeTruthy()
    expect(screen.getByText('No recovery estimate yet.')).toBeTruthy()
  })
})
