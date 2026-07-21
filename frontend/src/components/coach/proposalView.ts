/**
 * proposalView — pure display logic for the AI Coach Proposal Card.
 *
 * Kept separate from the JSX so it is unit-testable in this repo's
 * DOM-less vitest setup (same convention as planSessionMeta / BlockBars'
 * expandBlocks). ProposalCard consumes deriveProposalView for its copy +
 * gating, so a test on this module is a test on what the card renders.
 */
import type { PlanProposal } from '../../api/coach'

export interface ProposalView {
  /** Whether there is a concrete change to render (false → honest "nothing to change"). */
  applicable: boolean
  /** Eyebrow headline reflecting proposed vs applied state. */
  headline: string
  /** Locale-correct rationale prose. */
  rationale: string
  /** Accept/Tweak buttons visible only before the change is applied. */
  showActions: boolean
  /** TSS delta rounded (after - before), null when unknown. */
  tssDelta: number | null
  /** Human sign label: 'down' | 'up' | 'flat' | null. */
  tssDirection: 'down' | 'up' | 'flat' | null
  /** Week-scope: number of days whose session changed. */
  changedDayCount: number
}

export function deriveProposalView(
  proposal: PlanProposal,
  de: boolean,
  opts: { applied: boolean },
): ProposalView {
  const applicable = proposal.applicable
  const rationale = de ? proposal.rationale_de : proposal.rationale

  const headline = !applicable
    ? de ? 'KEINE ÄNDERUNG NÖTIG' : 'NOTHING TO CHANGE'
    : opts.applied
      ? de ? 'PLAN GEÄNDERT' : 'PLAN UPDATED'
      : de ? 'VORGESCHLAGENE ANPASSUNG' : 'PROPOSED ADJUSTMENT'

  const tssDelta = proposal.tss_delta != null ? Math.round(proposal.tss_delta) : null
  const tssDirection: ProposalView['tssDirection'] =
    tssDelta == null ? null : tssDelta <= -1 ? 'down' : tssDelta >= 1 ? 'up' : 'flat'

  const changedDayCount = proposal.day_diffs.filter((d) => d.changed).length

  return {
    applicable,
    headline,
    rationale,
    showActions: applicable && !opts.applied,
    tssDelta,
    tssDirection,
    changedDayCount,
  }
}
