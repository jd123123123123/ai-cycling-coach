/**
 * LanguageToggle — segmented control in the masthead that flips coach output
 * between 'simple' (plain English, default) and 'technical' (full vocabulary).
 *
 * Behavior:
 *   - Writes to `localStorage['coach.language']` via the LanguageContext.
 *   - On every change, invalidates the coach-related React Query keys so the
 *     dashboard refetches in the new language immediately:
 *       * ['coach', 'brief', lang]
 *       * ['coach', 'why']
 *       * ['coach', 'transparency']
 *     The brief key includes language so changing the toggle actually
 *     generates a new key that has no cached data — React Query will fetch
 *     automatically. We still broadcast a `removeQueries` on the old key so
 *     we don't leak stale data forever if the user flips back and forth.
 *
 * Design notes:
 *   - 24px tall, "Paper" palette, sits next to the "Ask coach" button in the
 *     DashboardShell masthead.
 *   - aria-pressed on each button so screen readers announce the active mode.
 *   - Two-option segmented control — if we ever add a third language, this
 *     component should be generalised, but for now hardcoding the pair keeps
 *     the component single-purpose and readable.
 */
import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLanguage, type CoachLanguage } from '../../contexts/LanguageContext'

const OPTIONS: Array<{ value: CoachLanguage; label: string; hint: string }> = [
  { value: 'simple',    label: 'Simple',    hint: 'Plain-English coach output' },
  { value: 'technical', label: 'Technical', hint: 'Full vocabulary with inline explanations' },
]

export default function LanguageToggle() {
  const { language, setLanguage } = useLanguage()
  const qc = useQueryClient()

  const handleChange = useCallback(
    (next: CoachLanguage) => {
      if (next === language) return
      setLanguage(next)

      // Brief is keyed on language — removing the old-language cache keeps
      // memory tidy without blocking the refetch (the new key has no data,
      // so the useCoachBrief hook will fire automatically on next render).
      qc.removeQueries({ queryKey: ['coach', 'brief', language] })

      // Why-tired and transparency are not language-keyed server-side, but
      // the frontend phrase map flips their presentation — a refetch here
      // is still cheap and keeps the copy consistent with the active mode.
      qc.invalidateQueries({ queryKey: ['coach', 'why'] })
      qc.invalidateQueries({ queryKey: ['coach', 'transparency'] })
    },
    [language, qc, setLanguage],
  )

  return (
    <div
      role="radiogroup"
      aria-label="Coach language mode"
      className="inline-flex items-stretch rounded-full p-0.5 h-[28px]"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === language
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.hint}
            title={opt.hint}
            onClick={() => handleChange(opt.value)}
            className="inline-flex items-center justify-center px-3 rounded-full text-[11px] font-medium transition-colors"
            style={{
              color: active ? 'var(--color-paper)' : 'var(--color-ink-2)',
              backgroundColor: active ? 'var(--color-ink)' : 'transparent',
              border: active ? '1px solid var(--color-ink)' : '1px solid transparent',
              letterSpacing: '0.04em',
              minWidth: 68,
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
