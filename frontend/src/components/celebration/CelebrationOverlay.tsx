/**
 * CelebrationOverlay — the full-screen "you earned it" moment.
 *
 * Rebuilt from pencil-new.pen frame XZef4 ("Celebration · New Record"): a dark
 * ray-lit backdrop, a glowing rainbow-ringed badge disc, a rarity tag, a big
 * count-up value, and share / dismiss actions. The pen's WebGL burst shader is
 * recreated CSP-safe with layered CSS gradients (no external asset).
 *
 * Motion is spring-in via `motion`; under prefers-reduced-motion everything
 * renders instantly and the value shows its final number (no count-up, no
 * confetti — see fireConfetti). pointer-events gated so only the scrim + close
 * are interactive; the confetti canvas floats above, pointer-events:none.
 */
import { useEffect, useRef, useState, type ComponentType } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { X, Share2, ChevronRight, type LucideProps } from 'lucide-react'

export type CelebrationKind = 'pb' | 'streak' | 'weekly' | 'ftp' | 'generic'

export interface CelebrationPayload {
  kind: CelebrationKind
  /** Small caps eyebrow, e.g. "NEUER REKORD". */
  kicker: string
  /** Hero value. Numbers count up; strings render as-is. */
  value?: string | number
  /** Unit shown beside the value, e.g. "W" or "Tage". */
  unit?: string
  /** One-line supporting sentence. */
  detail?: string
  /** Optional rarity/context chip, e.g. "TOP 4% · EPIC". */
  rarity?: string
  /** Accent token hex; drives glow + rays. */
  accent?: string
  /** Lucide icon in the badge center. */
  icon: ComponentType<LucideProps>
  /** Primary action (share). When set, a white share pill appears. */
  onShare?: () => void
  shareLabel?: string
  /** Dismiss label for the secondary pill. */
  dismissLabel?: string
}

