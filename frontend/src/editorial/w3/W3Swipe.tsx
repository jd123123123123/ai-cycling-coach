import { useRef, useState } from 'react'
import { motion, useMotionValue, useReducedMotion, useTransform, animate } from 'motion/react'
import { ChevronsRight } from 'lucide-react'
import { T, FONT, EASE } from './w3tokens'

/**
 * W3 · SWIPE TO — the one gesture the reward loop is built on.
 *
 * Used twice, and deliberately identical both times: once on Today to open a
 * sealed ride, once at the foot of the celebration to bank its coins. Learning
 * it once should be enough, and a rider who has pulled this knob before knows
 * exactly what the second one will do.
 *
 * WHY A DRAG AND NOT A BUTTON. A tap is how you dismiss things. The whole point
 * of the mechanic is that collecting is an ACT — the thumb travels, the track
 * fills behind it, the knob snaps, and only then does anything happen. That
 * travel is also what makes it impossible to do by accident while scrolling,
 * which a tap on a full-width bar very much is not.
 *
 * Accessibility is not a lesser path here. Under `prefers-reduced-motion` the
 * drag is off and the knob is an ordinary button; a plain tap works for
 * everyone, always; and the label is on the control rather than beside it.
 */

const KNOB = 46
const PAD = 5

export interface W3SwipeProps {
  label: string
  /** Fired once, after the knob has travelled past the threshold. */
  onComplete: () => void
  /** Track + knob colour. Defaults to the acid the economy pays in. */
  tone?: string
  /** Ink on the knob. */
  knobInk?: string
  /** Track ground, for screens whose card is already `heroBg`. */
  track?: string
  height?: number
  disabled?: boolean
}

export default function W3Swipe({
  label, onComplete, tone = T.acid, knobInk = T.heroInk,
  track = T.heroBg, height = 56, disabled = false,
}: W3SwipeProps) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement | null>(null)
  const [span, setSpan] = useState(220)
  const [done, setDone] = useState(false)
  const x = useMotionValue(0)

  const progress = useTransform(x, [0, span], [0, 1])
  const fillWidth = useTransform(progress, (v) => `${Math.max(0, Math.min(1, v)) * 100}%`)
  const labelFade = useTransform(progress, [0, 0.55], [1, 0])

  const measure = () => {
    const w = ref.current?.clientWidth ?? 260
    setSpan(Math.max(120, w - KNOB - PAD * 2))
  }

  const finish = () => {
    if (done) return
    setDone(true)
    try { navigator.vibrate?.([12, 40, 22]) } catch { /* platform has none */ }
    onComplete()
  }

  const release = () => {
    // Two thirds of the track: far enough that a scroll cannot trip it, short
    // enough for one thumb motion.
    if (x.get() >= span * 0.66) {
      animate(x, span, { duration: 0.16, ease: EASE }).then(finish)
    } else {
      animate(x, 0, { type: 'spring', stiffness: 520, damping: 34 })
    }
  }

  return (
    <div
      ref={(el) => { ref.current = el; if (el) measure() }}
      onPointerDown={measure}
      style={{
        position: 'relative', height, borderRadius: 100, background: track,
        padding: PAD, display: 'flex', alignItems: 'center', overflow: 'hidden',
        touchAction: 'pan-y', opacity: disabled ? 0.5 : 1,
      }}>

      <motion.div aria-hidden style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: fillWidth,
        background: `${tone}2E`,
      }} />

      <motion.span aria-hidden style={{
        position: 'absolute', left: 0, right: 0, textAlign: 'center',
        fontFamily: FONT, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.3,
        color: T.mid, opacity: labelFade, pointerEvents: 'none',
      }}>{label}</motion.span>

      <motion.button
        drag={reduce || disabled ? false : 'x'}
        dragConstraints={{ left: 0, right: span }}
        dragElastic={0.02}
        dragMomentum={false}
        onDragEnd={release}
        disabled={disabled}
        onClick={() => { if (x.get() < 4) finish() }}
        aria-label={label}
        style={{
          x, position: 'relative', width: KNOB, height: KNOB, borderRadius: 100,
          border: 0, padding: 0, background: tone, cursor: disabled ? 'default' : 'grab',
          display: 'grid', placeItems: 'center', flex: 'none', touchAction: 'none',
        }}>
        <motion.span aria-hidden
          animate={reduce || done ? undefined : { x: [0, 3, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ display: 'grid', placeItems: 'center' }}>
          <ChevronsRight size={22} color={knobInk} strokeWidth={2.6} />
        </motion.span>
      </motion.button>
    </div>
  )
}
