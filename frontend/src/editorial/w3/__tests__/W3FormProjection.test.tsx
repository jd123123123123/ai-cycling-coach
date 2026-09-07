import { createElement, type ReactNode } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { W3FormProjectionView } from '../W3FormProjection'
import {
  formProjectionModelLine,
  formProjectionLoadLine,
  formProjectionUnavailableLine,
} from '../w3formProjectionCopy'
import type { FormProjection, ProjectedDay } from '../../../api/formProjection'

// The tag name is the proxy key, so `motion.path` stays a real <path> and the
// SVG structure the assertions below query is the structure that ships.
vi.mock('motion/react', () => ({
  useReducedMotion: () => true,
  motion: new Proxy({} as Record<string, unknown>, {
    get: (_t, key: string) =>
      ({ children, ...rest }: Record<string, unknown> & { children?: ReactNode }) => {
        const p: Record<string, unknown> = { ...rest }
        for (const k of ['initial', 'animate', 'exit', 'transition', 'whileInView', 'viewport']) delete p[k]
        return createElement(key, p, children)
      },
  }),
}))

afterEach(cleanup)

// ── fixtures ────────────────────────────────────────────────────────────────

/** 42 days climbing out of a build block: −8 today, +9 at the horizon, with a
 *  band that widens the way a forward projection's band has to. */
function days(n = 42): ProjectedDay[] {
  return Array.from({ length: n }, (_, i) => {
    const k = i + 1
    const form = -8 + (17 * k) / n
    const w = 1.5 + (k / n) * 9
    const d = new Date(Date.UTC(2026, 8, 8) + k * 86400000)
    return {
      date: d.toISOString().slice(0, 10),
      days_out: k,
      tss: 64,
      load_source: k <= 7 ? 'plan' : 'recent-average',
      fitness: 74, fatigue: 66,
      form: Math.round(form * 10) / 10,
      fitness_low: 70, fitness_high: 78,
      fatigue_low: 62, fatigue_high: 70,
      form_low: Math.round((form - w) * 10) / 10,
      form_high: Math.round((form + w) * 10) / 10,
    } satisfies ProjectedDay
  })
}

function payload(over: Partial<FormProjection> = {}): FormProjection {
  const proj = days()
  const last = proj[proj.length - 1]
  // Pin the horizon numbers the assertions read, so a tweak to the ramp above
  // cannot silently change what the tests are checking.
  last.form = 9
  last.form_low = -4
  last.form_high = 11
  return {
    available: true,
    reason: null,
    history_days: 240,
    history_days_required: 28,
    model: 'individual',
    model_reason: 'Fitted to your own load-versus-performance history.',
    fallback_reason: null,
    confidence_pct: 61,
    confidence_threshold_pct: 30,
    range_required: false,
    today: { date: '2026-09-08', fitness: 74, fatigue: 70, form: 4 },
    standard_today: { date: '2026-09-08', fitness: 71, fatigue: 69, form: 2 },
    constants: {
      tau1_days: 31.4, tau2_days: 5.4,
      standard_tau1_days: 42, standard_tau2_days: 7,
      k1: 0.9, k2: 1.4, p0: 280,
      r_squared: 0.72, standard_r_squared: 0.58,
      aicc: -18.4, standard_aicc: -11.2,
      selection_criterion: 'AICc (lower wins)',
      n_observations: 14, n_observations_required: 8,
    },
    performance_series: {
      source: 'activity_stream.mmp_curve[1200]', metric: 'best 20-minute mean-maximal power',
      unit: 'watts', gate: 'a day is admitted only when…', gate_watts: 288,
      window_best_watts: 320, n_candidate_days: 31, n_observations: 14, points: [],
    },
    load: {
      source: 'mixed', assumption: 'The plan covers the next 7 day(s)…',
      rolling_7d_tss: 64.2, planned_days: 7, horizon_days: 42,
      uncertainty: {
        sigma_tss_per_day: 22.4, source: 'plan_compliance', n: 18, band: '80%',
        covers: 'future load only — not uncertainty in the time constants',
      },
    },
    projection: proj,
    ...over,
  }
}

/** The real fallback shape: the server caps the standard path at 25 % against a
 *  30 % threshold on purpose, so `range_required` is true by construction. */
