import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ContributorsTrigger from '../ContributorsTrigger'

const base = { hrv: 62, rhr: 48, sleep: 81, tsb: -8, score: 74, pending: false, de: true }

describe('ContributorsTrigger', () => {
  afterEach(cleanup)

  it('renders nothing while readiness is withheld', () => {
    const { container } = render(<ContributorsTrigger {...base} pending />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when there is no score to explain', () => {
    const { container } = render(<ContributorsTrigger {...base} score={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('offers the explanation when a score is shown', () => {
    render(<ContributorsTrigger {...base} />)
    expect(screen.getByRole('button', { name: /dahinter/i })).toBeTruthy()
  })

  it('names only the contributors it actually has', () => {
    render(<ContributorsTrigger {...base} hrv={null} rhr={null} sleep={81} tsb={-8} />)
    // Two chips at most, and never one for a value that is absent.
    expect(screen.queryByText(/HRV/)).toBeNull()
    expect(screen.getByText(/Schlaf/)).toBeTruthy()
  })
})
