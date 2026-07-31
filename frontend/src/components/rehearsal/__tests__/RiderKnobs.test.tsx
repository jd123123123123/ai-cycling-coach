import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import RiderKnobs from '../RiderKnobs'
import type { Assumptions } from '../../../api/rehearsal'

const untouched: Assumptions = {
  draft: 'solo',
  effort: 'fondo',
  use_weather: true,
  surface: 'asphalt',
  weight_kg: null,
  bike_mass_kg: null,
  start_hour: null,
  use_projected_cp: false,
  target_time_s: null,
}

afterEach(cleanup)

function renderKnobs(over: Partial<Assumptions> = {}, canProject = true) {
  const onChange = vi.fn()
  render(
    <RiderKnobs
      assumptions={{ ...untouched, ...over }}
      onChange={onChange}
      canProject={canProject}
      de={false}
    />,
  )
  return onChange
}

describe('RiderKnobs — absence means "as I am"', () => {
  it('leaves the weight box empty and offers the profile as the fallback', () => {
    renderKnobs()
    const weight = screen.getByLabelText(/your weight/i) as HTMLInputElement
    expect(weight.value).toBe('')
    expect(weight.placeholder).toBe('Profile')
  })

  it('clearing the weight sends null, not zero', () => {
    // Zero would be a deliberate claim about a 0 kg rider; null means
    // "use what you already know about me".
    const onChange = renderKnobs({ weight_kg: 68 })
    const weight = screen.getByLabelText(/your weight/i)
    fireEvent.change(weight, { target: { value: '' } })
    fireEvent.blur(weight)
    expect(onChange).toHaveBeenCalledWith({ weight_kg: null })
  })

  it('sends a typed weight on blur, not per keystroke', () => {
    const onChange = renderKnobs()
    const weight = screen.getByLabelText(/your weight/i)
    fireEvent.change(weight, { target: { value: '6' } })
    fireEvent.change(weight, { target: { value: '68' } })
    // Each change re-runs a Monte Carlo on the server; one per digit would
    // queue three simulations to display the third.
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.blur(weight)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ weight_kg: 68 })
  })
})

describe('RiderKnobs — target time', () => {
  it('accepts the way riders actually write a time', () => {
    for (const [typed, seconds] of [
      ['4:45', 17100],
      ['4.45', 17100],
      ['4h45', 17100],
    ] as const) {
      cleanup()
      const onChange = renderKnobs()
      const field = screen.getByLabelText(/target time/i)
      fireEvent.change(field, { target: { value: typed } })
      fireEvent.blur(field)
      expect(onChange).toHaveBeenCalledWith({ target_time_s: seconds })
    }
  })

  it('reads a bare number as hours', () => {
    const onChange = renderKnobs()
    const field = screen.getByLabelText(/target time/i)
    fireEvent.change(field, { target: { value: '5' } })
    fireEvent.blur(field)
    expect(onChange).toHaveBeenCalledWith({ target_time_s: 18000 })
  })

  it('renders a stored target back in rider notation', () => {
    renderKnobs({ target_time_s: 17100 })
    expect((screen.getByLabelText(/target time/i) as HTMLInputElement).value).toBe('4:45')
  })

  it('reverts unparseable text instead of sending nonsense', () => {
    const onChange = renderKnobs({ target_time_s: 17100 })
    const field = screen.getByLabelText(/target time/i)
    fireEvent.change(field, { target: { value: 'soon' } })
    fireEvent.blur(field)
    expect(onChange).not.toHaveBeenCalled()
    expect((field as HTMLInputElement).value).toBe('4:45')
  })
})

describe('RiderKnobs — start hour', () => {
  it('defaults to the daylight average', () => {
    renderKnobs()
    expect(screen.getByRole('button', { name: 'Daytime' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('sends the chosen hour', () => {
    const onChange = renderKnobs()
    fireEvent.click(screen.getByRole('button', { name: '6:00' }))
    expect(onChange).toHaveBeenCalledWith({ start_hour: 6 })
  })

  it('goes back to the average', () => {
    const onChange = renderKnobs({ start_hour: 6 })
    fireEvent.click(screen.getByRole('button', { name: 'Daytime' }))
    expect(onChange).toHaveBeenCalledWith({ start_hour: null })
  })
})

describe('RiderKnobs — projected fitness', () => {
  it('is offered when the route has a date to project to', () => {
    renderKnobs({}, true)
    expect(screen.getByRole('switch', { name: /fitness on race day/i })).toBeTruthy()
  })

  it('is not offered at all when there is no date', () => {
    // A dead toggle would imply the app can answer a question it cannot.
    renderKnobs({}, false)
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('toggles on', () => {
    const onChange = renderKnobs({}, true)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith({ use_projected_cp: true })
  })
})
