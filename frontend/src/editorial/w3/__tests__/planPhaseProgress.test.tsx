import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import Phase from '../W3PlanPhaseProgress'
afterEach(cleanup)
it('shows actual phase week and remaining later weeks without daily details',()=>{
 render(<Phase schedule={['accumulation','transmutation','realization','recovery']} index={0}/>)
 expect(screen.getByLabelText(/Planwoche .*Woche 1 von 1 · aktuell/)).toBeTruthy()
 expect(screen.queryByText('Noch 3 Wochen')).toBeNull()
 expect(screen.queryByText(/Blockwoche|Tag 3|Sept/)).toBeNull()
})
it('counts the current contiguous phase rather than cycle index',()=>{
 render(<Phase schedule={['accumulation','accumulation','transmutation','recovery']} index={1}/>)
 expect(screen.getByLabelText(/Planwoche 2 .*Woche 2 von 2 · aktuell/)).toBeTruthy()
 expect(screen.queryByText('Noch 2 Wochen')).toBeNull()
})
it('marks the final week without claiming it is already completed',()=>{
 render(<Phase schedule={['accumulation','transmutation','realization','recovery']} index={3}/>)
 expect(screen.getByLabelText('Planwoche 4 · Erholung · Woche 1 von 1 · aktuell')).toBeTruthy()
 expect(screen.getByLabelText(/Planwoche .*Woche 1 von 1 · aktuell/)).toBeTruthy()
})
it('does not invent a schedule for an older API payload',()=>{
 render(<Phase fallback="Aufbaublock"/>)
 expect(screen.getByText('Aufbaublock')).toBeTruthy()
 expect(screen.queryByText(/Noch.*Wochen/)).toBeNull()
})

it('renders exactly one box per planned week and marks only the actual week',()=>{
 const {container}=render(<Phase schedule={['accumulation','accumulation','transmutation','recovery']} index={1}/>)
 expect(container.querySelectorAll('.w3-phase-week')).toHaveLength(4)
 expect(container.querySelectorAll('.w3-phase-week[data-current=true]')).toHaveLength(1)
 expect(screen.getByLabelText('Planwoche 2 · Aufbau · Woche 2 von 2 · aktuell').getAttribute('aria-current')).toBe('step')
 expect(screen.getByLabelText('Aufbau: 2 Wochen').children).toHaveLength(2)
 expect(screen.getByLabelText('Planwoche 1 · Aufbau · Woche 1 von 2 · vergangen').getAttribute('data-past')).toBe('true')
})
