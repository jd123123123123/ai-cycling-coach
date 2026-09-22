import type { CSSProperties, ReactNode } from 'react'
import { ArrowUpRight, Sparkles } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { T, FONT, EASE } from './w3tokens'
import { TNUM } from './w3surfaces'

export interface W3ReturnInsightMetric {
  label: string
  value: string
  tone?: 'accent' | 'positive' | 'quiet'
}

export interface W3ReturnInsightProps {
  eyebrow: string
  title: ReactNode
  detail?: ReactNode
  metrics?: W3ReturnInsightMetric[]
  actionLabel?: string
  onAction?: () => void
  accent?: string
}

/**
 * The small proof surface that appears after a meaningful change.
 *
 * It is intentionally a single sentence plus up to three proof points. The
 * app used to make every screen start with a paragraph and end with a button;
 * this is the opposite rhythm: state first, evidence second, action last.
 * Callers must pass resolved values, so it never creates an optimistic
 * progress story while a query is still loading.
 */
export default function W3ReturnInsight({
  eyebrow,
  title,
  detail,
  metrics = [],
  actionLabel,
  onAction,
  accent = T.acid,
}: W3ReturnInsightProps) {
  const reduce = useReducedMotion()
  const visibleMetrics = metrics.filter((metric) => metric.value.trim().length > 0).slice(0, 3)
  const content = (
    <>
      <div className="w3-return-insight-heading">
        <span className="w3-return-insight-kicker"><Sparkles size={12} />{eyebrow}</span>
        <span className="w3-return-insight-signal" style={{ background: accent, boxShadow: `0 0 14px ${accent}88` }} aria-hidden />
      </div>
      <strong className="w3-return-insight-title">{title}</strong>
      {detail && <span className="w3-return-insight-detail">{detail}</span>}
      {visibleMetrics.length > 0 && (
        <div className="w3-return-insight-metrics" aria-label="Belege">
          {visibleMetrics.map((metric) => (
            <span key={metric.label} className={`w3-return-insight-metric is-${metric.tone ?? 'quiet'}`}>
              <b style={{ color: metric.tone === 'accent' ? accent : undefined, ...TNUM }}>{metric.value}</b>
              <small>{metric.label}</small>
            </span>
          ))}
        </div>
      )}
      {actionLabel && onAction && (
        <span className="w3-return-insight-action" style={{ color: accent }}>
          {actionLabel}<ArrowUpRight size={15} />
        </span>
      )}
    </>
  )
  const style = { '--insight-accent': accent, fontFamily: FONT } as CSSProperties
  if (actionLabel && onAction) {
    return (
      <motion.button
        type="button"
        className="w3-return-insight"
        style={style}
        onClick={onAction}
        whileTap={reduce ? undefined : { scale: 0.985 }}
        transition={{ duration: reduce ? 0 : 0.16, ease: EASE }}
      >{content}</motion.button>
    )
  }
  return <article className="w3-return-insight" style={style}>{content}</article>
}
