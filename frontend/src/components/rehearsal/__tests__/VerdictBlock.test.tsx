import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import VerdictBlock from '../VerdictBlock'

const base = {
  band: { p10_s: 17520, p50_s: 18600, p90_s: 19680, draws: 200 },
  blowUpKm: null as number | null,
  blowUpClimb: null as string | null,
  cdaIsDefault: false,
  weatherUsed: false,
  de: true,
}

describe('VerdictBlock', () => {
  afterEach(cleanup)

  it('shows a range, never a single time', () => {
    render(<VerdictBlock {...base} />)
    // 17520 s = 4:52, 19680 s = 5:28
    expect(screen.getByText(/4:52/)).toBeTruthy()
    expect(screen.getByText(/5:28/)).toBeTruthy()
  })

  it('never renders the p50 alone as the answer', () => {
    const { container } = render(<VerdictBlock {...base} />)
    // 18600 s = 5:10 — the median must not appear anywhere on the block.
    expect(container.textContent).not.toContain('5:10')
  })

  it('names the blow-up when there is one', () => {
    render(<VerdictBlock {...base} blowUpKm={84} blowUpClimb="Giau" />)
    expect(screen.getByText(/Giau/)).toBeTruthy()
    expect(screen.getByText(/84/)).toBeTruthy()
  })

  it('names the wattage ceiling that would prevent the blow-up', () => {
    render(<VerdictBlock {...base} blowUpKm={84} blowUpClimb="Giau" blowUpWatts={268} />)
    expect(screen.getByText(/268 W/)).toBeTruthy()
  })

  it('drops the climb name from the blow-up sentence when there is none', () => {
    render(<VerdictBlock {...base} blowUpKm={84} blowUpClimb={null} />)
    expect(screen.getByText(/km 84/)).toBeTruthy()
  })

  it('says the aero number is a default when it is', () => {
    render(<VerdictBlock {...base} cdaIsDefault />)
    expect(screen.getByText(/Standardwert|gesch/i)).toBeTruthy()
  })

  it('says the durability fade is unmeasured when it is', () => {
    render(<VerdictBlock {...base} durabilityIsDefault />)
    expect(screen.getByText(/Ermüdungsverlust unbekannt/)).toBeTruthy()
  })

  // A missing W′ silently disables the simulator's cap branch: no blow-up is
  // ever recorded and the W′ series is flat zero. Without this line the
  // athlete reads that absence as "I never break".
  it('says it cannot locate the blow-up when no W′ is on file', () => {
    render(<VerdictBlock {...base} wPrimeIsDefault />)
    expect(screen.getByText(/Kein W′ hinterlegt/)).toBeTruthy()
  })

  it('stays silent about W′ when a measured one backs the projection', () => {
    const { container } = render(<VerdictBlock {...base} wPrimeIsDefault={false} />)
    expect(container.textContent).not.toContain('Kein W′')
  })

  it('says so in English too', () => {
    render(
      <VerdictBlock {...base} de={false} cdaIsDefault durabilityIsDefault wPrimeIsDefault weatherUsed />,
    )
    expect(screen.getByText(/default estimate/i)).toBeTruthy()
    expect(screen.getByText(/No durability data yet/i)).toBeTruthy()
    expect(screen.getByText(/No W′ on file/i)).toBeTruthy()
    expect(screen.getByText(/from the forecast/i)).toBeTruthy()
  })

  it('renders nothing but the reason when there is no band', () => {
    render(<VerdictBlock {...base} band={undefined} missing={['cp']} />)
    expect(screen.queryByText(/4:52/)).toBeNull()
    expect(screen.getByText(/FTP/i)).toBeTruthy()
  })

  it('names body weight when that is what is missing', () => {
    render(<VerdictBlock {...base} band={undefined} missing={['weight']} />)
    expect(screen.queryByText(/4:52/)).toBeNull()
    expect(screen.getByText(/Körpergewicht/)).toBeTruthy()
  })
})
