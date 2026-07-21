import { describe, expect, it } from 'vitest'
import { deriveProposalView } from '../proposalView'
import type { PlanProposal, ProposalSession } from '../../../api/coach'

function session(over: Partial<ProposalSession> = {}): ProposalSession {
  return {
    date: '2026-07-21',
    template_id: 'sweet_spot_2x20',
    title: 'Sweet Spot 2x20',
    label: 'Sweet Spot 2x20 · 90 min',
    duration_min: 90,
    predicted_tss: 85,
    intensity_factor: 0.85,
    indoor: false,
    blocks: [],
    ...over,
  }
}

function dayProposal(over: Partial<PlanProposal> = {}): PlanProposal {
  return {
    scope: 'day',
    applicable: true,
    modification_type: 'easier',
    target_date: '2026-07-21',
    reason: 'substituted down one step',
    rails_downgraded: false,
    before: session(),
    after: session({ template_id: 'tempo_3x10', label: 'Tempo 3x10 · 70 min', predicted_tss: 70, intensity_factor: 0.78 }),
    day_diffs: [],
    week_before_tss: 410,
    week_after_tss: 395,
    tss_delta: -15,
    duration_delta_min: -20,
    intensity_delta_pct: -8.2,
    rationale: 'Trims intensity ~8% — fresher legs without losing fitness.',
    rationale_de: 'Senkt die Intensität um ~8% — frische Beine ohne Formverlust.',
    ...over,
  }
}

describe('deriveProposalView', () => {
  it('renders a proposed adjustment with actions and a load-down direction', () => {
    const v = deriveProposalView(dayProposal(), false, { applied: false })
    expect(v.applicable).toBe(true)
    expect(v.headline).toBe('PROPOSED ADJUSTMENT')
    expect(v.showActions).toBe(true)
    expect(v.tssDelta).toBe(-15)
    expect(v.tssDirection).toBe('down')
  })

  it('uses the German rationale and headline under de locale', () => {
    const v = deriveProposalView(dayProposal(), true, { applied: false })
    expect(v.headline).toBe('VORGESCHLAGENE ANPASSUNG')
    expect(v.rationale).toContain('frische Beine')
  })

  it('after Accept flips to the applied headline and hides the actions', () => {
    const v = deriveProposalView(dayProposal(), false, { applied: true })
    expect(v.headline).toBe('PLAN UPDATED')
    expect(v.showActions).toBe(false)
  })

  it('non-applicable proposals never show actions', () => {
    const v = deriveProposalView(
      dayProposal({ applicable: false, before: null, after: null }),
      false,
      { applied: false },
    )
    expect(v.applicable).toBe(false)
    expect(v.headline).toBe('NOTHING TO CHANGE')
    expect(v.showActions).toBe(false)
  })

  it('counts changed days for a week-scope proposal', () => {
    const week = dayProposal({
      scope: 'week',
      before: null,
      after: null,
      tss_delta: -60,
      day_diffs: [
        { date: '2026-07-20', weekday: 'Mo', before_label: 'SS', after_label: 'Tempo', before_tss: 85, after_tss: 70, changed: true },
        { date: '2026-07-22', weekday: 'Mi', before_label: 'Z2', after_label: 'Z2', before_tss: 45, after_tss: 45, changed: false },
        { date: '2026-07-24', weekday: 'Fr', before_label: 'VO2', after_label: 'Threshold', before_tss: 72, after_tss: 78, changed: true },
      ],
    })
    const v = deriveProposalView(week, false, { applied: false })
    expect(v.changedDayCount).toBe(2)
    expect(v.tssDirection).toBe('down')
  })
})
