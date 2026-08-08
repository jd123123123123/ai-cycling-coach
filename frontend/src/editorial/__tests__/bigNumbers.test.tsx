import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import BigNumbers, { type BigNumberRow } from '../components/BigNumbers'
import { missing, present } from '../data/value'

afterEach(cleanup)

const rows: BigNumberRow[] = [
  { key: 'hrv', label: 'HRV', value: present({ text: '68', unit: 'ms' }), note: '+6 · ÜBER BEREICH' },
  { key: 'sleep', label: 'SCHLAF', value: present({ text: '7:42', unit: 'h' }) },
  { key: 'rhr', label: 'RUHEPULS', value: present({ text: '48', unit: 'bpm' }) },
]

const leadOf = () => screen.getAllByTestId('big-number-row').filter((r) => r.getAttribute('data-lead') === 'true')

describe('BigNumbers', () => {
  it('prints every row', () => {
    render(<BigNumbers rows={rows} leadKey="hrv" />)
    expect(screen.getAllByTestId('big-number-row')).toHaveLength(3)
    expect(screen.getByText('68')).toBeTruthy()
    expect(screen.getByText('7:42')).toBeTruthy()
    expect(screen.getByText('48')).toBeTruthy()
  })

  it('leads with the row the caller names, not the first one', () => {
    render(<BigNumbers rows={rows} leadKey="rhr" />)
    const lead = leadOf()
    expect(lead).toHaveLength(1)
    expect(lead[0].textContent).toContain('RUHEPULS')
  })

  it('always has exactly one lead — never zero, never two', () => {
    for (const key of ['hrv', 'sleep', 'rhr', 'nothing-matches', null]) {
      render(<BigNumbers rows={rows} leadKey={key} />)
      expect(leadOf()).toHaveLength(1)
      cleanup()
    }
  })

  it('falls back to the first row when the lead key names nothing', () => {
    render(<BigNumbers rows={rows} leadKey="nothing-matches" />)
    expect(leadOf()[0].textContent).toContain('HRV')
  })

  it('sets the lead figure larger than the rest', () => {
    render(<BigNumbers rows={rows} leadKey="hrv" />)
    const sizes = screen.getAllByTestId('big-number-value')
      .map((el) => Number((el as HTMLElement).style.fontSize.replace('px', '')))
    expect(sizes[0]).toBeGreaterThan(sizes[1])
  })

  it('renders an em-dash and the reason for a missing reading, never a zero', () => {
    render(
      <BigNumbers
        rows={[{ key: 'hrv', label: 'HRV', value: missing('Keine Messung seit Dienstag.') }]}
        leadKey="hrv"
      />,
    )
    expect(screen.getByTestId('big-number-missing').textContent).toBe('—')
    expect(screen.getByText('Keine Messung seit Dienstag.')).toBeTruthy()
    expect(screen.queryByText('0')).toBeNull()
  })

  it('renders nothing at all when there are no rows', () => {
    const { container } = render(<BigNumbers rows={[]} leadKey={null} />)
    expect(container.firstChild).toBeNull()
  })
})
