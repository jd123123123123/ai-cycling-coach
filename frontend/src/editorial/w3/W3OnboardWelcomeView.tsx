import { motion, useReducedMotion } from 'motion/react'
import { T, FONT, EASE } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import { W3OnboardTopBar, W3OnboardDots, W3OnboardCta } from './W3OnboardKit'
import './w3.css'

/**
 * W3 · Onboarding 01 — Welcome. Full-bleed rider hero with the pitch anchored
 * to the bottom over a scrim (pen hkpJw). "Training that plays back." Pure
 * function of props.
 */
export interface W3OnboardWelcomeProps {
  heroImageUrl: string | null
  onNext: () => void
  onSkip: () => void
}

export default function W3OnboardWelcomeView({ heroImageUrl, onNext, onSkip }: W3OnboardWelcomeProps) {
  const reduce = useReducedMotion()

  return (
    <div className="w3-root">
      <div style={{ position: 'relative', fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg, overflow: 'hidden' }}>

        {/* Full-bleed rider */}
        {heroImageUrl && (
          <motion.img
            src={heroImageUrl}
            alt=""
            aria-hidden
            initial={reduce ? false : { scale: 1.06, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.9, ease: EASE }}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 28%' }}
          />
        )}
        {/* Scrim → the copy reads cleanly over the photo */}
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${T.bg}66 0%, transparent 30%, ${T.bg}CC 66%, ${T.bg} 92%)` }} />

        {/* Chrome */}
        <div style={{ position: 'relative', zIndex: 2 }}>
          <W3StatusBar />
          <W3OnboardTopBar onSkip={onSkip} />
        </div>

        {/* Bottom-anchored pitch */}
        <div style={{ position: 'relative', zIndex: 2, marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 22, padding: '0 20px 28px' }}>
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: EASE, delay: 0.15 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 2, color: T.acid }}>01 — THE IDEA</span>
            <h1 style={{ margin: 0, fontSize: 44, fontWeight: 800, letterSpacing: -1.8, lineHeight: 0.98, color: T.ink }}>
              Training that<br /><span style={{ color: T.acid }}>plays back.</span>
            </h1>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 500, lineHeight: 1.5, color: T.mid, maxWidth: 340 }}>
              Every watt you push turns into progress you can see — levels, upgrades and a bike that grows with you.
            </p>
          </motion.div>

          <W3OnboardDots step={0} />
          <W3OnboardCta label="NEXT" onClick={onNext} />
        </div>
      </div>
    </div>
  )
}
