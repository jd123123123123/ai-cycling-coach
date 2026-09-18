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
  // Form wie in der Produktion gemessen (Konto 5, 18.09.): before/after tragen
  // target_tss, und `title` ist dort ENGLISCH -- die deutschen Namen stehen in
  // evidence.was/wird.
  before: { date: '2026-09-18', title: 'Threshold — 2×15min', target_tss: 64, template_id: 'threshold_2x15' },
  after: { date: '2026-09-18', title: 'Z2 endurance — 60min', target_tss: 42, template_id: 'z2_endurance_60' },
  evidence: {
    was: 'Schwelle — 2×15 min', wird: 'Grundlagenausdauer — 60 min',
    driver_text_de: 'Tiefschlaf 0,5 h, dein Schnitt ist 1,2 h.',
    readiness_score: 55, driver_key: 'sleep_deep', driver_z: -1.22,
    counterfactual_de: 'Ohne diese Werte: Schwelle — 2×15 min.',
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
    // Beide Seiten sind benannt -- der Fahrer soll nicht raten muessen, welcher
    // der beiden Namen der alte ist.
    expect(screen.getByText('War geplant')).toBeTruthy()
    expect(screen.getByText('Steht jetzt')).toBeTruthy()
    expect(screen.getByText('Schwelle — 2×15 min')).toBeTruthy()
    // DIE LAST IST DAS ARGUMENT. Die Namen sagen einem Fahrer, der die
    // Vorlagen kennt, alles -- und allen anderen nichts.
    expect(screen.getByText('64')).toBeTruthy()
    expect(screen.getByText('42')).toBeTruthy()
    expect(screen.getByText('−34 % Last')).toBeTruthy()
    expect(screen.getByText(/Tiefschlaf 0,5 h/)).toBeTruthy()
    // Label und Wert stehen getrennt: die Zahl ist ein eigener Rang, kein
    // Teil eines Fliesstextes -- sonst hat der gemessene Wert die Groesse
    // einer Fussnote, und genau so sah der Beleg vorher aus.
    expect(screen.getByText('Bereitschaft')).toBeTruthy()
    expect(screen.getByText('55')).toBeTruthy()
    // Das z gehoert dem TREIBER, nicht dem Score: an die Bereitschafts-Pille
    // gehaengt behauptete es, der Score selbst laege 1,2 Streuungen daneben.
    expect(screen.getByText('Tiefschlaf')).toBeTruthy()
    expect(screen.getByText('unter Ø')).toBeTruthy()
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

  it('zeigt auch eine Anpassung, die den Tag SCHWERER macht', () => {
    // Eine Verschiebung holt eine ausgefallene Einheit nach: 84 -> 97 TSS.
    // Der Beleg darf nicht so tun, als ginge es immer nach unten.
    mockFeed.mockReturnValue({ data: { adaptations: [zeile({
      rule: 'missed_key_reflow', signal: 'missed_key_session',
      before: { date: '2026-09-18', title: 'Long Z2 — 2h', target_tss: 84 },
      after: { date: '2026-09-18', title: 'Sweet spot — 3×20min', target_tss: 97 },
      evidence: { missed_date: '2026-09-15' },
    })] } })
    render(<W3TodayAdapted todayKey="2026-09-18" />)
    expect(screen.getByText('+15 % Last')).toBeTruthy()
    // Und ihr Grund ist ein Datum, kein Messwert -- der stand bisher nur im
    // Satz auf der Planseite.
    expect(screen.getByText('Ausgefallen am')).toBeTruthy()
    expect(screen.getByText('15.9.')).toBeTruthy()
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
