import { motion, useReducedMotion } from 'motion/react'

// A lightweight, self-contained confetti burst. Drop it inside a `relative`
// container; it fires once on mount (particles fly up, arc down, fade out).
// Respects reduced-motion (renders nothing).
const COLORS = [
  'var(--color-forest-2)',
  'var(--color-amber)',
  'var(--color-good)',
  '#FFD60A',
  'var(--color-ink-blue)',
]

export default function Confetti({ count = 18 }: { count?: number }) {
  const reduce = useReducedMotion()
  if (reduce) return null

  const pieces = Array.from({ length: count }, (_, i) => {
    const spread = (Math.random() - 0.5) * 220
    const rise = -(70 + Math.random() * 90)
    return {
      x: spread,
      rise,
      fall: rise + 120 + Math.random() * 60,
      rot: (Math.random() - 0.5) * 540,
      color: COLORS[i % COLORS.length],
      size: 5 + Math.random() * 4,
      delay: Math.random() * 0.06,
      dur: 0.9 + Math.random() * 0.5,
    }
  })

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="absolute left-1/2 top-1/2"
          style={{ width: p.size, height: p.size, background: p.color, borderRadius: 1 }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
          animate={{ x: p.x, y: [0, p.rise, p.fall], opacity: [1, 1, 0], rotate: p.rot, scale: [1, 1, 0.5] }}
          transition={{ duration: p.dur, ease: 'easeOut', delay: p.delay }}
        />
      ))}
    </div>
  )
}
