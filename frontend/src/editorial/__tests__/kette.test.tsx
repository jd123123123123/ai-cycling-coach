// frontend/src/editorial/__tests__/kette.test.tsx
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, it, expect } from 'vitest'
import KetteStrip, { type KetteStripProps } from '../components/KetteStrip'
import { present, missing } from '../data/value'

afterEach(cleanup)

const intact: KetteStripProps = {
  streakDays: present(13),
  weekLoad: present({ spent: 640, planned: 800 }),
  missedYesterday: missing('Keine ausgelassene Einheit.'),
}

describe('KetteStrip', () => {
  it('shows the streak when the chain is intact', () => {
    render(<KetteStrip {...intact} />)
    expect(screen.getByTestId('kette-count').textContent).toContain('13')
    expect(screen.queryByTestId('kette-broken')).toBeNull()
  })

  it('shows the break, naming what was skipped', () => {
    render(
      <KetteStrip
        {...intact}
        missedYesterday={present({ title: 'Schwelle 4×8', dateIso: '2026-08-06' })}
      />,
    )
    expect(screen.getByTestId('kette-broken').textContent).toContain('Schwelle 4×8')
  })

  it('fills XP segments in proportion to planned load completed', () => {
    render(<KetteStrip {...intact} />)
    const filled = screen.getAllByTestId('kette-segment').filter((s) => s.getAttribute('data-filled') === 'true')
    expect(filled).toHaveLength(8) // 640/800 = 80% of ten segments
  })

  it('withholds the XP bar rather than dividing by a missing target', () => {
    render(<KetteStrip {...intact} weekLoad={missing('Kein Wochenplan.')} />)
    expect(screen.queryByTestId('kette-xp')).toBeNull()
    expect(screen.getByText('Kein Wochenplan.')).toBeTruthy()
  })

  it('does not divide by zero when the plan has no target', () => {
    render(<KetteStrip {...intact} weekLoad={present({ spent: 100, planned: 0 })} />)
    const filled = screen.getAllByTestId('kette-segment').filter((s) => s.getAttribute('data-filled') === 'true')
    expect(filled).toHaveLength(0)
  })

  it('clamps the bar at full when spent overshoots planned', () => {
    render(<KetteStrip {...intact} weekLoad={present({ spent: 1200, planned: 800 })} />)
    const segments = screen.getAllByTestId('kette-segment')
    const filled = segments.filter((s) => s.getAttribute('data-filled') === 'true')
    expect(filled).toHaveLength(10)
    expect(segments).toHaveLength(10)
  })

  it('never fills a negative amount when spent is negative', () => {
    render(<KetteStrip {...intact} weekLoad={present({ spent: -50, planned: 800 })} />)
    const filled = screen.getAllByTestId('kette-segment').filter((s) => s.getAttribute('data-filled') === 'true')
    expect(filled).toHaveLength(0)
  })

  it('treats a negative planned target as no usable target, withholding the fill', () => {
    render(<KetteStrip {...intact} weekLoad={present({ spent: 100, planned: -800 })} />)
    const filled = screen.getAllByTestId('kette-segment').filter((s) => s.getAttribute('data-filled') === 'true')
    expect(filled).toHaveLength(0)
  })

  it('never fills when spent or planned is non-finite (NaN/Infinity)', () => {
    render(<KetteStrip {...intact} weekLoad={present({ spent: NaN, planned: 800 })} />)
    let filled = screen.getAllByTestId('kette-segment').filter((s) => s.getAttribute('data-filled') === 'true')
    expect(filled).toHaveLength(0)
    cleanup()
    render(<KetteStrip {...intact} weekLoad={present({ spent: 100, planned: Infinity })} />)
    filled = screen.getAllByTestId('kette-segment').filter((s) => s.getAttribute('data-filled') === 'true')
    expect(filled).toHaveLength(0)
  })

  it('shows the missing reason, not a streak of zero, when streakDays is missing', () => {
    render(<KetteStrip {...intact} streakDays={missing('Noch keine Serie erfasst.')} />)
    expect(screen.queryByTestId('kette-count')).toBeNull()
    expect(screen.getByText('Noch keine Serie erfasst.')).toBeTruthy()
  })

  it('prioritises the break over the missing-streak reason when both are true', () => {
    render(
      <KetteStrip
        {...intact}
        streakDays={missing('Noch keine Serie erfasst.')}
        missedYesterday={present({ title: 'Schwelle 4×8', dateIso: '2026-08-06' })}
      />,
    )
    expect(screen.getByTestId('kette-broken').textContent).toContain('Schwelle 4×8')
    expect(screen.queryByTestId('kette-count')).toBeNull()
  })

  it('renders a coherent break even when streakDays is present alongside it', () => {
    render(
      <KetteStrip
        {...intact}
        streakDays={present(13)}
        missedYesterday={present({ title: 'Schwelle 4×8', dateIso: '2026-08-06' })}
      />,
    )
    expect(screen.getByTestId('kette-broken')).toBeTruthy()
    expect(screen.queryByTestId('kette-count')).toBeNull()
  })
})
