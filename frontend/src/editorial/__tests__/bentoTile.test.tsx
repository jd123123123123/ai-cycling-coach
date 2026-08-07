// frontend/src/editorial/__tests__/bentoTile.test.tsx
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import BentoTile from '../components/BentoTile'
import { present, missing } from '../data/value'

afterEach(cleanup)

describe('BentoTile', () => {
  it('highlights exactly one point and leaves the rest neutral', () => {
    render(
      <BentoTile
        label="HRV"
        value={present({ text: '68', unit: 'ms' })}
        chart={present({ kind: 'spark', points: [60, 62, 59, 65, 68], highlightIndex: 4 })}
      />,
    )
    expect(screen.getAllByTestId('bento-chart-point')).toHaveLength(5)
    expect(screen.getAllByTestId('bento-chart-highlight')).toHaveLength(1)
  })

  it('stars a record on the highlighted point only', () => {
    render(
      <BentoTile
        label="HRV"
        value={present({ text: '68', unit: 'ms' })}
        chart={present({ kind: 'bars', points: [1, 2, 3], highlightIndex: 2, star: true })}
      />,
    )
    expect(screen.getAllByTestId('bento-chart-star')).toHaveLength(1)
  })

  it('renders an em-dash and the reason when the value is missing', () => {
    render(
      <BentoTile
        label="Body Battery"
        value={missing('Keine Messung seit Dienstag.')}
        chart={missing('Keine Messung seit Dienstag.')}
      />,
    )
    expect(screen.getByTestId('bento-tile-value').textContent).toBe('—')
    expect(screen.getByText('Keine Messung seit Dienstag.')).toBeTruthy()
  })

  it('never draws a zeroed chart in place of missing data', () => {
    render(
      <BentoTile
        label="Body Battery"
        value={missing('Keine Messung seit Dienstag.')}
        chart={missing('Keine Messung seit Dienstag.')}
      />,
    )
    expect(screen.queryAllByTestId('bento-chart-point')).toHaveLength(0)
  })

  it('marks itself as the accented tile when asked', () => {
    render(
      <BentoTile
        label="HRV" accent
        value={present({ text: '68', unit: 'ms' })}
        chart={present({ kind: 'spark', points: [1, 2], highlightIndex: 1 })}
      />,
    )
    expect(screen.getByTestId('bento-tile').getAttribute('data-accent')).toBe('true')
  })

  describe('edge cases the highlight rule must survive', () => {
    it('highlights nothing and does not crash when highlightIndex overflows the points array', () => {
      render(
        <BentoTile
          label="HRV"
          value={present({ text: '68', unit: 'ms' })}
          chart={present({ kind: 'spark', points: [1, 2, 3], highlightIndex: 99 })}
        />,
      )
      expect(screen.getAllByTestId('bento-chart-point')).toHaveLength(3)
      expect(screen.queryAllByTestId('bento-chart-highlight')).toHaveLength(0)
    })

    it('highlights nothing and does not crash when highlightIndex is negative', () => {
      render(
        <BentoTile
          label="HRV"
          value={present({ text: '68', unit: 'ms' })}
          chart={present({ kind: 'bars', points: [1, 2, 3], highlightIndex: -1 })}
        />,
      )
      expect(screen.getAllByTestId('bento-chart-point')).toHaveLength(3)
      expect(screen.queryAllByTestId('bento-chart-highlight')).toHaveLength(0)
    })

    it('renders no points and does not crash for an empty points array', () => {
      render(
        <BentoTile
          label="HRV"
          value={present({ text: '68', unit: 'ms' })}
          chart={present({ kind: 'spark', points: [], highlightIndex: 0 })}
        />,
      )
      expect(screen.queryAllByTestId('bento-chart-point')).toHaveLength(0)
    })

    it('does not divide by zero when every point is equal', () => {
      render(
        <BentoTile
          label="HRV"
          value={present({ text: '68', unit: 'ms' })}
          chart={present({ kind: 'bars', points: [5, 5, 5], highlightIndex: 1 })}
        />,
      )
      const points = screen.getAllByTestId('bento-chart-point')
      expect(points).toHaveLength(3)
      for (const p of points) {
        expect(p.getAttribute('y')).not.toBe('NaN')
        expect(p.getAttribute('height')).not.toBe('NaN')
      }
    })

    it('does not divide by zero for a single-point spark', () => {
      render(
        <BentoTile
          label="HRV"
          value={present({ text: '68', unit: 'ms' })}
          chart={present({ kind: 'spark', points: [42], highlightIndex: 0 })}
        />,
      )
      const points = screen.getAllByTestId('bento-chart-point')
      expect(points).toHaveLength(1)
      expect(points[0].getAttribute('cx')).not.toBe('NaN')
      expect(points[0].getAttribute('cy')).not.toBe('NaN')
    })
  })

  describe('onExpand interactivity', () => {
    it('is not focusable or announced as a button when onExpand is absent', () => {
      render(
        <BentoTile
          label="HRV"
          value={present({ text: '68', unit: 'ms' })}
          chart={present({ kind: 'spark', points: [1, 2], highlightIndex: 1 })}
        />,
      )
      const tile = screen.getByTestId('bento-tile')
      expect(tile.getAttribute('role')).not.toBe('button')
      expect(tile.getAttribute('tabIndex')).toBeNull()
    })

    it('is keyboard-reachable and activatable with Enter when onExpand is given', () => {
      const onExpand = vi.fn()
      render(
        <BentoTile
          label="HRV"
          value={present({ text: '68', unit: 'ms' })}
          chart={present({ kind: 'spark', points: [1, 2], highlightIndex: 1 })}
          onExpand={onExpand}
        />,
      )
      const tile = screen.getByTestId('bento-tile')
      expect(tile.getAttribute('role')).toBe('button')
      expect(tile.getAttribute('tabIndex')).toBe('0')
      fireEvent.click(tile)
      expect(onExpand).toHaveBeenCalledTimes(1)
      fireEvent.keyDown(tile, { key: 'Enter' })
      expect(onExpand).toHaveBeenCalledTimes(2)
    })
  })
})
