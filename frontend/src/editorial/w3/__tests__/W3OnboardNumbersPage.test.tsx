import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const profile = { data: undefined as unknown }
let activities: unknown[] = []

vi.mock('../../../hooks/useAthleteProfile', () => ({ useAthleteProfile: () => profile }))
vi.mock('../../../hooks/useActivitiesRange', () => ({ useActivitiesRange: () => ({ data: { activities } }) }))
const updateProfile = vi.fn(async (_p?: unknown) => ({}))
const grantConsent = vi.fn(async (_p?: unknown) => ({}))
const navigateSpy = vi.fn()
vi.mock('../../../api/athletes', () => ({ updateProfile: (a: unknown) => updateProfile(a) }))
vi.mock('../../../api/consent', () => ({ grantConsent: (a: unknown) => grantConsent(a) }))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateSpy }
})
vi.mock('motion/react', () => ({
  useReducedMotion: () => true,
  motion: new Proxy({}, { get: () => ({ children, ...rest }: any) => {
    const p = { ...rest }; delete p.initial; delete p.animate; delete p.transition
    return <div {...p}>{children}</div>
  } }),
}))

import W3OnboardNumbersPage from '../W3OnboardNumbersPage'

function renderPage() {
  return render(<MemoryRouter><W3OnboardNumbersPage /></MemoryRouter>)
}
const cta = () => screen.getByRole('button', { name: /Passt so|Startwerten loslegen|Einen Moment/i }) as HTMLButtonElement

beforeEach(() => { activities = []; profile.data = undefined; updateProfile.mockClear(); grantConsent.mockClear(); navigateSpy.mockClear() })
afterEach(cleanup)

describe('W3 · Deine Zahlen', () => {
  it('a plain integer weight enables the CTA', () => {
    renderPage()
    fireEvent.click(screen.getByText('Gewicht'))
    fireEvent.change(screen.getByPlaceholderText('Gewicht in kg'), { target: { value: '72' } })
    expect(cta().disabled).toBe(false)
  })

  it('a German decimal weight (72,5) must also enable the CTA', () => {
    renderPage()
    fireEvent.click(screen.getByText('Gewicht'))
    const field = screen.getByPlaceholderText('Gewicht in kg') as HTMLInputElement
    fireEvent.change(field, { target: { value: '72,5' } })
    // What the athlete sees in the field after typing:
    console.log('[repro] input.value =', JSON.stringify(field.value))
    expect(cta().disabled).toBe(false)
  })

  it('a decimal weight with a dot (72.5) must also enable the CTA', () => {
    renderPage()
    fireEvent.click(screen.getByText('Gewicht'))
    fireEvent.change(screen.getByPlaceholderText('Gewicht in kg'), { target: { value: '72.5' } })
    expect(cta().disabled).toBe(false)
  })
})

describe('W3 · Deine Zahlen · weiter', () => {
  it('a rider whose profile already has an FTP can continue to the next screen', async () => {
    profile.data = { ftp_watts: 240, weight_kg: 72, primary_sport: 'cycling' }
    renderPage()
    expect(screen.queryByText('Wir haben deine Zahlen')).not.toBeNull()
    const b = cta()
    expect(b.disabled).toBe(false)
    fireEvent.click(b)
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/e/w3-onboard-rider'))
    expect(updateProfile).toHaveBeenCalled()
  })
})

describe('W3 · Deine Zahlen · eine Zahl, die nicht sein kann', () => {
  const openFtp = () => fireEvent.click(screen.getByText('FTP'))
  const openWeight = () => fireEvent.click(screen.getByText('Gewicht'))
  const ftpField = () => screen.getByPlaceholderText('FTP in Watt')
  const weightField = () => screen.getByPlaceholderText('Gewicht in kg')

  it('an FTP nobody holds for an hour is refused, with the ceiling named', () => {
    renderPage()
    openFtp()
    fireEvent.change(ftpField(), { target: { value: '5000' } })
    expect(screen.getByText(/600/)).toBeTruthy()
    expect(cta().disabled).toBe(true)
  })

  it('an FTP under the plan engine floor is refused, with the reason', () => {
    renderPage()
    openFtp()
    fireEvent.change(ftpField(), { target: { value: '95' } })
    expect(screen.getByText(/100 Watt/)).toBeTruthy()
    expect(cta().disabled).toBe(true)
  })

  it('a weight outside the range the starter model trusts is refused', () => {
    renderPage()
    openWeight()
    fireEvent.change(weightField(), { target: { value: '700' } })
    expect(screen.getByText(/30.?200/)).toBeTruthy()
    expect(cta().disabled).toBe(true)
  })

  it('text that is not a number is never quietly swapped for a starter value', () => {
    renderPage()
    openWeight()
    fireEvent.change(weightField(), { target: { value: 'schwer' } })
    expect(screen.getByText(/nicht als Zahl/)).toBeTruthy()
    expect(cta().disabled).toBe(true)
  })

  it('correcting the number lets the rider continue, and posts the corrected one', async () => {
    renderPage()
    openFtp()
    fireEvent.change(ftpField(), { target: { value: '5000' } })
    expect(cta().disabled).toBe(true)
    fireEvent.change(ftpField(), { target: { value: '245' } })
    expect(cta().disabled).toBe(false)
    fireEvent.click(cta())
    await waitFor(() => expect(updateProfile).toHaveBeenCalled())
    expect(updateProfile.mock.calls[0][0]).toMatchObject({ ftp_watts: 245 })
  })
})
