import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import W3RideChest from '../W3RideChest'
import type { Chest } from '../../../api/rewards'

function chest(over: Partial<Chest> = {}): Chest {
  return {
    sealed: true,
    activity_id: 42,
    total: 148,
    waiting: 1,
    unlock_count: 0,
    ride: {
      title: 'Feierabendrunde', started_at: '2026-08-21T16:40:00Z',
      distance_km: 62.4, elevation_m: 640, duration_s: 7620, tss: 118,
    },
    ...over,
  }
}

function renderChest(c: Chest, onOpen = vi.fn()) {
  render(<MemoryRouter><W3RideChest chest={c} onOpen={onOpen} /></MemoryRouter>)
  return onOpen
}

describe('W3RideChest', () => {
  afterEach(cleanup)

  it('names the ride and its real numbers', () => {
    renderChest(chest())
    expect(screen.getByText('Feierabendrunde')).toBeTruthy()
    expect(screen.getByText(/62,4 km/)).toBeTruthy()
    expect(screen.getByText(/2:07 h/)).toBeTruthy()
    expect(screen.getByText(/640 hm/)).toBeTruthy()
  })

  it('never prints what is inside — the amount is the reveal', () => {
    const { container } = render(
      <MemoryRouter><W3RideChest chest={chest({ total: 148 })} onOpen={vi.fn()} /></MemoryRouter>,
    )
    expect(container.textContent).not.toContain('148')
  })

  it('teases that a record fell without saying which', () => {
    renderChest(chest({ unlock_count: 2 }))
    expect(screen.getByText('2 Bestwerte warten auf dich')).toBeTruthy()
    expect(screen.queryByText(/Watt|W$/)).toBeNull()
  })

  it('says nothing about records when the ride broke none', () => {
    renderChest(chest({ unlock_count: 0 }))
    expect(screen.queryByText(/Bestwert/)).toBeNull()
  })

  it('counts a backlog rather than hiding it', () => {
    renderChest(chest({ waiting: 3 }))
    expect(screen.getByText('3 FAHRTEN WARTEN')).toBeTruthy()
  })

  it('opens on a tap of the knob, for anyone who does not drag', () => {
    const onOpen = renderChest(chest())
    fireEvent.click(screen.getByLabelText('ZUM ÖFFNEN WISCHEN'))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('survives a ride with no title and no numbers', () => {
    renderChest(chest({
      ride: { title: null, started_at: null, distance_km: null, elevation_m: null, duration_s: null, tss: null },
    }))
    expect(screen.getByText('Deine Fahrt ist da')).toBeTruthy()
    expect(screen.getByText('gebucht und verschlossen')).toBeTruthy()
  })
})
