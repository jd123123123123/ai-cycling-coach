import { describe, it, expect, beforeEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import W3ReadinessDecision, {
  ageNote,
  ageShort,
  formatValue,
  railPosition,
  sessionMeta,
  splitCounterfactual,
} from '../W3ReadinessDecision'
import type {
  ReadinessDecision,
  ReadinessInput,
} from '../../../api/readinessDecision'

// Explicit, because this project does not run vitest with `globals: true` —
// without it every render stacks and each assertion matches the PREVIOUS
// test's DOM as well as its own.
beforeEach(() => { cleanup() })

const input = (over: Partial<ReadinessInput>): ReadinessInput => ({
  key: 'hrv',
  label_de: 'HRV (7-Tage-Schnitt)',
  value: 48,
  unit: 'ms',
  basis: 'recent_7d',
  baseline: 66,
  baseline_n: 28,
  deviation: -18,
  deviation_pct: -27,
  z: -2.1,
  band: 1,
  severity: 2.1,
  off: true,
  direction: 'below',
  unfavourable: true,
  age_days: 0,
  text_de: '18 ms unter deinem Schnitt von 66 ms.',
  note_de: null,
  ...over,
})

const rhr = (over: Partial<ReadinessInput> = {}): ReadinessInput =>
  input({
    key: 'resting_hr',
    label_de: 'Ruhepuls',
    value: 52,
    unit: 'bpm',
    basis: 'today',
    baseline: 50,
    deviation: 2,
    z: 0.6,
    band: 1.2,
    severity: 0.5,
    off: false,
    direction: 'above',
    unfavourable: false,
    text_de: '2 bpm über deinem Schnitt von 50 bpm.',
    ...over,
  })

const decision = (over: Partial<ReadinessDecision> = {}): ReadinessDecision => ({
  date: '2026-09-07',
  gate: 'fresh',
  data_age_days: 0,
  last_measured_on: '2026-09-07',
  withheld: false,
  withheld_reason_de: null,
  verdict: {
    text_de: 'Grundlagenausdauer — 60 min statt Sweetspot — 2×20 min.',
    state: 'easy',
    tss_target: 45,
    counterfactual_text_de: 'Ohne diese Werte: Sweetspot — 2×20 min.',
  },
  session_now: {
    title: 'Grundlagenausdauer',
    template_id: 'endurance_60',
    duration_minutes: 60,
    target_tss: 45,
  },
  session_planned: {
    title: 'Sweetspot 2×20',
    template_id: 'ss_2x20',
    duration_minutes: 90,
    target_tss: 78,
  },
  changed: true,
  counterfactual_source: 'recomputed',
  applied: false,
  driver: { key: 'hrv', text_de: 'HRV 18 ms unter deinem Schnitt.', z: -2.1, severity: 2.1 },
  inputs: [input({}), rhr()],
  baseline_state: 'ready',
  readiness_score: 43,
  readiness_tier: 'Locker',
  hrv_state: 'below',
  can_modify: true,
  ...over,
})

describe('W3ReadinessDecision · the downgraded day', () => {
  it('leads with the verdict, prints the counterfactual and names the driver', () => {
    render(<W3ReadinessDecision decision={decision()} />)

    // 1 — the verdict is the headline, and it is the biggest thing on the card.
    const verdictEl = screen.getByTestId('rd-verdict')
    expect(verdictEl.textContent).toBe(
      'Grundlagenausdauer — 60 min statt Sweetspot — 2×20 min.',
    )
    // THE WHOLE INVERSION, ASSERTED. Today's card sets the number bigger than
    // the instruction; here the instruction is set bigger than the number, and
    // a future edit that quietly promotes the score again fails this line.
    const verdictSize = parseFloat(verdictEl.style.fontSize)
    const scoreSize = parseFloat(screen.getByTestId('rd-score').style.fontSize)
    expect(verdictSize).toBeGreaterThan(scoreSize)
    expect(verdictEl.style.color).toBeTruthy()

    // 2 — THE FEATURE. The session that was taken away, in full.
    const cf = screen.getByTestId('rd-counterfactual')
    expect(cf.textContent).toContain('Ohne diese Werte:')
    expect(cf.textContent).toContain('Sweetspot — 2×20 min.')
    // …with what it would have cost, from `session_planned`.
    expect(cf.textContent).toContain('90 min · 78 TSS')
    // …and honest about being a re-run rather than a stored before-image.
    expect(cf.textContent).toContain('Neu berechnet ohne die Messwerte.')

    // 3 — the one measurement that moved it, with its number.
    expect(screen.getByTestId('rd-driver').textContent).toBe(
      'HRV 18 ms unter deinem Schnitt.',
    )

    // 4 — the score is evidence, present but subordinate, and NOT coloured
    //     into a second verdict the rider has to reconcile with "Locker".
    expect(screen.getByTestId('rd-score').textContent).toBe('43')
    expect(screen.getByText('Locker')).toBeTruthy()

    // 5 — the working, in one view rather than behind a tap.
    expect(screen.getByTestId('rd-input-hrv')).toBeTruthy()
    expect(screen.getByTestId('rd-input-resting_hr')).toBeTruthy()
  })

  it('says the plan row has not been rewritten yet, and offers no button that would rewrite it', () => {
    const { container } = render(<W3ReadinessDecision decision={decision()} />)
    expect(screen.getByText('Dein Plan ist noch unverändert.')).toBeTruthy()
    // The card reports; it never calls /workouts/today/modify.
    expect(container.querySelectorAll('button').length).toBe(0)
  })

  it('says so instead when the plan row already carries the change', () => {
    render(
      <W3ReadinessDecision
        decision={decision({ applied: true, counterfactual_source: 'recorded' })}
      />,
    )
    expect(screen.getByText('Dein Plan von heute ist bereits angepasst.')).toBeTruthy()
    expect(screen.getByTestId('rd-counterfactual').textContent).toContain('So stand es im Plan.')
  })
})

describe('W3ReadinessDecision · the ordinary day', () => {
  it('prints no counterfactual line at all when nothing changed', () => {
    render(
      <W3ReadinessDecision
        decision={decision({
          changed: false,
          applied: false,
          counterfactual_source: null,
          verdict: {
            text_de: 'Sweetspot — 2×20 min.',
            state: 'quality',
            tss_target: 78,
            // The server still sends it; the card still suppresses it. Printing
            // "Ohne diese Werte: (the same session)" trains the rider to skip
            // the line on the day it finally says something different.
            counterfactual_text_de: 'Ohne diese Werte: Sweetspot — 2×20 min.',
          },
          session_planned: {
            title: 'Sweetspot 2×20',
            duration_minutes: 90,
            target_tss: 78,
          },
          driver: null,
          inputs: [rhr()],
        })}
      />,
    )
    expect(screen.getByTestId('rd-verdict').textContent).toBe('Sweetspot — 2×20 min.')
    expect(screen.queryByTestId('rd-counterfactual')).toBeNull()
    expect(screen.queryByText(/Ohne diese Werte/)).toBeNull()
    expect(screen.queryByText(/unverändert/)).toBeNull()
    expect(screen.queryByTestId('rd-driver')).toBeNull()
    // The score is still filed as evidence — only the counterfactual is gone.
    expect(screen.getByTestId('rd-score').textContent).toBe('43')
  })
})

describe('W3ReadinessDecision · the withheld day', () => {
  const stale = decision({
    gate: 'stale',
    data_age_days: 3,
    last_measured_on: '2026-09-04',
    withheld: true,
    withheld_reason_de: 'Deine Uhr hat seit 3 Tagen nichts übertragen.',
    verdict: null,
    session_planned: null,
    changed: false,
    counterfactual_source: null,
    applied: false,
    driver: null,
    inputs: [input({ age_days: 3, note_de: 'Gemessen vor 3 Tagen' })],
    // The server may still echo these; the card must not print them.
    readiness_score: 43,
    readiness_tier: 'Locker',
    can_modify: false,
  })

  it('shows no verdict and no score — a confident 43 beside a withheld verdict is the same lie in smaller type', () => {
    render(<W3ReadinessDecision decision={stale} />)
    expect(screen.queryByTestId('rd-verdict')).toBeNull()
    expect(screen.queryByTestId('rd-score')).toBeNull()
    expect(screen.queryByText('43')).toBeNull()
    expect(screen.queryByText('Locker')).toBeNull()
    expect(screen.queryByTestId('rd-driver')).toBeNull()
    expect(screen.queryByTestId('rd-counterfactual')).toBeNull()
  })

  it('says why, and dates the last reading', () => {
    render(<W3ReadinessDecision decision={stale} />)
    expect(screen.getByTestId('rd-withheld').textContent).toBe(
      'Deine Uhr hat seit 3 Tagen nichts übertragen.',
    )
    expect(screen.getByText('Letzte Messung: 4. September.')).toBeTruthy()
    // The inputs stay: the rider can see WHAT is stale.
    expect(screen.getByTestId('rd-input-hrv')).toBeTruthy()
  })
})

describe('W3ReadinessDecision · dating every number', () => {
  it('shows the age of any input older than today', () => {
    render(
      <W3ReadinessDecision
        decision={decision({
          inputs: [
            input({ age_days: 0 }),
            rhr({ age_days: 4, note_de: null }),
          ],
        })}
      />,
    )
    const old = screen.getByTestId('rd-input-resting_hr')
    expect(old.textContent).toContain('vor 4 Tagen')
    // Today's reading needs no dateline — a date on every row is noise that
    // makes the one stale row invisible.
    expect(screen.getByTestId('rd-input-hrv').textContent).not.toContain('vor ')
  })

  it('stamps the card itself with the age of the measurement it rests on', () => {
    render(<W3ReadinessDecision decision={decision({ data_age_days: 0 })} />)
    expect(screen.getByText('Gemessen heute')).toBeTruthy()
  })
})

describe('W3ReadinessDecision · no guessed baseline', () => {
  it('draws no deviation rail and says the baseline is still building', () => {
    render(
      <W3ReadinessDecision
        decision={decision({
          baseline_state: 'building',
          inputs: [
            input({
              baseline: null,
              baseline_n: 4,
              deviation: null,
              deviation_pct: null,
              z: null,
              band: null,
              severity: null,
              off: false,
              unfavourable: false,
              direction: 'unknown',
              text_de: '48 ms.',
              note_de: null,
            }),
          ],
        })}
      />,
    )
    expect(screen.getByTestId('rd-input-hrv').textContent).toContain(
      'Noch kein Basiswert — erst 4 Messungen.',
    )
    expect(screen.getByText('Deine Basiswerte bauen sich noch auf.')).toBeTruthy()
  })
})

describe('W3ReadinessDecision · nothing to say', () => {
  it('renders nothing at all before the decision has loaded', () => {
    const { container } = render(<W3ReadinessDecision decision={undefined} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('the pure helpers', () => {
  it('splits the counterfactual at the LEFTMOST colon, so an em dash cannot steal it', () => {
    expect(splitCounterfactual('Ohne diese Werte: Sweetspot — 2×20 min.')).toEqual({
      lead: 'Ohne diese Werte:',
      session: 'Sweetspot — 2×20 min.',
    })
    // No colon → printed whole and unstruck rather than guessed at.
    expect(splitCounterfactual('Sweetspot 2x20')).toBeNull()
    expect(splitCounterfactual(null)).toBeNull()
    expect(splitCounterfactual('Ohne diese Werte:')).toBeNull()
  })

  it('dates a reading only when it is not from today', () => {
    expect(ageNote(0)).toBeNull()
    expect(ageNote(null)).toBeNull()
    expect(ageNote(1)).toBe('Gemessen gestern')
    expect(ageNote(4)).toBe('Gemessen vor 4 Tagen')
    // The row pill says the same thing in two words, because on a stale
    // morning it is repeated on every row.
    expect(ageShort(0)).toBeNull()
    expect(ageShort(1)).toBe('gestern')
    expect(ageShort(3)).toBe('vor 3 Tagen')
  })

  it('formats values in German, at the precision the signal actually has', () => {
    expect(formatValue(48, 'ms')).toBe('48')
    expect(formatValue(7.4, 'h')).toBe('7,4')
    expect(formatValue(null, 'bpm')).toBe('—')
  })

  it('places the rail dot in band-widths, and refuses to place it without a baseline', () => {
    expect(railPosition(input({ z: 0, band: 1 }))).toBeCloseTo(0.5)
    expect(railPosition(input({ z: -1, band: 1 }))).toBeCloseTo(0.0)
    expect(railPosition(input({ z: 1, band: 1 }))).toBeCloseTo(1.0)
    // Clamped, so a z of −9 cannot draw outside the rail.
    expect(railPosition(input({ z: -9, band: 1 }))).toBeCloseTo(0.0)
    expect(railPosition(input({ baseline: null }))).toBeNull()
    expect(railPosition(input({ z: null }))).toBeNull()
    expect(railPosition(input({ band: 0 }))).toBeNull()
  })

  it('composes session meta from whichever fields the server actually sent', () => {
    expect(sessionMeta({ title: 'x', duration_minutes: 60, target_tss: 45 })).toBe('60 min · 45 TSS')
    expect(sessionMeta({ title: 'x', duration_minutes: 60 })).toBe('60 min')
    expect(sessionMeta({ title: 'x' })).toBeNull()
    expect(sessionMeta(null)).toBeNull()
  })
})

describe('the age is stated once, not twice', () => {
  it('strips the note that only repeats the pill, and keeps a real second clause', async () => {
    const { withoutAgePreamble } = await import('../W3ReadinessDecision')
    // A three-day-old watch printed "vor 3 Tagen" as a pill AND "Gemessen vor
    // 3 Tagen." underneath it, on every one of five rows.
    expect(withoutAgePreamble('Gemessen vor 3 Tagen.', 'vor 3 Tagen')).toBeNull()
    expect(withoutAgePreamble('Gemessen vor 3 Tagen. Zu alt für heute.', 'vor 3 Tagen'))
      .toBe('Zu alt für heute.')
    // With no pill there is nothing to deduplicate against.
    expect(withoutAgePreamble('Gemessen vor 3 Tagen.', null)).toBe('Gemessen vor 3 Tagen.')
    expect(withoutAgePreamble(null, 'vor 3 Tagen')).toBeNull()
  })
})
