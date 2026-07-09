import { useAdaptive } from './useAdaptive'
import type { DirectiveKind } from '../api/adaptive'

// useAdaptiveGate — the coach-safety interlock (spec §4).
//
// The adaptive engine (HRV ±0.5 SD band, ACWR guardrail) outranks the
// competition. This hook collapses the five-way adaptive directive into the
// three modes every competitive nudge on the Social page is wrapped in:
//
//   rest → suppress every "catch the leader" nudge, freeze the streak for
//          free, reframe rest as the winning move (deload / rest directives)
//   ease → soften; hold position, no push to overreach (hold directive)
//   go   → full competitive copy (push / escalate directives)
//
// This is the app's ethical signature: competition can never outrank the
// athlete's physiology.

export type GateMode = 'go' | 'ease' | 'rest'

export interface AdaptiveGate {
  mode: GateMode
  reason: string
  directive: DirectiveKind | null
  hrvState: 'below' | 'in' | 'above' | 'unknown'
  isLoading: boolean
}

function modeFor(directive: DirectiveKind): GateMode {
  switch (directive) {
    case 'rest':
    case 'deload':
      return 'rest'
    case 'hold':
      return 'ease'
    case 'push':
    case 'escalate':
      return 'go'
    default:
      return 'go'
  }
}

export function useAdaptiveGate(): AdaptiveGate {
  const { data, isLoading } = useAdaptive()

  // Absent data → 'go' (never block competition on a missing signal; the
  // banner only appears when the coach actively prescribes recovery).
  if (!data) {
    return { mode: 'go', reason: '', directive: null, hrvState: 'unknown', isLoading }
  }

  return {
    mode: modeFor(data.directive),
    reason: data.headline ?? '',
    directive: data.directive,
    hrvState: data.hrv_state,
    isLoading,
  }
}
