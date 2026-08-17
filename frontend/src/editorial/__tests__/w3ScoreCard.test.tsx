// frontend/src/editorial/__tests__/w3ScoreCard.test.tsx
//
// W3ScoreCard — the big-number judgement card, extracted from Today's
// readiness block so the same element can grade a finished ride.
//
// What this guards: it renders only what it is given (no copy of its own), a
// null score is a dash with an EMPTY meter (never a zero fill), and the
// denominator form the ride-review caller needs (score / total) works.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import W3ScoreCard from '../w3/W3ScoreCard'

afterEach(cleanup)

/** Meter bars are the only 26px-tall flex children of the card. */
function litBars(container: HTMLElement): number {
  return Array.from(container.querySelectorAll('div'))
    .filter((el) => (el as HTMLElement).style.height === '26px' && (el as HTMLElement).style.transformOrigin === 'bottom')
    .filter((el) => (el as HTMLElement).style.background !== '' && !(el as HTMLElement).style.background.includes('rgb(32, 32, 32)'))
    .length
}

describe('W3ScoreCard', () => {
  it('renders the score, word and note it is given', () => {
    render(
      <W3ScoreCard
        score={76} label="Bereitschaft" word="Bereit"
        note={{ text: '+4 ggü. gestern', favourable: true }}
      />,
    )
    expect(screen.getByText('76')).toBeTruthy()
    expect(screen.getByText('Bereitschaft')).toBeTruthy()
    expect(screen.getByText('Bereit')).toBeTruthy()
    expect(screen.getByText('+4 ggü. gestern')).toBeTruthy()
  })

  it('prints a dash and an empty meter for a missing score — never a zero', () => {
    const { container } = render(<W3ScoreCard score={null} label="Bereitschaft" word={null} />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.queryByText('0')).toBeNull()
    expect(litBars(container)).toBe(0)
  })

  it('fills the meter in proportion to the real score', () => {
    const { container } = render(<W3ScoreCard score={50} label="Bereitschaft" word="Solide" />)
    // 18 bars, half lit.
    expect(litBars(container)).toBe(9)
  })

  it('supports the ride-review shape: score over an explicit total', () => {
    render(
      <W3ScoreCard
        score={94} total={100} showTotal label="Ausführung" word="Sauber umgesetzt"
        context={<span>Du hast jedes Intervall im Zielband gehalten.</span>}
      />,
    )
    expect(screen.getByText('94')).toBeTruthy()
    expect(screen.getByText('/ 100')).toBeTruthy()
    expect(screen.getByText('Ausführung')).toBeTruthy()
    expect(screen.getByText('Du hast jedes Intervall im Zielband gehalten.')).toBeTruthy()
  })

  it('is only a button when it has somewhere to go', () => {
    const onClick = vi.fn()
    const { container: plain } = render(<W3ScoreCard score={70} label="L" word="W" />)
    expect(plain.querySelector('button')).toBeNull()
    cleanup()
    render(<W3ScoreCard score={70} label="L" word="W" onClick={onClick} ariaLabel="Details" />)
    fireEvent.click(screen.getByLabelText('Details'))
    expect(onClick).toHaveBeenCalled()
  })

  it('renders the aside column when given one', () => {
    render(
      <W3ScoreCard score={76} label="Bereitschaft" word="Bereit"
        aside={{ label: 'Multiplikator', value: '1,25×', caption: '7 Tage Streak' }} />,
    )
    expect(screen.getByText('Multiplikator')).toBeTruthy()
    expect(screen.getByText('1,25×')).toBeTruthy()
    expect(screen.getByText('7 Tage Streak')).toBeTruthy()
  })
})
