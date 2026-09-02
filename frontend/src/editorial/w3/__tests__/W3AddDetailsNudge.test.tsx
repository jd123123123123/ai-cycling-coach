import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import W3AddDetailsNudge from '../W3AddDetailsNudge'

vi.mock('../W3RideDetailsSheet', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="sheet" /> : null),
}))

const KEY = 'w3.ride.details.dismissed'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

const draw = (over: Partial<React.ComponentProps<typeof W3AddDetailsNudge>> = {}) =>
  render(
    <W3AddDetailsNudge
      activityId={77}
      rideLabel="Deine Fahrt von heute Morgen"
      needsDetails
      {...over}
    />,
  )

/**
 * The ask only earns its place when there is something to ask for. A prompt
 * that shows up when there is not is one riders learn to swipe past without
 * reading — which then costs the times it WAS worth reading.
 */
describe('when the rider gets asked', () => {
  it('asks about a ride with no photo and no words', () => {
    draw()
    expect(screen.getByText(/ist da/)).toBeTruthy()
    expect(screen.getByText('Fahrt ergänzen')).toBeTruthy()
  })

  it('SAYS NOTHING when the ride is already filled in', () => {
    const { container } = draw({ needsDetails: false })
    expect(container.textContent).toBe('')
  })

  it('names the ride it is about', () => {
    draw({ rideLabel: 'Deine Fahrt von gestern' })
    expect(screen.getByText('Deine Fahrt von gestern ist da')).toBeTruthy()
  })
})

describe('taking no for an answer', () => {
  it('goes away for THAT ride when dismissed', () => {
    const { container } = draw()
    fireEvent.click(screen.getByLabelText('Nicht für diese Fahrt'))
    expect(container.textContent).toBe('')
    expect(JSON.parse(localStorage.getItem(KEY)!)).toContain(77)
  })

  it('stays away on a remount', () => {
    localStorage.setItem(KEY, JSON.stringify([77]))
    const { container } = draw()
    expect(container.textContent).toBe('')
  })

  it('STILL ASKS ABOUT THE NEXT RIDE', () => {
    // Per ride, not forever. A rider who says no to Tuesday's commute may well
    // want to talk about Saturday.
    localStorage.setItem(KEY, JSON.stringify([77]))
    draw({ activityId: 78 })
    expect(screen.getByText('Fahrt ergänzen')).toBeTruthy()
  })

  it('survives storage being unavailable', () => {
    // A private window, cleared site data, storage refused outright. The
    // prompt simply shows; it is never worth a crash.
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => draw()).not.toThrow()
    expect(screen.getByText('Fahrt ergänzen')).toBeTruthy()
    spy.mockRestore()
  })

  it('does not throw when it cannot remember the dismissal', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const { container } = draw()
    expect(() => fireEvent.click(screen.getByLabelText('Nicht für diese Fahrt'))).not.toThrow()
    expect(container.textContent).toBe('')
    spy.mockRestore()
  })
})

describe('the editor', () => {
  it('is closed until the rider says yes', () => {
    draw()
    expect(screen.queryByTestId('sheet')).toBeNull()
    fireEvent.click(screen.getByText('Fahrt ergänzen'))
    expect(screen.getByTestId('sheet')).toBeTruthy()
  })
})
