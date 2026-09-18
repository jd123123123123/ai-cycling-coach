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
    // Die Vorher-Einheit steht als Fussnote unter der neuen, im selben Satz:
    // "statt ..." sagt bereits, dass sie weg ist -- ein Durchstrich obendrauf
    // waere dieselbe Aussage ein zweites Mal.
    expect(screen.getByText('statt Schwelle — 2×15 min')).toBeTruthy()
    expect(screen.getByText(/Tiefschlaf 0,5 h/)).toBeTruthy()
    // Label und Wert stehen getrennt: die Zahl ist ein eigener Rang, kein
    // Teil eines Fliesstextes -- sonst hat der gemessene Wert die Groesse
    // einer Fussnote, und genau so sah der Beleg vorher aus.
    expect(screen.getByText('Bereitschaft')).toBeTruthy()
    expect(screen.getByText('55')).toBeTruthy()
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
    // Ohne Beleg gibt es nichts zu zeigen -- und keinen leeren Rahmen, der so
    // tut, als gaebe es etwas.
    expect(container.querySelector('section')).toBeNull()
  })

  it('zeigt auch die Anpassung aus dem Morgenbefund (R7)', () => {
    // Diese Regel fehlte in AUTOMATISCH, als sie dazukam: der Plan aenderte
    // die Einheit, und Heute schwieg -- der eine Fall, den diese Komponente
    // ueberhaupt abdecken soll.
    mockFeed.mockReturnValue({ data: { adaptations: [zeile({
      rule: 'morning_health_downgrade', signal: 'morning_health',
    })] } })
    render(<W3TodayAdapted todayKey="2026-09-18" />)
    expect(screen.getByText('Grundlagenausdauer — 60 min')).toBeTruthy()
  })

  it('wiederholt den Gegenentwurf nicht, wenn die Vorher-Einheit dasteht', () => {
    // "statt Schwelle — 2x15 min" und "Ohne diese Werte: Schwelle — 2x15 min."
    // sind dieselbe Tatsache in zwei Formulierungen; zwei Formulierungen lesen
    // sich wie zwei Tatsachen.
    mockFeed.mockReturnValue({ data: { adaptations: [zeile()] } })
    render(<W3TodayAdapted todayKey="2026-09-18" />)
    expect(screen.queryByText(/Ohne diese Werte/)).toBeNull()
  })

  it('zeigt den Gegenentwurf, wenn die Vorher-Einheit fehlt', () => {
    const z = zeile()
    const ev = { ...(z.evidence as Record<string, unknown>) }
    delete ev.was
    mockFeed.mockReturnValue({ data: { adaptations: [
      { ...z, before: null, evidence: ev },
    ] } })
    render(<W3TodayAdapted todayKey="2026-09-18" />)
    expect(screen.getByText(/Ohne diese Werte/)).toBeTruthy()
  })
})
