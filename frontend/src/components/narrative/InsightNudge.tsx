/**
 * InsightNudge — one honest early-signal card, shared by every chapter.
 *
 * Extracted from MorningHealthCard, which built this shell for exactly one
 * direction (illness). The shell itself was never health-specific — it is
 * "a cluster of named deviations from your own baseline, with a verdict" —
 * so this generalizes it to also carry `polarity: 'opportunity'` for a
 * genuine, earned recovery upswing, using the app's existing recovery-green
 * token rather than inventing a new color scale.
 *
 * Self-hiding is the CALLER's job, not this component's: a chapter only
 * mounts this when its own detector's `level !== 'none'`. This component
 * always renders something — it has no honest-empty branch of its own,
 * because "nothing to show" is a decision made before this component exists,
 * not inside it.
 */
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, Activity, Thermometer, TrendingUp, Sparkles } from 'lucide-react'
import { GLASS_CARD_MARKER, GLASS_PAPER_2, GLASS_BLUR } from '../dashboard/glassCard'

export type InsightPolarity = 'warning' | 'opportunity'
export type InsightLevel = 'watch' | 'elevated' | 'high'

export interface InsightNudgeSignal {
  metric: string
  value: number
  baseline: number | null
  direction: 'up' | 'down'
  delta: number | null
  unit: string
  severity: 'mild' | 'strong'
}

export interface InsightNudgeProps {
  polarity: InsightPolarity
  level: InsightLevel
  eyebrow: string
  headline: string
  recommendation: string
  signals: InsightNudgeSignal[]
  metricLabel: (metric: string) => string
}

function levelStyle(polarity: InsightPolarity, level: InsightLevel): { color: string; Icon: LucideIcon } {
  if (polarity === 'opportunity') {
    switch (level) {
      case 'high': return { color: 'var(--color-recovery)', Icon: Sparkles }
      case 'elevated': return { color: 'var(--color-recovery)', Icon: TrendingUp }
      default: return { color: 'color-mix(in srgb, var(--color-recovery) 65%, var(--color-ink-2))', Icon: Activity }
    }
  }
  switch (level) {
    case 'high': return { color: 'var(--color-move)', Icon: Thermometer }
    case 'elevated': return { color: 'var(--color-amber)', Icon: AlertTriangle }
    default: return { color: 'var(--color-stand)', Icon: Activity }
  }
}

function deltaText(sig: InsightNudgeSignal): string {
  if (sig.delta == null) return `${sig.value}${sig.unit}`
  const sign = sig.delta > 0 ? '+' : sig.delta < 0 ? '−' : ''
  const mag = Math.abs(sig.delta)
  const sep = sig.unit === '%' || sig.unit === '' ? '' : ' '
  return `${sign}${mag}${sep}${sig.unit}`.trim()
}

export default function InsightNudge({
  polarity, level, eyebrow, headline, recommendation, signals, metricLabel,
}: InsightNudgeProps) {
  const { color, Icon } = levelStyle(polarity, level)

  return (
    <div
      className="relative overflow-hidden rounded-[24px] p-5 flex flex-col gap-4"
      style={{
        background: `linear-gradient(150deg, color-mix(in srgb, ${color} 16%, ${GLASS_PAPER_2}) 0%, ${GLASS_PAPER_2} 66%)`,
        border: `1px solid color-mix(in srgb, ${color} 45%, var(--color-rule))`,
        boxShadow: `0 12px 34px -18px color-mix(in srgb, ${color} 70%, transparent)`,
        ...GLASS_BLUR,
      }}
      role={polarity === 'warning' ? 'alert' : 'status'}
      {...GLASS_CARD_MARKER}
    >
      <div className="flex items-start gap-3.5">
        <div
          className="shrink-0 grid place-items-center rounded-full"
          style={{ width: 44, height: 44, background: `color-mix(in srgb, ${color} 22%, transparent)` }}
        >
          <Icon size={22} strokeWidth={2} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="eyebrow" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color }}>
            {eyebrow.toUpperCase()}
          </div>
          <div className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)', lineHeight: 1.15 }}>
            {headline}
          </div>
        </div>
      </div>

      {signals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {signals.map((sig) => (
            <div
              key={sig.metric}
              className="flex items-center gap-2 rounded-full px-3 py-1.5"
              style={{
                background: 'var(--color-surface-2)',
                border: `1px solid color-mix(in srgb, ${color} ${sig.severity === 'strong' ? 55 : 30}%, var(--color-rule))`,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}>
                {metricLabel(sig.metric)}
              </span>
              <span className="num-display" style={{ fontSize: 13, color }}>
                {deltaText(sig)}
              </span>
              {sig.baseline != null && (
                <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>vs {sig.baseline}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--color-ink)', margin: 0 }}>
        {recommendation}
      </p>
    </div>
  )
}
