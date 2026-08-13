import { motion, useReducedMotion } from 'motion/react'
import { T, FONT } from './w3tokens'

/**
 * W3 · Loading — a branded, animated wait state, so a data screen never shows a
 * blank frame. A softly pulsing acid ring behind the W3 mark, over the same
 * dark ground as every screen. Use for the brief gap before a page's real data
 * resolves. Reduced-motion aware.
 */
export default function W3Loading({ label }: { label?: string }) {
  const reduce = useReducedMotion()
  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, background: T.bg }}>
        <div style={{ position: 'relative', width: 76, height: 76, display: 'grid', placeItems: 'center' }}>
          {/* pulsing bloom */}
          <motion.div
            animate={reduce ? undefined : { scale: [1, 1.35, 1], opacity: [0.5, 0.15, 0.5] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'absolute', width: 76, height: 76, borderRadius: 100, background: T.acid, filter: 'blur(20px)', opacity: 0.4 }} />
          {/* spinning arc */}
          <motion.svg width={76} height={76} viewBox="0 0 76 76"
            animate={reduce ? undefined : { rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
            style={{ position: 'absolute' }}>
            <circle cx={38} cy={38} r={32} fill="none" stroke={T.rule} strokeWidth={4} />
            <path d="M38 6 a32 32 0 0 1 32 32" fill="none" stroke={T.acid} strokeWidth={4} strokeLinecap="round" />
          </motion.svg>
          {/* the mark */}
          <motion.span
            animate={reduce ? undefined : { scale: [1, 1.08, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            style={{ fontSize: 26, fontWeight: 800, color: T.acid, letterSpacing: -1 }}>✱</motion.span>
        </div>
        {label && <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: 0.3, color: T.quiet }}>{label}</span>}
      </div>
    </div>
  )
}
