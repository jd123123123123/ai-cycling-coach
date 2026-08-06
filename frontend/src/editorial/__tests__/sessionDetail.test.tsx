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
  routes: present([
    {
      key: 'oelberg-0', optionLetter: 'A', name: 'Ölberg Loop', distanceKm: 40, rideCount: 6,
      ascentM: present(640), trackPolyline: present([[50.68, 7.23], [50.70, 7.26], [50.71, 7.29]]),
    },
    {
      key: 'rheinaue-1', optionLetter: 'B', name: 'Rheinaue Flat', distanceKm: 28, rideCount: 11,
      ascentM: present(120), trackPolyline: present([[50.70, 7.10], [50.71, 7.13], [50.69, 7.15]]),
    },
    {
      key: 'siebengebirge-2', optionLetter: 'C', name: 'Siebengebirge Short', distanceKm: 22, rideCount: 3,
      ascentM: missing('Keine Höhenmeter für diese Strecke erfasst.'), trackPolyline: missing('Keine GPS-Strecke für diese Route erfasst.'),
    },
  ]),
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
  routes: missing('Noch keine eigenen GPS-Strecken erfasst.'),
  isLoading: false,
}

describe('SessionDetailPage — section composition', () => {
  it('renders every section in pen-verified order: Nav, Hero, 01 Blocks, Quote, 03 Payoff, 04 Where To Ride It, CTA', () => {
    const { container } = render(
      <MemoryRouter>
        <SessionDetailView model={fullModel} />
      </MemoryRouter>,
    )
    const main = container.querySelector('[data-session-detail]')
    expect(main).not.toBeNull()

    const order = ['[data-hero-numeral]', '[data-programme]', '[data-quote-plate]', '[data-stat-tile]', '[data-route-options]']
    const all = Array.from(main!.querySelectorAll('*'))
    const positions = order.map((sel) => {
      const el = main!.querySelector(sel)
      expect(el).not.toBeNull()
      return all.indexOf(el!)
    })
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[0])
    }
    // "04 WHERE TO RIDE IT" sits after "03 THE PAYOFF" and before the CTA.
    const ctaButton = screen.getByRole('button', { name: /workout exportieren/i })
    const routeSection = main!.querySelector('[data-route-options]')!
    expect(all.indexOf(routeSection)).toBeLessThan(all.indexOf(ctaButton))
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

  it('renders 04 WHERE TO RIDE IT with real route rows, no per-route weather, one shared profile reason', () => {
    const { container } = render(
      <MemoryRouter>
        <SessionDetailView model={fullModel} />
      </MemoryRouter>,
    )
    expect(container.textContent).toMatch(/wo du fahren solltest/i)
    expect(container.textContent).toContain('Ölberg Loop')
    expect(container.textContent).toContain('Rheinaue Flat')
    // The elevation-profile reason prints once for the section, not once per route.
    const profileReasonCount = (container.textContent!.match(/Kein Höhenprofil je Strecke verfügbar\./g) ?? []).length
    expect(profileReasonCount).toBe(1)
    // The route with no polyline shows its own honest reason instead of a sketch.
    expect(container.textContent).toContain('Keine GPS-Strecke für diese Route erfasst.')
  })

  it('renders 04 WHERE TO RIDE IT as one honest reason, not three dashed rows, when routes are unavailable', () => {
    const { container } = render(
      <MemoryRouter>
        <SessionDetailView model={emptyModel} />
      </MemoryRouter>,
    )
    expect(container.textContent).toMatch(/wo du fahren solltest/i)
    expect(container.textContent).toContain('Noch keine eigenen GPS-Strecken erfasst.')
    expect(container.querySelector('[data-route-track]')).toBeNull()
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

  // ---- Bug fix (2026-08-06): the withheld hero numeral -----------------
  // Same defect, same fix as Today's own MetricTrack (commit 5f98a62): a
  // "—" scaled to the 104px hero slot read as a solid grey rectangle, not
  // as "no session." The missing arm now composes a small dot + headline
  // instead, and never prints the literal em dash character at hero size.
  it('never renders a bare "—" in the hero numeral slot — the missing state is a composed dot + headline', () => {
    const { container } = render(
      <MemoryRouter>
        <SessionDetailView model={emptyModel} />
      </MemoryRouter>,
    )
    const heroNumeral = container.querySelector('[data-hero-numeral]')
    expect(heroNumeral).not.toBeNull()
    expect(heroNumeral!.textContent).not.toBe('—')
    expect(heroNumeral!.textContent).toContain('Für heute nichts geplant.')
  })

  it('renders the real numeral text (no dash, no reason) in the hero slot when a session exists', () => {
    const { container } = render(
      <MemoryRouter>
        <SessionDetailView model={fullModel} />
      </MemoryRouter>,
    )
    const heroNumeral = container.querySelector('[data-hero-numeral]')
    expect(heroNumeral!.textContent).toBe('4×8')
  })

  // ---- Design pass (2026-08-06): dedupe reasons screen-wide, not per ---
  // section. With no session at all, the numeral/claim/every hero stat/the
  // "01 The Blocks" fallback all share the identical "nothing planned"
  // reason — it must print exactly once (on the hero numeral, this screen's
  // most prominent slot), never once per slot.
  it('prints the shared "nothing planned" reason exactly once across the whole screen', () => {
    render(
      <MemoryRouter>
        <SessionDetailView model={emptyModel} />
      </MemoryRouter>,
    )
    expect(screen.getAllByText(/für heute nichts geplant/i).length).toBe(1)
  })
})

describe('SessionDetailPage — header spine', () => {
  const identity = { streakDays: 12, avatarUrl: null, avatarInitial: 'J' }

  it('shows no avatar or streak when identity is absent — matches a fixture render with no auth', () => {
    render(
      <MemoryRouter>
        <SessionDetailView model={fullModel} />
      </MemoryRouter>,
    )
    expect(screen.queryByLabelText(/mein profil/i)).toBeNull()
  })

  it('shows the same date · streak · avatar identity strip Today carries, reconciling the two headers', () => {
    render(
      <MemoryRouter>
        <SessionDetailView model={fullModel} identity={identity} />
      </MemoryRouter>,
    )
    expect(screen.getByLabelText(/mein profil/i)).toBeTruthy()
    expect(screen.getByText('12 TAGE')).toBeTruthy()
    // The back affordance a detail view needs is still there alongside it.
    expect(screen.getByRole('button', { name: /back/i })).toBeTruthy()
  })
})
