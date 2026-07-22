/**
 * coachAnswer — pure display helpers for CoachAnswerCard (the `present_answer`
 * structured coach answer).
 *
 * Kept as a dependency-free module so it can be unit-tested under the repo's
 * node-env vitest runner (no jsdom). The React component consumes these.
 */
import type { AnswerFact, FactTone } from '../hooks/useChatStream'

export const MAX_FACTS = 4

/** Tone → CSS colour var. Shared vocabulary with AnalyticalAnswerCard. */
export function toneColor(tone: string | undefined): string {
  switch (tone) {
    case 'good':
      return 'var(--color-forest-2)'
    case 'caution':
      return 'var(--color-amber)'
    default:
      return 'var(--color-ink-2)'
  }
}

/** Chip fill/border/text style per tone — good/caution get a low-alpha tint. */
export function toneChipStyle(tone: string | undefined): {
  color: string
  backgroundColor: string
  border: string
} {
  switch (tone) {
    case 'good':
      return {
        color: toneColor(tone),
        backgroundColor: 'rgba(22, 224, 138, 0.10)',
        border: '1px solid rgba(22, 224, 138, 0.28)',
      }
    case 'caution':
      return {
        color: toneColor(tone),
        backgroundColor: 'rgba(255, 176, 32, 0.10)',
        border: '1px solid rgba(255, 176, 32, 0.30)',
      }
    default:
      return {
        color: 'var(--color-ink)',
        backgroundColor: 'var(--color-surface-2)',
        border: '1px solid var(--color-rule)',
      }
  }
}

/** Render a chip value (string or number) as display text; honest '—' fallback. */
export function formatFactValue(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '—'
  return String(value)
}

/**
 * Defensive client-side normalization — the backend already caps at 4 and
 * coerces, but the card must never trust the wire blindly. Slices to MAX_FACTS
 * and drops chips missing a label or value.
 */
export function normalizeFacts(facts: AnswerFact[] | undefined): AnswerFact[] {
  if (!Array.isArray(facts)) return []
  return facts
    .filter(
      (f) =>
        f != null &&
        typeof f.label === 'string' &&
        f.label.trim().length > 0 &&
        f.value !== undefined &&
        f.value !== null,
    )
    .slice(0, MAX_FACTS)
    .map((f) => ({
      label: f.label,
      value: f.value,
      unit: f.unit,
      tone: (['good', 'caution', 'neutral'].includes(f.tone as string)
        ? f.tone
        : 'neutral') as FactTone,
    }))
}