function standardPayload(over: Partial<FormProjection> = {}): FormProjection {
  const base = payload()
  return payload({
    model: 'standard',
    model_reason: 'Standard constants (fitness 42 d / fatigue 7 d).',
    fallback_reason: 'too_few_performance_observations',
    confidence_pct: 25,
    range_required: true,
    standard_today: base.today,
    constants: {
      ...base.constants!,
      tau1_days: 42, tau2_days: 7,
      k1: null, k2: null, p0: null,
      r_squared: null, standard_r_squared: 0.58,
      aicc: null, standard_aicc: -11.2,
      n_observations: 5, n_observations_required: 8,
    },
    ...over,
  })
}

const text = (c: HTMLElement) => c.textContent ?? ''

// ── 1. the individual path ──────────────────────────────────────────────────

describe('W3FormProjection · the individual model', () => {
  it('names the model as the rider’s own and renders the projected point', () => {
    const { container } = render(<W3FormProjectionView data={payload()} />)
    expect(text(container)).toContain('Dein Modell')
    expect(screen.getByTestId('fp-hero-point').textContent).toBe('+9')
    // Confident enough for a point → the line is drawn through the band.
    expect(screen.getByTestId('fp-line')).toBeTruthy()
    expect(screen.queryByTestId('fp-hero-range')).toBeNull()
  })

  it('puts the fitted constants on screen against the standard ones', () => {
    const { container } = render(<W3FormProjectionView data={payload()} />)
    expect(text(container)).toContain('31,4 / 5,4 Tage')
    expect(text(container)).toContain('Standard 42 / 7 Tage')
    // The evidence, not just the claim.
    expect(text(container)).toContain('R² 0,72 gegen 0,58')
  })

  it('shows the standard PMC’s same-day value as a ghost, so the gap is seen', () => {
    const { container } = render(<W3FormProjectionView data={payload()} />)
    expect(screen.getByTestId('fp-ghost')).toBeTruthy()
    expect(text(container)).toContain('Heute +4')
    expect(text(container)).toContain('Standard-PMC +2')
  })

  it('states that the band covers future load only, never τ', () => {
    const { container } = render(<W3FormProjectionView data={payload()} />)
    expect(text(container)).toContain('nur die künftige Belastung')
    expect(text(container)).toContain('nicht die Unsicherheit der Zeitkonstanten')
  })

  it('never renders the server’s English prose', () => {
    const { container } = render(<W3FormProjectionView data={payload()} />)
    expect(text(container)).not.toContain('Fitted to your own')
    expect(text(container)).not.toContain('The plan covers the next')
    expect(text(container)).not.toContain('future load only')
  })
})

// ── 2. the standard fallback, naming its gate ───────────────────────────────

describe('W3FormProjection · the standard fallback', () => {
  it('says it is the standard model and never claims it is individual', () => {
    const { container } = render(<W3FormProjectionView data={standardPayload()} />)
    expect(text(container)).toContain('Standard 42 / 7')
    expect(text(container)).not.toContain('Dein Modell')
    expect(text(container)).toContain('Bevölkerungsmittel')
  })

  it('names the gate that stopped the individual fit, in counts', () => {
    const { container } = render(<W3FormProjectionView data={standardPayload()} />)
    expect(text(container)).toContain('Für ein eigenes Modell fehlen dir noch 3 harte Einheiten')
    expect(text(container)).toContain('5 von 8')
  })

  it('draws no ghost, because on this path there are not two models', () => {
    render(<W3FormProjectionView data={standardPayload()} />)
    expect(screen.queryByTestId('fp-ghost')).toBeNull()
  })

  it('is a range by construction — 25 % confidence against a 30 % threshold', () => {
    render(<W3FormProjectionView data={standardPayload()} />)
    expect(screen.queryByTestId('fp-hero-point')).toBeNull()
    expect(screen.getByTestId('fp-hero-range')).toBeTruthy()
  })

  it('composes a sentence for every gate the server can report', () => {
    const gate = (reason: string) =>
      formProjectionModelLine(standardPayload({ fallback_reason: reason }))
    expect(gate('fit_not_identifiable')).toContain('zu flach')
    expect(gate('standard_constants_fit_better')).toContain('AICc')
    expect(gate('fit_not_scorable')).toContain('nicht berechenbar')
    expect(gate('standard_model_not_scorable')).toContain('nicht berechenbar')
    // An unknown code from a newer server still produces an honest sentence.
    expect(gate('something_new')).toContain('reichen deine Daten noch nicht')
    for (const r of ['fit_not_identifiable', 'standard_constants_fit_better', 'something_new']) {
      expect(gate(r)).not.toContain('leider')
    }
  })
})

// ── 3. range_required suppresses the point. The rule, pinned. ───────────────

