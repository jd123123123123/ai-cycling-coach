// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import W3TodayAdapted from '../W3TodayAdapted'

/**
 * Der Nachweis lag ausschliesslich auf der Planseite, hinter einem Tipp. Wer
 * morgens auf Heute schaute, sah eine Einheit, die gestern eine andere war --
 * und nichts, was das erklaerte.
 */
const zeile = (over = {}) => ({
  id: 1, created_at: '2026-09-18T06:19:00Z', target_date: '2026-09-18',
  source: 'hourly', signal: 'readiness_decision', rule: 'readiness_applied',
  before: { title: 'Schwelle — 2×15 min' }, after: { title: 'Grundlagenausdauer — 60 min' },
  evidence: {
    was: 'Schwelle — 2×15 min', wird: 'Grundlagenausdauer — 60 min',
    driver_text_de: 'Tiefschlaf 0,5 h, dein Schnitt ist 1,2 h.',
    readiness_score: 55, counterfactual_de: 'Ohne diese Werte: Schwelle — 2×15 min.',
    principle_de: 'Tiefschlaf trägt die körperliche Erholung — fällt er aus, fehlt die Grundlage für harte Intervalle.',
  },
  message_de: 'Tiefschlaf 0,5 h, dein Schnitt ist 1,2 h.', message_en: '',
  ...over,
})

const mockFeed = vi.fn()
vi.mock('../../../hooks/usePlanAdaptations', () => ({
  usePlanAdaptations: () => mockFeed(),
}))

afterEach(() => { cleanup(); mockFeed.mockReset() })

describe('Heute: der Hinweis an der Einheit', () => {
  it('zeigt Tausch, Treiber, Wert UND den Grundsatz', () => {
    mockFeed.mockReturnValue({ data: { adaptations: [zeile()] } })
    render(<W3TodayAdapted todayKey="2026-09-18" />)
    expect(screen.getByText('Grundlagenausdauer — 60 min')).toBeTruthy()
    expect(screen.getByText('Schwelle — 2×15 min')).toBeTruthy()
    expect(screen.getByText(/Tiefschlaf 0,5 h/)).toBeTruthy()
    expect(screen.getByText(/Bereitschaft 55/)).toBeTruthy()
    // Der wissenschaftliche Anker darf nicht am Platzmangel scheitern.
    expect(screen.getByText(/körperliche Erholung/)).toBeTruthy()
  })

  it('schweigt an einem Tag ohne Anpassung — kein Platzhalter', () => {
    mockFeed.mockReturnValue({ data: { adaptations: [] } })
    const { container } = render(<W3TodayAdapted todayKey="2026-09-18" />)
    expect(container.firstChild).toBeNull()
  })

  it('zeigt die Anpassung eines ANDEREN Tages nicht', () => {
    mockFeed.mockReturnValue({ data: { adaptations: [zeile({ target_date: '2026-09-20' })] } })
    const { container } = render(<W3TodayAdapted todayKey="2026-09-18" />)
    expect(container.firstChild).toBeNull()
  })

  it('zeigt nicht, was der Fahrer selbst angepasst hat', () => {
    // Das weiss er; dieser Hinweis gehoert dem, was ohne sein Zutun geschah.
    mockFeed.mockReturnValue({ data: { adaptations: [zeile({ rule: 'user_modified' })] } })
    const { container } = render(<W3TodayAdapted todayKey="2026-09-18" />)
    expect(container.firstChild).toBeNull()
  })

  it('haelt auch eine Zeile ohne Beleg aus', () => {
    mockFeed.mockReturnValue({ data: { adaptations: [zeile({ evidence: null, before: null, after: null })] } })
    const { container } = render(<W3TodayAdapted todayKey="2026-09-18" />)
    // Kopfzeile ja, erfundener Inhalt nein.
    expect(container.querySelector('.w3-receipt')).toBeNull()
  })
})
