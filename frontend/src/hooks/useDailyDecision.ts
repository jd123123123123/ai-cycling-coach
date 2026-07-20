/**
 * useDailyDecision — the ONE answer to "what should I do today?" (audit P0-3).
 *
 * The backend computes DailyDecision FRESH on every /coach/brief request and
 * attaches it as `daily_decision`, so this hook derives from useCoachBrief's
 * cache instead of issuing a second fetch — Today, Coach, and every other
 * surface that reads it are guaranteed to see the SAME decision object the
 * brief response carried. Surfaces render it subordinately: they may add
 * flavor, but must never contradict `decision.state`.
 */
import { useCoachBrief, COACH_BRIEF_KEY_ROOT } from './useCoachBrief'
import type { DailyDecision, DailyDecisionState } from '../api/coach'

// The decision rides on the brief query — same cache root, zero extra fetches.
export const DAILY_DECISION_KEY_ROOT = COACH_BRIEF_KEY_ROOT

/** States where a training session is still on the menu today. Everything
 * else (sick / injured / break / trained_already / planned_rest) means the
 * workout surfaces — prescription card, outdoor-window nudge — stay quiet. */
export const ACTIVE_DECISION_STATES: readonly DailyDecisionState[] = [
  'recover',
  'easy',
  'quality',
  'hard',
] as const

export function isActiveDecisionState(
  state: DailyDecisionState | null | undefined,
): boolean {
  return state != null && (ACTIVE_DECISION_STATES as readonly string[]).includes(state)
}

/** Self-reported sick / injured / break — outranks every training signal. */
export function isSidelinedDecisionState(
  state: DailyDecisionState | null | undefined,
): boolean {
  return state === 'sick' || state === 'injured' || state === 'break'
}

export function useDailyDecision(): {
  decision: DailyDecision | null
  isLoading: boolean
  isFetching: boolean
} {
  const briefQuery = useCoachBrief()
  return {
    decision: briefQuery.data?.daily_decision ?? null,
    isLoading: briefQuery.isLoading,
    isFetching: briefQuery.isFetching,
  }
}
