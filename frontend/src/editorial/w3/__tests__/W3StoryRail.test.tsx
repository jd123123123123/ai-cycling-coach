import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import W3StoryRail, { type W3Story } from '../W3StoryRail'

const KEY = 'w3.stories.seen'
beforeEach(() => localStorage.clear())
afterEach(cleanup)

const story = (over: Partial<W3Story> = {}): W3Story => ({
  id: 1, name: '@mara', avatarUrl: null, initial: 'M', mine: false,
  card: <div data-testid="card" />, ...over,
})

const draw = (stories: W3Story[], onStart?: () => void) =>
  render(<W3StoryRail stories={stories} onStart={onStart} />)

describe('the rail', () => {
  it('draws nothing when nobody rode and there is no Start tile', () => {
    // Most mornings. An empty rail advertising that the crew is asleep is
    // worse than no rail.
    const { container } = draw([])
    expect(container.textContent).toBe('')
  })

  it('counts the riders it is showing', () => {
    draw([story({ id: 1 }), story({ id: 2, name: '@tom' })])
    expect(screen.getByText('JETZT UNTERWEGS')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })
})

describe('the unread ring', () => {
  it('opens the viewer and marks that ride seen', () => {
    draw([story({ id: 7 })])
    fireEvent.click(screen.getByLabelText('@mara: Fahrt ansehen'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(JSON.parse(localStorage.getItem(KEY)!)).toContain(7)
  })

  it('IS KEYED BY RIDE, so tomorrow the same rider is unread again', () => {
    localStorage.setItem(KEY, JSON.stringify([7]))
    const { container } = draw([story({ id: 8 })])
    // A different ride from the same person: still unread, so still lit.
    expect(container.innerHTML).toContain('box-shadow')
    expect(JSON.parse(localStorage.getItem(KEY)!)).not.toContain(8)
  })

  it('survives storage being unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => draw([story()])).not.toThrow()
    spy.mockRestore()
  })
})

describe('the viewer', () => {
  it('shows the ride card it was given', () => {
    draw([story()])
    fireEvent.click(screen.getByLabelText('@mara: Fahrt ansehen'))
    expect(screen.getByTestId('card')).toBeTruthy()
  })

  it('closes on Escape', async () => {
    draw([story()])
    fireEvent.click(screen.getByLabelText('@mara: Fahrt ansehen'))
    fireEvent.keyDown(window, { key: 'Escape' })
    // `waitFor`, not a synchronous assertion: AnimatePresence keeps the node
    // mounted through its exit animation, which is the behaviour we want.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('advances to the next rider', () => {
    draw([story({ id: 1, name: '@mara' }), story({ id: 2, name: '@tom' })])
    fireEvent.click(screen.getByLabelText('@mara: Fahrt ansehen'))
    fireEvent.click(screen.getByLabelText('Weiter'))
    expect(screen.getAllByText('@tom').length).toBeGreaterThan(0)
  })

  it('IS NOT A DEAD END — it can reach the whole ride', async () => {
    const onOpenRide = vi.fn()
    draw([story({ onOpenRide })])
    fireEvent.click(screen.getByLabelText('@mara: Fahrt ansehen'))
    fireEvent.click(screen.getByText(/Ganze Fahrt ansehen/))
    expect(onOpenRide).toHaveBeenCalled()
    // and it closes itself on the way out, so Back does not land on a story
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('offers no way out when the caller gave it none', () => {
    draw([story()])
    fireEvent.click(screen.getByLabelText('@mara: Fahrt ansehen'))
    expect(screen.queryByText(/Ganze Fahrt ansehen/)).toBeNull()
  })
})
