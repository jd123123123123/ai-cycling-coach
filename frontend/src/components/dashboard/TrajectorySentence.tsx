/**
 * TrajectorySentence.tsx — Phase 7.05 "One-Screen Truth" honesty primitive.
 *
 * Single sentence: CTL trend over 14 days, gated through <UncertainValue>.
 * - confidence 'high' → language-aware copy ("Fitness climbing +8 over 14 days.")
 * - confidence 'low'  → muted skeleton + "Need N more days of training data."
 *                       or "Set your FTP to unlock the trend." when FTP absent.
 *
 * No icons. No motion library. Static is correct for the honesty layer.
 * Zero new dependencies.
 */

import UncertainValue from './UncertainValue'
import { confidence, MIN_DAYS_CTL_TREND } from '../../utils/confidence'
import { toneFromPct, tokenForTone } from '../../utils/delta'
import { formatSigned } from '../../utils/format'
import { usePMC } from '../../hooks/usePMC'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useLanguage } from '../../contexts/LanguageContext'

interface TrajectorySentenceProps {
  className?: string
}

/**
 * Returns direction word for the simple-language copy.
 * |Δ%| < 3 → "holding steady"; positive → "climbing"; negative → "drifting down"
 */
function directionWord(deltaPct: number): string {
  if (Math.abs(deltaPct) < 3) return 'holding steady'
  return deltaPct > 0 ? 'climbing' : 'drifting down'
}

export default function TrajectorySentence({ className }: TrajectorySentenceProps) {
  const { data: pmcData, isLoading } = usePMC(14)
  const { data: profile } = useAthleteProfile()
  const { language } = useLanguage()

  const hasFtp = !!profile?.ftp_watts

  // Extract a sorted, valid CTL series from the 14-day window
  const usableSeries = (pmcData?.entries ?? [])
    .filter((e) => typeof e.ctl === 'number' && isFinite(e.ctl))
    .sort((a, b) => a.date.localeCompare(b.date))

  const ctlConfidence = confidence({
    n_days: usableSeries.length,
    min_days: MIN_DAYS_CTL_TREND,
    preconditions: { has_ftp: hasFtp },
  })

  // Compute delta only when we have enough data
  const todayCTL = usableSeries.at(-1)?.ctl ?? null
  const firstCTL = usableSeries.at(0)?.ctl ?? null
  const deltaCTL =
    todayCTL != null && firstCTL != null
      ? Math.round(todayCTL - firstCTL)
      : null

  const deltaPct =
    deltaCTL != null && firstCTL != null && firstCTL !== 0
      ? (deltaCTL / firstCTL) * 100
      : null

  const tone = toneFromPct(deltaPct, 'good')
  const toneColor = tokenForTone(tone)

  // Language-aware sentence copy for the numeric portion
  const numericNode =
    deltaCTL != null && deltaPct != null ? (
      language === 'technical' ? (
        <span className="num-mono" style={{ color: toneColor }}>
          {/* U+2212 typographic minus on negative */}
          CTL {formatSigned(deltaCTL, 0)} over 14d.
        </span>
      ) : (
        <span>
          Fitness{' '}
          <span style={{ color: toneColor }}>
            {directionWord(deltaPct)} {deltaCTL !== 0 ? Math.abs(deltaCTL) : ''}
          </span>{' '}
          over 14 days.
        </span>
      )
    ) : null

  // Low-confidence copy branches
  const needDays = Math.max(1, MIN_DAYS_CTL_TREND - usableSeries.length)
  const lowCopy = !hasFtp
    ? 'Set your FTP to unlock the trend.'
    : `Need ${needDays} more day${needDays === 1 ? '' : 's'} of training data.`

  if (isLoading) {
    // Render the low-confidence state while data loads
    return (
      <p
        className={className}
        style={{
          fontSize: 14,
          lineHeight: '1.5',
          color: 'var(--color-ink-2)',
          maxWidth: '52ch',
          margin: 0,
        }}
      >
        <UncertainValue
          value={null}
          confidence="low"
          lowConfidenceCopy={lowCopy}
        />
      </p>
    )
  }

  return (
    <p
      className={className}
      style={{
        fontSize: 14,
        lineHeight: '1.5',
        color: 'var(--color-ink-2)',
        maxWidth: '52ch',
        margin: 0,
      }}
    >
      <UncertainValue
        value={numericNode}
        confidence={ctlConfidence}
        lowConfidenceCopy={lowCopy}
      />
    </p>
  )
}
