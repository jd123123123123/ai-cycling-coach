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
 *
 * ── One-tap morning-after repair (backlog 03·C2) ─────────────────────────────
 * The most common false break is a ride the athlete really did but Garmin
 * hadn't synced yet when the break was computed. When a `repair` handler is
 * provided, the card leads with a kind "Ich bin gefahren — prüfen" action that
 * triggers a fresh sync + honest re-evaluation. On a genuine restore the ember
 * re-ignites, the crack heals, and the recovered streak length is shown. On no
 * match it stays warm and honest ("kein Ritt gefunden — kein Drama") — it never
 * buys back a streak that wasn't earned.
 */
import { useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { X, Flame, ChevronRight, Check, Loader2 } from 'lucide-react'
import { type CelebrationProgress } from './CelebrationOverlay'

const EMBER = '#FF8A3C'
const EMBER_DIM = '#6B5140'

/** Outcome the card cares about from a morning-after re-check. */
export interface StreakRepairOutcome {
  repaired: boolean
  /** Authoritative streak length after the re-check. */
  streak: number
}

/** The one-tap repair affordance (backlog 03·C2). All copy pre-localized. */
export interface StreakBreakRepair {
  /** Runs the sync + re-evaluation; resolves with the honest outcome. */
  run: () => Promise<StreakRepairOutcome>
  checkLabel: string
  checkingLabel: string
  restoredKicker: string
  restoredDetail: string
  doneLabel: string
  /** Shown when no qualifying ride was found — honest, non-guilty. */
  nomatchDetail: string
  /** Shown when the check itself failed (offline / server) — retryable. */
  errorDetail: string
  retryLabel: string
}

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
  /** Optional one-tap morning-after repair (backlog 03·C2). */
  repair?: StreakBreakRepair
}

type Phase = 'idle' | 'checking' | 'restored' | 'nomatch' | 'error'

