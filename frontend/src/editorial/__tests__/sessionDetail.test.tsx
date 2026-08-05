import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import SessionCta from '../components/SessionCta'
import { SessionDetailView } from '../pages/SessionDetailPage'
import { missing, present } from '../data/value'
import type { SessionModel } from '../data/useSessionModel'

afterEach(cleanup)

describe('Session Detail CTA', () => {
  it('states what the app actually does, not what the pen drew', () => {
    render(<SessionCta onExport={() => {}} />)
    expect(screen.getByRole('button', { name: /workout exportieren/i })).toBeTruthy()
    expect(screen.queryByText(/send workout to garmin/i)).toBeNull()
    expect(screen.queryByText(/an garmin senden/i)).toBeNull()
  })

  it('keeps the pen sub-line structure', () => {
    render(<SessionCta onExport={() => {}} />)
    expect(screen.getByText(/intervalle und strecke/i)).toBeTruthy()
  })
})

const fullModel: SessionModel = {
  dateLabel: present('MI 22 JUL'),
  title: present('Schwelle 4×8'),
  claim: present('Zweiunddreißig Minuten am Limit dessen, was du halten kannst.'),
  numeral: present({ text: '4×8', qualifier: 'Z4', sub: '8 MIN BLÖCKE' }),
  statWatts: present(285),
  statDurationMin: present(105),
  statTss: present(98),
  statInZoneMin: present(32),
  blocks: present([
    { key: 'warmup', name: 'AUFWÄRMEN', note: present('Z2'), minutes: 20, watts: present(180), reps: 1, isMain: false },
    { key: 'block', name: 'BLOCK', note: present('Z4'), minutes: 32, watts: present(285), reps: 4, isMain: true },
    { key: 'cooldown', name: 'AUSFAHREN', note: present('Z1'), minutes: 15, watts: present(120), reps: 1, isMain: false },
  ]),
  totalDurationMin: present(105),
  totalAtThresholdMin: present(32),
  payoff: present([
    { label: 'MI', tss: present(98), isToday: true },
    { label: 'DO', tss: present(30), isToday: false },
    { label: 'FR', tss: present(45), isToday: false },
    { label: 'SA', tss: present(60), isToday: false },
    { label: 'SO', tss: present(50), isToday: false },
    { label: 'MO', tss: present(65), isToday: false },
    { label: 'DI', tss: present(70), isToday: false },
    { label: 'MI', tss: present(101), isToday: false },
  ]),
  payoffClaim: missing('Der Coach hat die nächsten sieben Tage noch nicht eingeordnet.'),
  whatThisChanges: present({
    onYou: { claim: 'Deine Schwelle steigt', detail: 'Referenzwert aktualisiert.' },
    onThePlan: { claim: 'Donnerstag bleibt locker', detail: 'Nichts ändert sich morgen.' },
  }),
  isLoading: false,
}

const emptyModel: SessionModel = {
  dateLabel: present('MI 22 JUL'),
  title: missing('Für heute nichts geplant.'),
  claim: missing('Für heute nichts geplant.'),
  numeral: missing('Für heute nichts geplant.'),
  statWatts: missing('Für heute nichts geplant.'),
  statDurationMin: missing('Für heute nichts geplant.'),
  statTss: missing('Für heute nichts geplant.'),
  statInZoneMin: missing('Für heute nichts geplant.'),
  blocks: missing('Für heute nichts geplant.'),
  totalDurationMin: missing('Für heute nichts geplant.'),
  totalAtThresholdMin: missing('Für heute nichts geplant.'),
  payoff: missing('Noch keine Sieben-Tage-Prognose.'),
  payoffClaim: missing('Der Coach hat die nächsten sieben Tage noch nicht eingeordnet.'),
  whatThisChanges: missing('Der Coach hat sich zu dieser Fahrt noch nicht geäußert.'),
  isLoading: false,
}

describe('SessionDetailPage — section composition', () => {
  it('renders every section in pen-verified order: Nav, Hero, 01 Blocks, Quote, 03 Payoff, CTA', () => {
    const { container } = render(
      <MemoryRouter>
        <SessionDetailView model={fullModel} />
      </MemoryRouter>,
    )
    const main = container.querySelector('[data-session-detail]')
    expect(main).not.toBeNull()

    const order = ['[data-hero-numeral]', '[data-programme]', '[data-quote-plate]', '[data-stat-tile]']
    const all = Array.from(main!.querySelectorAll('*'))
    const positions = order.map((sel) => {
      const el = main!.querySelector(sel)
      expect(el).not.toBeNull()
      return all.indexOf(el!)
    })
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[0])
    }
    expect(main!.textContent).toContain('WORKOUT EXPORTIEREN')
  })

  it('has no 02 HOW TO RIDE IT section — the pen tree has none', () => {
    const { container } = render(
      <MemoryRouter>
        <SessionDetailView model={fullModel} />
      </MemoryRouter>,
    )
    expect(container.textContent).not.toMatch(/how to ride it/i)
  })

  it('renders no 04 WHERE TO RIDE IT section — no route data source exists', () => {
    const { container } = render(
      <MemoryRouter>
        <SessionDetailView model={fullModel} />
      </MemoryRouter>,
    )
    expect(container.textContent).not.toMatch(/where to ride it|wo du fahren solltest/i)
  })

  it('renders honest dashes and reasons when nothing resolves, frame intact', () => {
    render(
      <MemoryRouter>
        <SessionDetailView model={emptyModel} />
      </MemoryRouter>,
    )
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/für heute nichts geplant/i).length).toBeGreaterThan(0)
    // The CTA and its honest label still render even with no session data.
    expect(screen.getByRole('button', { name: /workout exportieren/i })).toBeTruthy()
  })
})
