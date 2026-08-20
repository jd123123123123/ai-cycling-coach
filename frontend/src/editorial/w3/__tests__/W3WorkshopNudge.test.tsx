import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import W3WorkshopNudge from '../W3WorkshopNudge'
import type { Workshop, WorkshopComponent } from '../../../api/workshop'

const state = vi.hoisted(() => ({ data: undefined as Workshop | undefined }))
vi.mock('../../../hooks/useWorkshop', () => ({ useWorkshop: () => state }))

const part = (over: Partial<WorkshopComponent>): WorkshopComponent => ({
  id: 'chain', name_de: 'Kette', action_de: 'Reinigen & ölen',
  km_since: 100, interval_km: 250, km_total: 100,
  days_since: null, interval_days: null, clock: 'km',
  method: null, dormant: false, undated: false, optional: false,
  bonus_rc: 0, status: 'fresh', progress: 0.4, accrual_stopped: false,
  ...over,
})

const ws = (components: WorkshopComponent[], open: WorkshopComponent | null = null): Workshop => ({
  components, total_bonus_rc: components.reduce((s, c) => s + c.bonus_rc, 0),
  drivetrain_fresh: true, drivetrain_watts: null,
  chain_km_total: 0, chain_record_km: 0, balance: 0, open_question: open,
})

const show = () => render(<MemoryRouter><W3WorkshopNudge /></MemoryRouter>)

// Explicit, because this project does not run vitest with `globals: true`
// and testing-library only auto-cleans when it can see the global hooks —
// without it every render stacks and each assertion matches the PREVIOUS test's
// DOM as well as its own.
beforeEach(() => { cleanup(); state.data = undefined })

describe('W3WorkshopNudge', () => {
  it('says nothing on an ordinary day', () => {
    // THE RULE THAT KEEPS IT CREDIBLE. A permanent maintenance strip becomes
    // furniture within a week, and then it is invisible on the day it is
    // finally right.
    state.data = ws([part({}), part({ id: 'tyres', name_de: 'Reifen' })])
    const { container } = show()
    expect(container.innerHTML).toBe('')
  })

  it('says nothing at all before the workshop has loaded', () => {
    const { container } = show()
    expect(container.innerHTML).toBe('')
  })

  it('names the job and what it pays when one is due', () => {
    state.data = ws([part({ status: 'due', bonus_rc: 223, km_since: 372 })])
    show()
    expect(screen.getByText('Kette ist dran')).toBeTruthy()
    expect(screen.getByText(/223/)).toBeTruthy()
  })

  it('leads with the richest job, not the most overdue one', () => {
    // The rider is being INVITED, and the size of the invitation is the number
    // that belongs in the sentence.
    state.data = ws([
      part({ id: 'chain', name_de: 'Kette', status: 'overdue', bonus_rc: 90 }),
      part({ id: 'brakes', name_de: 'Bremsbeläge', status: 'due', bonus_rc: 500 }),
    ])
    show()
    expect(screen.getByText('Bremsbeläge und 1 weitere sind dran')).toBeTruthy()
    expect(screen.getByText(/590/)).toBeTruthy()   // both, summed
  })

  it('treats overdue exactly like due', () => {
    // "Überfällig" only means the bonus stopped growing. A louder tone would
    // turn a saved-up reward into a telling-off, which is the failure mode the
    // whole harvest design exists to avoid.
    state.data = ws([part({ status: 'overdue', bonus_rc: 300 })])
    show()
    expect(screen.getByText('Kette ist dran')).toBeTruthy()
  })

  it('asks its question only when there is no job to do', () => {
    const fluid = part({
      id: 'brakefluid', name_de: 'Bremsflüssigkeit', status: 'unknown',
      dormant: true, optional: true, interval_km: null, interval_days: 365, clock: 'days',
    })
    state.data = ws([part({}), fluid], fluid)
    show()
    expect(screen.getByText('Kurze Frage zu deinem Rad')).toBeTruthy()
  })

  it('lets a real job outrank the question', () => {
    const fluid = part({ id: 'brakefluid', name_de: 'Bremsflüssigkeit', dormant: true, status: 'unknown' })
    state.data = ws([part({ status: 'due', bonus_rc: 223 }), fluid], fluid)
    show()
    expect(screen.getByText('Kette ist dran')).toBeTruthy()
    expect(screen.queryByText('Kurze Frage zu deinem Rad')).toBeNull()
  })
})