/** Position of this card within a multi-card celebration run (drives "2/3"). */
export interface CelebrationProgress {
  index: number
  total: number
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

function useCountUp(target: number, enabled: boolean, durationMs = 950): number {
  // Start at 0 and animate up via rAF (async setState — no synchronous
  // setState-in-effect). When disabled (reduced motion), the final value is
  // returned directly, so the number appears instantly with no animation.
  const [v, setV] = useState(() => (enabled ? 0 : target))
  const rafRef = useRef(0)
  useEffect(() => {
    if (!enabled) return
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      setV(Math.round(easeOutCubic(t) * target))
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, enabled, durationMs])
  return enabled ? v : target
}

const RAINBOW =
  'conic-gradient(from 0deg, #8B5CF6, #2E6BFF, #16E08A, #FFD166, #FF5A3C, #8B5CF6)'

export default function CelebrationOverlay({
  payload,
  progress,
  onClose,
}: {
  payload: CelebrationPayload
  progress?: CelebrationProgress
  onClose: () => void
}) {
  const reduce = useReducedMotion()
  const accent = payload.accent ?? '#FF5A3C'
  const Icon = payload.icon

  const numericValue = typeof payload.value === 'number' ? payload.value : null
  const counted = useCountUp(numericValue ?? 0, !reduce && numericValue != null)
  const shownValue = numericValue != null ? counted : payload.value

  const spring = reduce
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 260, damping: 20 }

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={payload.kicker}
      className="fixed inset-0 flex flex-col"
      style={{
        zIndex: 2147482000,
        background: `
          radial-gradient(120% 80% at 50% 34%, color-mix(in srgb, ${accent} 22%, transparent) 0%, transparent 62%),
          repeating-conic-gradient(from 0deg at 50% 34%, #ffffff08 0deg 6deg, transparent 6deg 12deg),
          radial-gradient(140% 120% at 50% 20%, #1A1030 0%, #0A0614 60%, #060310 100%)
        `,
        padding: 'max(18px, env(safe-area-inset-top)) 24px max(36px, env(safe-area-inset-bottom)) 24px',
        justifyContent: 'space-between',
      }}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? undefined : { opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.22 }}
      onClick={onClose}
    >
      {/* Top row: close (+ progress) + rarity */}
      <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid place-items-center rounded-full"
            style={{ width: 36, height: 36, background: '#ffffff14', color: '#ffffffb3' }}
          >
            <X size={20} />
          </button>
          {progress && progress.total > 1 && (
            <span
              className="num-display rounded-full"
              aria-label={`${progress.index} von ${progress.total}`}
              style={{
                padding: '5px 11px',
                fontSize: 13,
                letterSpacing: 0.5,
                color: '#ffffffcc',
                background: '#ffffff14',
                border: '1px solid #ffffff26',
              }}
            >
              {progress.index}/{progress.total}
            </span>
          )}
        </div>
        {payload.rarity && (
          <div
            className="flex items-center gap-1.5 rounded-full"
            style={{
              padding: '6px 12px',
              background: '#ffffff1f',
              border: '1px solid #ffffff40',
              backdropFilter: 'blur(14px)',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, color: '#fff' }}>
              {payload.rarity}
            </span>
          </div>
        )}
      </div>

      {/* Center */}
      <div className="flex flex-col items-center gap-5" onClick={(e) => e.stopPropagation()}>
        {/* Badge disc */}
        <motion.div
          className="relative grid place-items-center"
          style={{ width: 160, height: 160 }}
          initial={reduce ? false : { scale: 0.4, rotate: -14, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={spring}
        >
          {/* Aura glow */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle at 50% 50%, color-mix(in srgb, ${accent} 55%, transparent) 0%, transparent 70%)`,
              filter: 'blur(16px)',
            }}
          />
          {/* Rainbow ring */}
          <div
            className="relative grid place-items-center rounded-full"
            style={{
              width: 140,
              height: 140,
              background: RAINBOW,
              boxShadow: '0 0 34px -6px #ffffff80',
            }}
          >
            <div
              className="grid place-items-center rounded-full"
              style={{ width: 106, height: 106, background: '#0E0820' }}
            >
              <Icon size={58} strokeWidth={2.2} style={{ color: '#fff', filter: `drop-shadow(0 0 12px ${accent})` }} />
            </div>
          </div>
        </motion.div>

        {/* Kicker */}
        <motion.span
          initial={reduce ? false : { y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...spring, delay: reduce ? 0 : 0.08 }}
          style={{ fontSize: 14, fontWeight: 800, letterSpacing: 2, color: '#fff', textShadow: '0 0 14px #ffffff66' }}
        >
          {payload.kicker}
        </motion.span>

        {/* Value */}
        {shownValue != null && shownValue !== '' && (
          <motion.div
            className="flex items-end gap-2"
            initial={reduce ? false : { scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...spring, delay: reduce ? 0 : 0.12 }}
          >
            <span
              className="num-display"
              style={{ fontSize: 104, lineHeight: 0.85, color: '#fff', textShadow: `0 0 28px color-mix(in srgb, ${accent} 60%, transparent)` }}
            >
              {shownValue}
            </span>
            {payload.unit && (
              <span className="num-display" style={{ fontSize: 34, color: '#fff', paddingBottom: 16 }}>
                {payload.unit}
              </span>
            )}
          </motion.div>
        )}

        {/* Detail */}
        {payload.detail && (
          <motion.p
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduce ? 0 : 0.2 }}
            style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.4, color: '#ffffffe6', textAlign: 'center', maxWidth: 300 }}
          >
            {payload.detail}
          </motion.p>
        )}
      </div>

      {/* Actions */}
      <motion.div
        className="flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
        initial={reduce ? false : { y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...spring, delay: reduce ? 0 : 0.24 }}
      >
        {payload.onShare && (
          <button
            type="button"
            onClick={payload.onShare}
            className="flex items-center justify-center gap-2 rounded-full"
            style={{ padding: '16px 0', background: '#fff', color: '#0A0614', fontSize: 16, fontWeight: 700 }}
          >
            <Share2 size={19} />
            {payload.shareLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center gap-1 rounded-full"
          style={{
            padding: '15px 0',
            background: '#ffffff14',
            border: '1px solid #ffffff33',
            color: '#fff',
            fontSize: 15,
            fontWeight: 700,
          }}
        >
          {payload.dismissLabel}
          <ChevronRight size={17} />
        </button>
      </motion.div>
    </motion.div>
  )
}
