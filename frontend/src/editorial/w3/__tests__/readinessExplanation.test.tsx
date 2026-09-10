import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen, within, fireEvent } from '@testing-library/react'
import Explanation from '../W3ReadinessExplanation'
afterEach(cleanup)
it('groups measured factors and preserves the coach action', () => {
 render(<Explanation score={70} report={{score:70,components:[{name:'tsb',score:85,weight:.28},{name:'sleep',score:45,weight:.24},{name:'hrv',score:null,weight:.28}]}} action="Heute Ruhetag." />)
 expect(within(screen.getByLabelText('Positive Effekte')).getByText('Form')).toBeTruthy()
 expect(within(screen.getByLabelText('Bremsende Effekte')).getByText('Schlaf')).toBeTruthy()
 expect(screen.queryByText('HRV')).toBeNull()
 expect(screen.getByText('Heute Ruhetag.')).toBeTruthy()
})
it('rejects stale score attribution', () => {
 render(<Explanation score={100} report={{score:70,components:[{name:'sleep',score:45,weight:.24}]}} />)
 expect(screen.queryByLabelText('Bremsende Effekte')).toBeNull()
})


it('renormalizes measured weights without assigning missing HRV an effect', () => {
 render(<Explanation score={70} report={{score:70,components:[{name:'tsb',score:85,weight:.28},{name:'sleep',score:45,weight:.24},{name:'hrv',score:null,weight:.28}]}} />)
 fireEvent.click(screen.getByRole('button',{name:'Form: Positive Effekte'}))
 expect(screen.getByText('54 % Gewicht')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Schlaf: Bremsende Effekte'}))
 expect(screen.getByText('46 % Gewicht')).toBeTruthy()
 expect(screen.queryByText('54 % Gewicht')).toBeNull()
})
it('withholds effect attribution when readiness is withheld', () => {
 render(<Explanation score={null} report={{score:70,components:[{name:'sleep',score:45,weight:.24}]}} />)
 expect(screen.queryByLabelText('Bremsende Effekte')).toBeNull()
})


it('keeps explanations on demand and shows only the selected factor', () => {
 render(<Explanation score={70} report={{score:70,components:[{name:'tsb',score:85,weight:.28},{name:'sleep',score:45,weight:.24}]}} />)
 expect(screen.queryByText(/Fitness minus Ermüdung:/)).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Form: Positive Effekte'}))
 expect(screen.getByText(/Fitness minus Ermüdung:/)).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Schlaf: Bremsende Effekte'}))
 expect(screen.queryByText(/Fitness minus Ermüdung:/)).toBeNull()
 expect(screen.getByText(/Die Qualität der letzten Nacht/)).toBeTruthy()
})
