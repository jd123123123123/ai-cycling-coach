/**
 * UncertainValue.tsx — shared honesty primitive for Phase 7.05 "one screen of truth."
 *
 * This is the ONLY new component this phase introduces beyond TrajectorySentence (Plan 02).
 *
 * Consumers in Plans 02/03/04:
 *   - ReadinessHero    → HRV requires ≥7d (MIN_DAYS_HRV)
 *   - TrajectorySentence → CTL trend requires ≥14d (MIN_DAYS_CTL_TREND)
 *   - PolarizedDistribution → polarized disclosure requires ≥7d (MIN_DAYS_POLARIZED)
 *
 * Contract:
 *   - confidence === 'high'  → render value + optional unitLabel
 *   - confidence === 'low'   → render muted skeleton + optional lowConfidenceCopy
 *   - Honors prefers-reduced-motion: no shimmer animation when reduced
 *
 * DO NOT pass already-formatted strings as `value`; let the caller format and
 * hand off the JSX. UncertainValue's responsibility is the gating, not the formatting.
 *
 * Zero new dependencies — only React + existing CSS tokens (--color-rule, --color-muted,
 * .num-mono, .shimmer-bg already in index.css).
 */

import { useState } from 'react'
import type { ConfidenceLevel } from '../../utils/confidence'

interface UncertainValueProps {
  /** The actual computed value (rendered as-is when confidence === 'high'). */
  value: React.ReactNode
  /** 'high' shows value; 'low' shows muted skeleton + lowConfidenceCopy. */
  confidence: ConfidenceLevel
  /** Unit label rendered next to the value (muted, small-caps). */
  unitLabel?: string
  /** Copy shown ONLY in 'low' state. Example: "Need 5 more days of HRV." */
  lowConfidenceCopy?: string
  /** Optional className passthrough so consumers can size/place. */
  className?: string
}

export default function UncertainValue({
  value,
  confidence,
  unitLabel,
  lowConfidenceCopy,
  className,
}: UncertainValueProps) {
  // Detect prefers-reduced-motion on first render (NOT useEffect — first paint must be correct).
  const [reducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  if (confidence === 'high') {
    return (
      <span className={className} style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.25em' }}>
        <span className="num-mono">{value}</span>
        {unitLabel && (
          <span
            style={{
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              color: 'var(--color-muted)',
            }}
          >
            {unitLabel}
          </span>
        )}
      </span>
    )
  }

  // confidence === 'low' — muted skeleton + optional low-confidence copy
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}
    >
      <span
        className={reducedMotion ? undefined : 'shimmer-bg'}
        style={{
          display: 'inline-block',
          width: '3em',
          height: '1em',
          background: reducedMotion
            ? 'color-mix(in srgb, var(--color-rule) 60%, transparent)'
            : undefined,
          borderRadius: '4px',
        }}
        aria-hidden
      />
      {lowConfidenceCopy && (
        <span
          style={{
            fontSize: '11px',
            color: 'var(--color-muted)',
            fontStyle: 'italic',
          }}
        >
          {lowConfidenceCopy}
        </span>
      )}
    </span>
  )
}
