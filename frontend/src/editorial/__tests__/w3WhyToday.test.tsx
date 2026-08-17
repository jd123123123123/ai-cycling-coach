// frontend/src/editorial/__tests__/w3WhyToday.test.tsx
//
// "Warum diese Einheit?" — the daily session-level why on W3 Today.
//
// The honesty contract this file guards:
//  · every reason names its own measurement (the explainer's `detail`), never
//    a mood word;
//  · severity is VISIBLE — an easing row and a green-light row cannot render
//    the same colour;
//  · an empty `changes[]` prints the explainer's honest steady-state summary
//    instead of manufactured drama;
//  · nothing on the wire → the card is absent, not an empty shell.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import W3WhyToday from '../w3/W3WhyToday'
import { T } from '../w3/w3tokens'

const briefMock = vi.fn()
const weekMock = vi.fn()

vi.mock('../../hooks/useCoachBrief', () => ({
  useCoachBrief: () => briefMock(),
}))
vi.mock('../../hooks/useCurrentWeek', () => ({
  useCurrentWeek: () => weekMock(),
}))

afterEach(cleanup)
beforeEach(() => {
  briefMock.mockReturnValue({ data: undefined })
  weekMock.mockReturnValue({ data: undefined })
})

const CHANGE_HRV = {
  signal: 'HRV',
  direction: 'up' as const,
  detail: 'HRV liegt 9% über dem Schnitt — gut erholt',
  action: 'grünes Licht für eine Qualitäts-/Intensitätseinheit',
  principle: 'Eine erhöhte HRV zeigt starke autonome Erholung.',
  severity: 'boost' as const,
  kind: 'recovery' as const,
}
const CHANGE_YESTERDAY = {
  signal: 'Gestern',
  direction: 'flat' as const,
  detail: 'gestern waren es 120 TSS — das 2,0-Fache deiner täglichen Dauerlast (CTL 60)',
  action: 'heute bleibt es locker, um die Anpassung zu sichern',
  principle: 'Anpassung passiert in der Erholung.',
  severity: 'ease' as const,
  kind: 'load' as const,
}

const meso = {
  phase: 'build1',
  block_position: 'accumulation' as const,
  block_index_in_meso: 1,
  weekly_tss_target: 315,
  days_to_event: 61,
  target_event_type: 'gran_fondo',
  hours_note: null,
  progression: null,
}

