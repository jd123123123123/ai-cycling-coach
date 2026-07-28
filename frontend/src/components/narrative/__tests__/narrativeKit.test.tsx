import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ChapterHero from '../ChapterHero'
import MomentCard from '../MomentCard'
import CoachRead from '../CoachRead'
import NextChapter from '../NextChapter'

afterEach(cleanup)

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('ChapterHero', () => {
  it('leads with the headline and keeps the support line secondary', () => {
    wrap(<ChapterHero headline="VO₂ steht an" support="Harte Intervalle — du bist frisch" />)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('VO₂ steht an')
    expect(screen.getByText(/Harte Intervalle/)).toBeTruthy()
  })

  it('omits the support line entirely rather than leaving an empty slot', () => {
    const { container } = wrap(<ChapterHero headline="Ruhetag" support={null} />)
    expect(container.querySelectorAll('p')).toHaveLength(0)
  })

  it('renders a figure above the headline when given one', () => {
    wrap(<ChapterHero headline="72%" figure={<svg data-testid="ring" />} />)
    expect(screen.getByTestId('ring')).toBeTruthy()
  })
})

describe('MomentCard', () => {
  it('marks itself as the page moment so a second one is detectable', () => {
    const { container } = wrap(<MomentCard eyebrow="EINHEIT DES TAGES" headline="VO₂max kurz" />)
    expect(container.querySelectorAll('[data-moment]')).toHaveLength(1)
  })

  it('becomes a link when given a destination, and stays inert without one', () => {
    const { container: withTo } = wrap(<MomentCard eyebrow="E" headline="H" to="/workout/today" />)
    expect(withTo.querySelector('a')?.getAttribute('href')).toBe('/workout/today')
    const { container: without } = wrap(<MomentCard eyebrow="E" headline="H" />)
    expect(without.querySelector('a')).toBeNull()
  })
})

describe('CoachRead', () => {
  it('renders the coach prose under its eyebrow', () => {
    wrap(<CoachRead eyebrow="DEIN COACH" body="Du bist frisch — nutze es." />)
    expect(screen.getByText('DEIN COACH')).toBeTruthy()
    expect(screen.getByText('Du bist frisch — nutze es.')).toBeTruthy()
  })
})

describe('NextChapter', () => {
  it('points at the following chapter by name', () => {
    wrap(<NextChapter from="today" de />)
    const a = screen.getByRole('link')
    expect(a.getAttribute('href')).toBe('/dashboard?tab=plan')
    expect(a.textContent).toMatch(/WO DAS HINGEHT/i)
  })

  it('loops the last chapter back to the first', () => {
    wrap(<NextChapter from="history" de />)
    expect(screen.getByRole('link').getAttribute('href')).toBe('/dashboard?tab=today')
  })

  it('translates', () => {
    wrap(<NextChapter from="today" de={false} />)
    expect(screen.getByRole('link').textContent).toMatch(/WHERE THIS IS GOING/i)
  })
})
