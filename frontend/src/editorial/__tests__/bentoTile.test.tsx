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

    it('is keyboard-reachable and activatable with Enter or Space when onExpand is given', () => {
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
      fireEvent.keyDown(tile, { key: ' ' })
      expect(onExpand).toHaveBeenCalledTimes(3)
    })
  })

  describe('exactly one highlight, tied to the requested index — not just the last point', () => {
    it('highlights a middle index, not merely the last point in the array', () => {
      render(
        <BentoTile
          label="HRV"
          value={present({ text: '68', unit: 'ms' })}
          chart={present({ kind: 'spark', points: [10, 20, 30, 40, 50], highlightIndex: 2 })}
        />,
      )
      const points = screen.getAllByTestId('bento-chart-point')
      expect(points).toHaveLength(5)
      // Only the point AT the requested index carries the accent radius —
      // a mutant that always lights the last point (index 4) would fail
      // this, since index 4 must read neutral (r=0) here.
      points.forEach((p, i) => {
        expect(p.getAttribute('r')).toBe(i === 2 ? '4' : '0')
      })
      const highlight = screen.getByTestId('bento-chart-highlight')
      expect(highlight.getAttribute('cx')).toBe(points[2].getAttribute('cx'))
      expect(highlight.getAttribute('cy')).toBe(points[2].getAttribute('cy'))
    })

    it('highlights the requested index in a bars chart too, by fill not just position', () => {
      render(
        <BentoTile
          label="HRV"
          value={present({ text: '68', unit: 'ms' })}
          chart={present({ kind: 'bars', points: [10, 20, 30, 40, 50], highlightIndex: 1 })}
        />,
      )
      const points = screen.getAllByTestId('bento-chart-point')
      expect(points).toHaveLength(5)
      points.forEach((p, i) => {
        expect(p.getAttribute('fill')).toBe(i === 1 ? 'var(--st-active)' : 'var(--d-2)')
      })
    })

    it('moves the highlight to a different coordinate when a different highlightIndex is given', () => {
      const { unmount } = render(
        <BentoTile
          label="HRV"
          value={present({ text: '68', unit: 'ms' })}
          chart={present({ kind: 'spark', points: [10, 20, 30, 40, 50], highlightIndex: 1 })}
        />,
      )
      const cxAtOne = screen.getByTestId('bento-chart-highlight').getAttribute('cx')
      unmount()

      render(
        <BentoTile
          label="HRV"
          value={present({ text: '68', unit: 'ms' })}
          chart={present({ kind: 'spark', points: [10, 20, 30, 40, 50], highlightIndex: 3 })}
        />,
      )
      const cxAtThree = screen.getByTestId('bento-chart-highlight').getAttribute('cx')
      expect(cxAtOne).not.toBe(cxAtThree)
    })
  })

  describe('the tall tile earns its height (Change 2, owner ruling 2026-08-07)', () => {
    it('draws the real series, not the band, when tall and a tallChart is present', () => {
      render(
        <BentoTile
          label="RUHEPULS" tall accent
          value={present({ text: '46', unit: 'bpm' })}
          chart={present({ kind: 'band', low: 44, high: 55, today: 46 })}
          tallChart={present({ kind: 'spark', points: [49, 48, 51, 47, 48, 46, 46], highlightIndex: 6 })}
        />,
      )
      // More than the band chart's single dot — a real multi-point line.
      const points = screen.getAllByTestId('bento-chart-point')
      expect(points.length).toBeGreaterThan(2)
      expect(points).toHaveLength(7)
      expect(screen.getAllByTestId('bento-chart-highlight')).toHaveLength(1)
    })

    it('falls back to the band, not a fabricated series, when tall but no tallChart exists', () => {
      render(
        <BentoTile
          label="HRV" tall accent
          value={present({ text: '68', unit: 'ms' })}
          chart={present({ kind: 'band', low: 52, high: 74, today: 68 })}
        />,
      )
      // Exactly the band chart's own single dot — never fabricates extra points.
      expect(screen.getAllByTestId('bento-chart-point')).toHaveLength(1)
    })

    it('falls back to the missing reason, not a fabricated series, when tall and both chart and tallChart are missing', () => {
      render(
        <BentoTile
          label="Body Battery" tall accent
          value={missing('Keine Messung seit Dienstag.')}
          chart={missing('Keine Messung seit Dienstag.')}
          tallChart={missing('Keine Messung seit Dienstag.')}
        />,
      )
      expect(screen.queryAllByTestId('bento-chart-point')).toHaveLength(0)
      expect(screen.getByText('Keine Messung seit Dienstag.')).toBeTruthy()
    })

    it('a single-height tile ignores tallChart entirely and keeps its band', () => {
      render(
        <BentoTile
          label="RUHEPULS"
          value={present({ text: '46', unit: 'bpm' })}
          chart={present({ kind: 'band', low: 44, high: 55, today: 46 })}
          tallChart={present({ kind: 'spark', points: [49, 48, 51, 47, 48, 46, 46], highlightIndex: 6 })}
        />,
      )
      expect(screen.getAllByTestId('bento-chart-point')).toHaveLength(1)
    })
  })

  describe('band chart coverage', () => {
    it('renders a single highlighted dot for a normal band', () => {
      render(
        <BentoTile
          label="Body Battery"
          value={present({ text: '150' })}
          chart={present({ kind: 'band', low: 100, high: 200, today: 150 })}
        />,
      )
      expect(screen.getAllByTestId('bento-chart-point')).toHaveLength(1)
      expect(screen.getAllByTestId('bento-chart-highlight')).toHaveLength(1)
      const cx = Number(screen.getByTestId('bento-chart-highlight').getAttribute('cx'))
      expect(cx).toBeCloseTo(65, 0)
      expect(cx).toBeGreaterThanOrEqual(3)
      expect(cx).toBeLessThanOrEqual(127)
    })

    it('does not divide by zero and stays on the track when low === high', () => {
      render(
        <BentoTile
          label="Body Battery"
          value={present({ text: '100' })}
          chart={present({ kind: 'band', low: 100, high: 100, today: 100 })}
        />,
      )
      const cx = Number(screen.getByTestId('bento-chart-highlight').getAttribute('cx'))
      expect(Number.isNaN(cx)).toBe(false)
      expect(cx).toBeGreaterThanOrEqual(3)
      expect(cx).toBeLessThanOrEqual(127)
    })

    it('clamps the dot inside the track when today falls outside [low, high]', () => {
      render(
        <BentoTile
          label="Body Battery"
          value={present({ text: '500' })}
          chart={present({ kind: 'band', low: 100, high: 200, today: 500 })}
        />,
      )
      const highCx = Number(screen.getByTestId('bento-chart-highlight').getAttribute('cx'))
      expect(highCx).toBeLessThanOrEqual(127)
      expect(highCx).toBeGreaterThanOrEqual(3)

      cleanup()

      render(
        <BentoTile
          label="Body Battery"
          value={present({ text: '-50' })}
          chart={present({ kind: 'band', low: 100, high: 200, today: -50 })}
        />,
      )
      const lowCx = Number(screen.getByTestId('bento-chart-highlight').getAttribute('cx'))
      expect(lowCx).toBeGreaterThanOrEqual(3)
      expect(lowCx).toBeLessThanOrEqual(127)
    })
  })
})