describe('W3WhyToday', () => {
  it('renders nothing when neither the brief nor the week has landed', () => {
    const { container } = render(<W3WhyToday />)
    expect(container.innerHTML).toBe('')
  })

  it('names the evidence and what it did to the session', () => {
    briefMock.mockReturnValue({ data: { adaptations: { summary: 'x', changes: [CHANGE_HRV] } } })
    weekMock.mockReturnValue({ data: { days: [{ is_today: true, title: 'Sweet-Spot 3×12' }], meso_block: meso } })
    render(<W3WhyToday />)

    // The measurement, verbatim from GET /coach/brief → adaptations.changes[].
    expect(screen.getByText(/HRV liegt 9% über dem Schnitt/)).toBeTruthy()
    // What it did to today's session.
    expect(screen.getByText(/grünes Licht für eine Qualitäts/)).toBeTruthy()
    // Today's real session by name, from GET /weeks/current.
    expect(screen.getByText('Sweet-Spot 3×12')).toBeTruthy()
    // Provenance of the number — measured overnight, not derived.
    expect(screen.getByText('über Nacht gemessen')).toBeTruthy()
  })

  it('renders an easing signal in a different colour than a green light', () => {
    briefMock.mockReturnValue({
      data: { adaptations: { summary: 'x', changes: [CHANGE_HRV, CHANGE_YESTERDAY] } },
    })
    weekMock.mockReturnValue({ data: { days: [], meso_block: meso } })
    render(<W3WhyToday />)

    const boost = screen.getByText('HRV')
    const ease = screen.getByText('Gestern')
    expect(boost.style.color).toBe(hexToRgb(T.acid))
    expect(ease.style.color).toBe(hexToRgb(T.warn))
    expect(boost.style.color).not.toBe(ease.style.color)
  })

  it('reveals the principle behind a reason on tap', () => {
    briefMock.mockReturnValue({ data: { adaptations: { summary: 'x', changes: [CHANGE_HRV] } } })
    weekMock.mockReturnValue({ data: { days: [], meso_block: meso } })
    render(<W3WhyToday />)

    expect(screen.queryByText(/starke autonome Erholung/)).toBeNull()
    fireEvent.click(screen.getByText('HRV'))
    expect(screen.getByText(/starke autonome Erholung/)).toBeTruthy()
  })

  it('prints the explainer steady-state sentence instead of inventing reasons', () => {
    briefMock.mockReturnValue({
      data: {
        adaptations: {
          summary: 'Signale stabil seit gestern — der Plan folgt dem periodisierten Aufbau.',
          changes: [],
        },
      },
    })
    weekMock.mockReturnValue({ data: { days: [], meso_block: meso } })
    render(<W3WhyToday />)

    expect(screen.getByText(/Signale stabil seit gestern/)).toBeTruthy()
    expect(screen.queryByText(/eingeflossen/)).toBeNull()
  })

  it('explains the CTL-anchored volume ceiling in plain German with real numbers', () => {
    briefMock.mockReturnValue({ data: { adaptations: { summary: 'x', changes: [] } } })
    weekMock.mockReturnValue({
      data: {
        days: [],
        meso_block: {
          ...meso,
          hours_note: { declared_hours: 12, start_hours: 4.5, reason: 'ctl_anchor', de: '', en: '' },
        },
      },
    })
    render(<W3WhyToday />)

    // German decimal comma, both real numbers, no invented middle ground.
    expect(screen.getByText(/12 h\/Woche angegeben — der Plan startet bei 4,5 h/)).toBeTruthy()
  })

  // OWNER 2026-08-17: "76 / Bereitschaft / Bereit" on a rest day reads as a
  // contradiction. Both statements are true — readiness measures the body, the
  // plan decides the day — so the copy has to say which is which, and nothing
  // may invite the rider to ride on a day the plan rests.
  it('reconciles a green signal with a rest day instead of inviting a ride', () => {
    briefMock.mockReturnValue({ data: { adaptations: { summary: 'x', changes: [CHANGE_HRV] } } })
    weekMock.mockReturnValue({
      data: { days: [{ is_today: true, title: 'Ruhetag', category: 'rest' }], meso_block: meso },
    })
    render(<W3WhyToday />)

    // The measurement survives untouched …
    expect(screen.getByText(/HRV liegt 9% über dem Schnitt/)).toBeTruthy()
    // … but the invitation to go hard does not.
    expect(screen.queryByText(/grünes Licht für eine Qualitäts/)).toBeNull()
    expect(screen.getByText(/Der Plan hält heute trotzdem Ruhetag/)).toBeTruthy()
    expect(screen.getByText(/über den Tag entscheidet der Plan/)).toBeTruthy()
    // And the row is no longer coloured as a green light.
    expect(screen.getByText('HRV').style.color).not.toBe(hexToRgb(T.acid))
  })

  it('leaves a green signal green on a training day', () => {
    briefMock.mockReturnValue({ data: { adaptations: { summary: 'x', changes: [CHANGE_HRV] } } })
    weekMock.mockReturnValue({
      data: { days: [{ is_today: true, title: 'VO2 5×4', category: 'vo2' }], meso_block: meso },
    })
    render(<W3WhyToday />)
    expect(screen.getByText(/grünes Licht für eine Qualitäts/)).toBeTruthy()
    expect(screen.getByText('HRV').style.color).toBe(hexToRgb(T.acid))
  })

  it('places the week inside its real mesocycle block', () => {
    briefMock.mockReturnValue({ data: { adaptations: { summary: 'x', changes: [] } } })
    weekMock.mockReturnValue({ data: { days: [], meso_block: meso } })
    render(<W3WhyToday />)

    // block_index_in_meso 1 → the SECOND week of a 3:1 block.
    expect(screen.getByText(/Woche 2 von 4 im Umfangsblock/)).toBeTruthy()
    expect(screen.getByText('Wochenbudget 315 TSS')).toBeTruthy()
    expect(screen.getByText('61 Tage bis zum Ziel')).toBeTruthy()
  })
})

/** jsdom normalises inline hex colours to rgb() — compare like for like. */
function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}