describe('W3FormProjection · range_required', () => {
  const lowConfidence = payload({ confidence_pct: 22, range_required: true })

  it('renders the band’s edges instead of the projected value', () => {
    render(<W3FormProjectionView data={lowConfidence} />)
    const range = screen.getByTestId('fp-hero-range')
    expect(range.textContent).toContain('−4')
    expect(range.textContent).toContain('+11')
    expect(screen.queryByTestId('fp-hero-point')).toBeNull()
  })

  it('does not leak the point value anywhere on the card', () => {
    // THE REGRESSION THIS FILE EXISTS FOR. The rule is not "label it as
    // uncertain", it is "do not render the number".
    const { container } = render(<W3FormProjectionView data={lowConfidence} />)
    expect(text(container)).not.toContain('+9')
  })

  it('drops the line and keeps only the band — a stroke IS a point estimate', () => {
    render(<W3FormProjectionView data={lowConfidence} />)
    expect(screen.queryByTestId('fp-line')).toBeNull()
    expect(screen.getByTestId('fp-band')).toBeTruthy()
  })

  it('says why it is a span, in the server’s own numbers', () => {
    const { container } = render(<W3FormProjectionView data={lowConfidence} />)
    expect(text(container)).toContain('22 % Konfidenz')
    expect(text(container)).toContain('Schwelle 30 %')
  })

  it('treats an unresolved range_required as a range, not as a point', () => {
    // The safe direction is more uncertainty on screen, never less.
    render(<W3FormProjectionView data={payload({ range_required: null })} />)
    expect(screen.queryByTestId('fp-hero-point')).toBeNull()
    expect(screen.getByTestId('fp-hero-range')).toBeTruthy()
  })

  it('still shows today, which is measured and therefore not a projection', () => {
    const { container } = render(<W3FormProjectionView data={lowConfidence} />)
    expect(text(container)).toContain('Heute +4')
    expect(text(container)).toContain('Standard-PMC +2')
  })
})

// ── 4. available: false ─────────────────────────────────────────────────────

describe('W3FormProjection · no projection to make', () => {
  const none = (over: Partial<FormProjection>): FormProjection => ({
    available: false, reason: null, history_days: null, history_days_required: null,
    model: null, model_reason: null, fallback_reason: null,
    confidence_pct: null, confidence_threshold_pct: null, range_required: null,
    today: null, standard_today: null, constants: null, performance_series: null,
    load: null, projection: [], ...over,
  })

  it('says how many days are missing rather than showing a placeholder', () => {
    const { container } = render(<W3FormProjectionView data={none({
      reason: 'insufficient_history', history_days: 12, history_days_required: 28,
    })} />)
    expect(text(container)).toContain('12 von 28 Tagen Historie')
    expect(screen.queryByTestId('fp-hero-point')).toBeNull()
    expect(screen.queryByTestId('fp-band')).toBeNull()
  })

  it('is a rendered card that says so in words, not a skeleton', () => {
    const { container } = render(<W3FormProjectionView data={none({ reason: 'no_history' })} />)
    expect(text(container)).toContain('Noch keine Projektion.')
    expect(text(container)).toContain('Noch keine aufgezeichnete Fahrt')
    // A hero-sized em dash renders as a grey bar and reads as "still loading".
    expect(text(container)).not.toContain('—')
  })

  it('falls back to a plain line for a reason it does not know', () => {
    expect(formProjectionUnavailableLine(none({ reason: 'something_else' })))
      .toBe('Für eine Projektion fehlen noch Daten.')
  })
})

// ── the load assumption ─────────────────────────────────────────────────────

describe('formProjectionLoadLine', () => {
  it('says plainly that nobody planned the uncovered days', () => {
    const mixed = formProjectionLoadLine(payload())
    expect(mixed).toContain('Plan bis Tag 7')
    expect(mixed).toContain('64,2 TSS/Tag')
    expect(mixed).toContain('geplant hat das niemand')
  })

  it('does not claim a plan when no plan covers the horizon', () => {
    const p = payload()
    const line = formProjectionLoadLine(payload({
      load: { ...p.load!, source: 'recent-average', planned_days: 0 },
    }))
    expect(line).toContain('Kein Plan deckt diese 42 Tage')
    expect(line).toContain('geplant hat das niemand')
  })

  it('claims the plan only when the plan really covers every day', () => {
    const p = payload()
    const line = formProjectionLoadLine(payload({
      load: { ...p.load!, source: 'plan', planned_days: 42 },
    }))
    expect(line).toBe('Die Kurve rechnet über alle 42 Tage mit deinem Plan.')
    expect(line).not.toContain('niemand')
  })
})