export default function StreakBreakOverlay({
  content,
  progress,
  onClose,
}: {
  content: StreakBreakContent
  progress?: CelebrationProgress
  onClose: () => void
}) {
  const reduce = useReducedMotion()
  const [phase, setPhase] = useState<Phase>('idle')
  const [restoredStreak, setRestoredStreak] = useState<number | null>(null)
  const spring = reduce
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 240, damping: 22 }

  const restored = phase === 'restored'

  // The ember glow fades from alive → dying; reduced motion pins it dim. When
  // restored it holds bright (the chain is whole again).
  const glowAnim = restored
    ? { opacity: 0.7 }
    : reduce
      ? { opacity: 0.22 }
      : { opacity: [0.85, 0.2, 0.32] }
  const glowTransition =
    restored || reduce
      ? { duration: reduce ? 0 : 0.5 }
      : { duration: 2.4, times: [0, 0.55, 1], ease: 'easeInOut' as const }

  const runRepair = async () => {
    if (!content.repair) return
    setPhase('checking')
    try {
      const out = await content.repair.run()
      if (out.repaired) {
        setRestoredStreak(out.streak)
        setPhase('restored')
      } else {
        setPhase('nomatch')
      }
    } catch {
      setPhase('error')
    }
  }

  const kicker = restored ? content.repair!.restoredKicker : content.kicker
  const bigNumber = restored && restoredStreak != null ? restoredStreak : content.brokenLength
  const detail =
    phase === 'restored'
      ? content.repair!.restoredDetail
      : phase === 'nomatch'
        ? content.repair!.nomatchDetail
        : phase === 'error'
          ? content.repair!.errorDetail
          : content.detail

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={kicker}
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
      {/* Top row: close (+ progress) */}
      <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid place-items-center rounded-full"
            style={{ width: 36, height: 36, background: '#ffffff12', color: '#ffffffa6' }}
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
                color: '#F4E9E2cc',
                background: '#ffffff10',
                border: '1px solid #ffffff1f',
              }}
            >
              {progress.index}/{progress.total}
            </span>
          )}
        </div>
      </div>

      {/* Center */}
      <div className="flex flex-col items-center gap-6" onClick={(e) => e.stopPropagation()}>
        {/* Flame badge with fading ember + a cracked seam (healed when restored) */}
        <motion.div
          className="relative grid place-items-center"
          style={{ width: 168, height: 168 }}
          initial={reduce ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={spring}
        >
          {/* Dying (or re-lit) ember aura */}
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
            <FlameWithFade reduce={!!reduce} restored={restored} />
            {/* Crack — an inline SVG hairline drawn across the disc. It fades out
                when the streak is restored (the seam heals). */}
            <motion.svg
              width="132"
              height="132"
              viewBox="0 0 132 132"
              className="absolute inset-0"
              style={{ pointerEvents: 'none' }}
              aria-hidden
              animate={{ opacity: restored ? 0 : 1 }}
              transition={{ duration: reduce ? 0 : 0.5 }}
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
            </motion.svg>
          </div>
        </motion.div>

        {/* Kicker */}
        <motion.span
          key={kicker}
          initial={reduce ? false : { y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...spring, delay: reduce ? 0 : 0.12 }}
          style={{
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: 2,
            color: restored ? '#8FE7B0' : '#FFB99A',
            textTransform: 'uppercase',
          }}
        >
          {kicker}
        </motion.span>

        {/* Broken (or restored) length */}
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
            {bigNumber}
          </span>
          <span className="num-display" style={{ fontSize: 32, color: '#C9B6AC', paddingBottom: 16 }}>
            {content.unit}
          </span>
        </motion.div>

        {/* Detail */}
        <motion.p
          key={detail}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduce ? 0 : 0.14 }}
          style={{
            fontSize: 16,
            fontWeight: 500,
            lineHeight: 1.45,
            color: '#EBDDD5',
            textAlign: 'center',
            maxWidth: 300,
          }}
        >
          {detail}
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
        {restored ? (
          <PrimaryButton onClick={onClose} icon={<Check size={19} strokeWidth={2.6} />}>
            {content.repair!.doneLabel}
          </PrimaryButton>
        ) : (
          <>
            {/* The kind repair path leads when offered and the streak isn't yet
                restarted. In the honest no-match / error states the primary
                becomes "start a new streak" and repair drops to a retry. */}
            {content.repair && phase !== 'nomatch' && (
              <PrimaryButton
                onClick={runRepair}
                disabled={phase === 'checking'}
                icon={
                  phase === 'checking' ? (
                    <SpinIcon />
                  ) : (
                    <Check size={19} strokeWidth={2.6} />
                  )
                }
              >
                {phase === 'checking'
                  ? content.repair.checkingLabel
                  : phase === 'error'
                    ? content.repair.retryLabel
                    : content.repair.checkLabel}
              </PrimaryButton>
            )}

            {/* Start a new streak — primary when no repair is offered or after a
                no-match, otherwise the calm secondary. */}
            <button
              type="button"
              onClick={content.onCta}
              disabled={phase === 'checking'}
              className="flex items-center justify-center gap-2 rounded-full"
              style={
                !content.repair || phase === 'nomatch'
                  ? {
                      padding: '16px 0',
                      background: `linear-gradient(180deg, ${EMBER} 0%, #F0631E 100%)`,
                      color: '#1A0E08',
                      fontSize: 16,
                      fontWeight: 800,
                      boxShadow: `0 12px 30px -12px ${EMBER}`,
                      opacity: phase === 'checking' ? 0.6 : 1,
                    }
                  : {
                      padding: '15px 0',
                      background: '#ffffff10',
                      border: '1px solid #ffffff26',
                      color: '#F4E9E2',
                      fontSize: 15,
                      fontWeight: 700,
                      opacity: phase === 'checking' ? 0.6 : 1,
                    }
              }
            >
              <Flame size={18} strokeWidth={2.4} />
              {content.ctaLabel}
            </button>

            {/* After a no-match, offer a gentle retry of the check. */}
            {content.repair && phase === 'nomatch' && (
              <button
                type="button"
                onClick={runRepair}
                className="flex items-center justify-center gap-1.5 rounded-full"
                style={{
                  padding: '13px 0',
                  background: 'transparent',
                  color: '#C9B6AC',
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                <Check size={16} strokeWidth={2.4} />
                {content.repair.retryLabel}
              </button>
            )}

            {/* Dismiss — always available, quietest of all. */}
            {phase !== 'nomatch' && (
              <button
                type="button"
                onClick={onClose}
                disabled={phase === 'checking'}
                className="flex items-center justify-center gap-1 rounded-full"
                style={{
                  padding: '13px 0',
                  background: 'transparent',
                  color: '#C9B6AC',
                  fontSize: 14,
                  fontWeight: 700,
                  opacity: phase === 'checking' ? 0.5 : 1,
                }}
              >
                {content.dismissLabel}
                <ChevronRight size={16} />
              </button>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  )
}

/** Shared coral primary button. */
function PrimaryButton({
  children,
  onClick,
  icon,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  icon: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-2 rounded-full"
      style={{
        padding: '16px 0',
        background: `linear-gradient(180deg, ${EMBER} 0%, #F0631E 100%)`,
        color: '#1A0E08',
        fontSize: 16,
        fontWeight: 800,
        boxShadow: `0 12px 30px -12px ${EMBER}`,
        opacity: disabled ? 0.7 : 1,
      }}
    >
      {icon}
      {children}
    </button>
  )
}

/** A quietly spinning loader glyph (CSS keyframe is global; motion-safe). */
function SpinIcon(): ReactNode {
  return (
    <motion.span
      className="grid place-items-center"
      animate={{ rotate: 360 }}
      transition={{ duration: 0.9, ease: 'linear', repeat: Infinity }}
      style={{ width: 19, height: 19 }}
    >
      <Loader2 size={19} strokeWidth={2.6} />
    </motion.span>
  )
}

/** The flame glyph, its color easing from alive-ember → cold ash (or re-lit). */
function FlameWithFade({ reduce, restored }: { reduce: boolean; restored: boolean }): ReactNode {
  if (restored) {
    return (
      <motion.div
        className="grid place-items-center"
        animate={{ color: EMBER }}
        transition={{ duration: reduce ? 0 : 0.5 }}
        style={{ color: EMBER }}
      >
        <Flame size={62} strokeWidth={2.1} style={{ filter: 'drop-shadow(0 2px 12px #FF8A3C55)' }} />
      </motion.div>
    )
  }
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
