import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import AssumptionsRow from '../AssumptionsRow'
import type { Assumptions } from '../../../api/rehearsal'

const assumptions: Assumptions = { draft: 'solo', effort: 'fondo', use_weather: true, surface: 'asphalt' }

describe('AssumptionsRow', () => {
  afterEach(cleanup)

  it('exposes effort as well as drafting', () => {
    render(<AssumptionsRow assumptions={assumptions} onChange={() => {}} de />)
    expect(screen.getByRole('tab', { name: 'Ruhig' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Rennen' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Allein' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Großes Feld' })).toBeTruthy()
  })

  it('frames effort as a question, not as advice', () => {
    render(<AssumptionsRow assumptions={assumptions} onChange={() => {}} de />)
    expect(screen.getByText('Wie fährst du die Strecke?')).toBeTruthy()
    expect(screen.getByText(/kein Rat/)).toBeTruthy()
  })

  it('reports the chosen effort', () => {
    const onChange = vi.fn()
    render(<AssumptionsRow assumptions={assumptions} onChange={onChange} de />)
    fireEvent.click(screen.getByRole('tab', { name: 'Rennen' }))
    expect(onChange).toHaveBeenCalledWith({ effort: 'race' })
  })

  it('reports the chosen drafting', () => {
    const onChange = vi.fn()
    render(<AssumptionsRow assumptions={assumptions} onChange={onChange} de />)
    fireEvent.click(screen.getByRole('tab', { name: 'Großes Feld' }))
    expect(onChange).toHaveBeenCalledWith({ draft: 'bunch' })
  })

  it('disables the effort and drafting tabs, not just their onChange, while a request is in flight', () => {
    const onChange = vi.fn()
    render(<AssumptionsRow assumptions={assumptions} onChange={onChange} disabled de />)
    const race = screen.getByRole('tab', { name: 'Rennen' })
    const bunch = screen.getByRole('tab', { name: 'Großes Feld' })
    expect(race.hasAttribute('disabled')).toBe(true)
    expect(bunch.hasAttribute('disabled')).toBe(true)
    fireEvent.click(race)
    fireEvent.click(bunch)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('toggles the weather assumption', () => {
    const onChange = vi.fn()
    render(<AssumptionsRow assumptions={assumptions} onChange={onChange} de={false} />)
    const sw = screen.getByRole('switch', { name: /Use the forecast/i })
    expect(sw.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(sw)
    expect(onChange).toHaveBeenCalledWith({ use_weather: false })
  })
})
