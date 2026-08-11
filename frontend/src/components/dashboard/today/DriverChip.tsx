import type { LucideIcon } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import Sparkline from '../../ui/Sparkline'

export interface DriverChipProps {
  icon: LucideIcon
  label: string
  /** The reading itself. Null renders an em-dash and never animates. */
  value: number | null
  unit?: string
  delta?: string | null
  deltaColor?: string
  /** Trailing series, oldest first. Fewer than two points draws nothing. */
  trend?: number[]
  /** The day's own state colour, so the three chips read as one system. */
  tone: string
  index: number
}

/**
 * One driver of the readiness score — the number, and the shape behind it.
 *
 * These three chips used to be flat text: `112`, `47`, `80`, sitting directly
 * under a ring that ignites over 1.1 s. The mismatch was the sharpest thing on
 * the screen — the hero animates, the evidence for it does not.
 *
 * The fix is information, not decoration. `useDailyMetrics` already pulls
 * thirty days on every load and only the newest value was ever read, so the
 * shape behind each number costs one more field and no extra request — and
 * `112 ms` means nothing on its own, where "112, and climbing for four days"
 * is the whole reason the score moved.
 *
 * Deliberately NOT a count-up, though the still numbers under a ring that
 * ignites are what drew the eye here first. `useCountUp` carries an explicit
 * house rule — "used sparingly so it stays meaningful: hero numbers,
 * celebration surfaces, never ambient data" — and three chips of supporting
 * evidence are exactly the ambient data it rations itself against. The chips
 * get a staggered entrance instead, which reads as arrival without spending
 * the signature the ring depends on.
 */
export default function DriverChip({
  icon: Icon, label, value, unit, delta, deltaColor, trend, tone, index,
}: DriverChipProps) {
  const reduce = useReducedMotion()

  return (
    <motion.div
      className="flex flex-col gap-1.5 rounded-[16px] p-3"
      // Inline background, not a Tailwind bg-* class: DashboardShell's
      // delegated pointer capture treats any card without an inline surface
      // (or the glass marker) as scrub-start territory and eats its taps.
      style={{ background: '#14181DCC', border: '1px solid #FFFFFF14', backdropFilter: 'blur(10px)' }}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32, delay: 0.06 * index }}
    >
      <span className="inline-flex items-center gap-1.5">
        <Icon size={12} style={{ color: '#9BA4AF' }} />
        <span className="eyebrow" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', color: '#9BA4AF' }}>{label}</span>
      </span>

      <span className="flex items-baseline gap-1">
        <span className="num-display" style={{ fontSize: 20, fontWeight: 700, color: '#FFFFFF', lineHeight: 1 }}>
          {value != null ? Math.round(value) : '—'}
        </span>
        {unit && value != null && <span style={{ fontSize: 10, color: '#5C6570' }}>{unit}</span>}
      </span>

      <span className="flex items-end justify-between gap-1" style={{ minHeight: 18 }}>
        {delta
          ? <span style={{ fontSize: 10.5, fontWeight: 700, color: deltaColor ?? '#9BA4AF' }}>{delta}</span>
          : <span />}
        {trend && trend.length > 1 && (
          <Sparkline values={trend} color={tone} width={44} height={16} />
        )}
      </span>
    </motion.div>
  )
}
