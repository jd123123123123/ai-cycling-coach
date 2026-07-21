/**
 * StreakBreakOverlay — the warm, non-punishing "your streak broke" moment.
 *
 * The soft counterpart to CelebrationOverlay: same full-screen mount, same
 * CSP-safe layered-gradient backdrop, same motion + prefers-reduced-motion
 * discipline — but a mournful-warm ember palette instead of a rainbow burst,
 * and deliberately NO confetti (this is a soft moment, not a celebration).
 *
 * The animation is a flame whose ember glow fades out while a hairline crack is
 * drawn across the badge (SVG strokeDashoffset via motion — inline, CSP-safe).
 * Under prefers-reduced-motion everything renders in its final state instantly:
 * a dimmed flame, the crack already drawn, no motion.
 *
 * Tone: Duolingo warmth, coach-classy. "Kein Drama — heute ist der beste Tag
 * für eine neue Serie." A clear CTA to start again is the primary action.
 */
import { type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { X, Flame, ChevronRight } from 'lucide-react'

const EMBER = '#FF8A3C'
const EMBER_DIM = '#6B5140'

export interface StreakBreakContent {
  /** The length the streak reached before it broke. */
  brokenLength: number
  kicker: string
  /** e.g. "Tage" / "days" — shown beside the number. */
  unit: string
  detail: string
  ctaLabel: string
  onCta: () => void
  dismissLabel: string
}

export default function StreakBreakOverlay({
  content,
  onClose,
}: {
  content: StreakBreakContent
  onClose: () => void
}) {
  const reduce = useReducedMotion()
  const spring = reduce
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 240, damping: 22 }

  // The ember glow fades from alive → dying; reduced motion pins it dim.
  const glowAnim = reduce ? { opacity: 0.22 } : { opacity: [0.85, 0.2, 0.32] }
  const glowTransition = reduce
    ? { duration: 0 }
    : { duration: 2.4, times: [0, 0.55, 1], ease: 'easeInOut' as const }

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={content.kicker}
      className="fixed inset-0 flex flex-col"
      style={{
        zIndex: 2147482000,
        background: `
          radial-gradient(120% 80% at 50% 34%, color-mix(in srgb, ${EMBER} 16%, transparent) 0%, transparent 60%),
          radial-gradient(140% 120% at 50% 22%, #241611 0%, #120B0A 58%, #0A0605 100%)
        `,
        padding:
          'max(18px, env(safe-area-inset-top)) 24px max(36px, env(safe-area-inset-bottom)) 24px',
        justifyContent: 'space-between',
      }}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? undefined : { opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.24 }}
      onClick={onClose}
    >
      {/* Top row: close */}
      <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="grid place-items-center rounded-full"
          style={{ width: 36, height: 36, background: '#ffffff12', color: '#ffffffa6' }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Center */}
      <div className="flex flex-col items-center gap-6" onClick={(e) => e.stopPropagation()}>
        {/* Flame badge with fading ember + a cracked seam */}
        <motion.div
          className="relative grid place-items-center"
          style={{ width: 168, height: 168 }}
          initial={reduce ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={spring}
        >
          {/* Dying ember aura */}
          <motion.div
            className="absolute rounded-full"
            style={{
              inset: 8,
              background: `radial-gradient(circle at 50% 45%, color-mix(in srgb, ${EMBER} 60%, transparent) 0%, transparent 70%)`,
              filter: 'blur(18px)',
            }}
            initial={reduce ? false : { opacity: 0.85 }}
            animate={glowAnim}
            transition={glowTransition}
          />
          {/* Cold ring holding the flame */}
          <div
            className="relative grid place-items-center rounded-full"
            style={{
              width: 132,
              height: 132,
              background: 'linear-gradient(180deg, #2A1C16 0%, #171010 100%)',
              border: '1px solid #ffffff14',
              boxShadow: 'inset 0 1px 0 #ffffff1a, 0 18px 40px -20px #000',
            }}
          >
            <FlameWithFade reduce={!!reduce} />
            {/* Crack — an inline SVG hairline drawn across the disc. */}
            <svg
              width="132"
              height="132"
              viewBox="0 0 132 132"
              className="absolute inset-0"
              style={{ pointerEvents: 'none' }}
              aria-hidden
            >
              <motion.path
                d="M66 6 L58 44 L74 62 L56 84 L70 108 L62 126"
                fill="none"
                stroke="#0A0605"
                strokeWidth={5}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={reduce ? { duration: 0 } : { duration: 0.9, delay: 0.5, ease: 'easeInOut' }}
              />
              <motion.path
                d="M66 6 L58 44 L74 62 L56 84 L70 108 L62 126"
                fill="none"
                stroke="color-mix(in srgb, #FF8A3C 55%, transparent)"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.7 }}
                transition={reduce ? { duration: 0 } : { duration: 0.9, delay: 0.5, ease: 'easeInOut' }}
              />
            </svg>
          </div>
        </motion.div>

        {/* Kicker */}
        <motion.span
          initial={reduce ? false : { y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...spring, delay: reduce ? 0 : 0.12 }}
          style={{
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: 2,
            color: '#FFB99A',
            textTransform: 'uppercase',
          }}
        >
          {content.kicker}
        </motion.span>

        {/* Broken length */}
        <motion.div
          className="flex items-end gap-2"
          initial={reduce ? false : { scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...spring, delay: reduce ? 0 : 0.16 }}
        >
          <span
            className="num-display"
            style={{ fontSize: 104, lineHeight: 0.85, color: '#F4E9E2' }}
          >
            {content.brokenLength}
          </span>
          <span className="num-display" style={{ fontSize: 32, color: '#C9B6AC', paddingBottom: 16 }}>
            {content.unit}
          </span>
        </motion.div>

        {/* Detail */}
        <motion.p
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduce ? 0 : 0.24 }}
          style={{
            fontSize: 16,
            fontWeight: 500,
            lineHeight: 1.45,
            color: '#EBDDD5',
            textAlign: 'center',
            maxWidth: 300,
          }}
        >
          {content.detail}
        </motion.p>
      </div>

      {/* Actions */}
      <motion.div
        className="flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
        initial={reduce ? false : { y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...spring, delay: reduce ? 0 : 0.28 }}
      >
        <button
          type="button"
          onClick={content.onCta}
          className="flex items-center justify-center gap-2 rounded-full"
          style={{
            padding: '16px 0',
            background: `linear-gradient(180deg, ${EMBER} 0%, #F0631E 100%)`,
            color: '#1A0E08',
            fontSize: 16,
            fontWeight: 800,
            boxShadow: `0 12px 30px -12px ${EMBER}`,
          }}
        >
          <Flame size={19} strokeWidth={2.4} />
          {content.ctaLabel}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center gap-1 rounded-full"
          style={{
            padding: '15px 0',
            background: '#ffffff10',
            border: '1px solid #ffffff26',
            color: '#F4E9E2',
            fontSize: 15,
            fontWeight: 700,
          }}
        >
          {content.dismissLabel}
          <ChevronRight size={17} />
        </button>
      </motion.div>
    </motion.div>
  )
}

/** The flame glyph, its color easing from alive-ember → cold ash. */
function FlameWithFade({ reduce }: { reduce: boolean }): ReactNode {
  return (
    <motion.div
      className="grid place-items-center"
      initial={reduce ? false : { color: EMBER }}
      animate={reduce ? { color: EMBER_DIM } : { color: [EMBER, EMBER_DIM, '#8A6A55'] }}
      transition={reduce ? { duration: 0 } : { duration: 2.4, times: [0, 0.55, 1], ease: 'easeInOut' }}
      style={{ color: EMBER_DIM }}
    >
      <Flame size={62} strokeWidth={2.1} style={{ filter: 'drop-shadow(0 2px 10px #00000066)' }} />
    </motion.div>
  )
}
