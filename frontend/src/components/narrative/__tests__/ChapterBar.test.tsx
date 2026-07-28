import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ChapterBar from '../ChapterBar'
import { seasonArc } from '../../../utils/seasonArc'

afterEach(cleanup)

const NOW = new Date('2026-07-28T09:00:00')
const booked = seasonArc({ targetEventDate: '2026-12-05', now: NOW, meso: { phase: 'build', block_index_in_meso: 2, progression: { horizon_weeks: 6 } } })
const noEvent = seasonArc({ now: NOW, meso: { phase: 'base1', block_index_in_meso: 0 } })

describe('ChapterBar', () => {
  it('names the chapter you are in', () => {
    render(<ChapterBar chapter="plan" arc={booked} de />)
    expect(screen.getByText(/WO DAS HINGEHT/i)).toBeTruthy()
  })

  it('shows the phase, the week in block and the countdown together', () => {
    render(<ChapterBar chapter="today" arc={booked} de />)
    expect(screen.getByText(/Aufbau/)).toBeTruthy()
    expect(screen.getByText(/W3\/6/)).toBeTruthy()
    expect(screen.getByText(/130/)).toBeTruthy()
  })

  it('renders one dot per chapter and marks only the current one', () => {
    const { container } = render(<ChapterBar chapter="body" arc={booked} de />)
    const dots = container.querySelectorAll('[data-chapter-dot]')
    expect(dots).toHaveLength(4)
    expect(container.querySelectorAll('[data-chapter-dot="current"]')).toHaveLength(1)
    expect(dots[2].getAttribute('data-chapter-dot')).toBe('current')
  })

  it('omits the week fraction rather than inventing one when no horizon is published', () => {
    render(<ChapterBar chapter="today" arc={noEvent} de />)
    expect(screen.getByText(/Grundlage 1/)).toBeTruthy()
    expect(screen.queryByText(/W1\//)).toBeNull()
  })

  it('shows no countdown at all when no event is booked', () => {
    render(<ChapterBar chapter="today" arc={noEvent} de />)
    expect(screen.queryByText(/\bT\b/)).toBeNull()
  })

  it('announces itself as a training block, not a race, when synthesized', () => {
    render(<ChapterBar chapter="today" arc={noEvent} de />)
    expect(screen.getByText(/Trainingsblock/i)).toBeTruthy()
  })

  it('translates', () => {
    render(<ChapterBar chapter="history" arc={booked} de={false} />)
    expect(screen.getByText(/DID IT WORK/i)).toBeTruthy()
  })

  it('exposes the arc to assistive tech as one sentence, not loose fragments', () => {
    render(<ChapterBar chapter="today" arc={booked} de />)
    expect(screen.getByRole('group').getAttribute('aria-label')).toMatch(/Kapitel 1 von 4/)
  })
})
