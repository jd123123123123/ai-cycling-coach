import { motion, useReducedMotion } from 'motion/react'
import { Bike } from 'lucide-react'
import { T, FONT, EASE } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import { W3OnboardTopBar, W3OnboardDots, W3OnboardCta, W3OnboardHeadline } from './W3OnboardKit'
import './w3.css'

/**
 * W3 · Onboarding 04 — Build the bike you earn (pen mM8lX). The rider's
 * starter bike (STARTER_BIKE, passed in) framed as a collectible; "Start
 * riding" finishes onboarding and lands on Today. Pure function of props.
 */
export interface W3OnboardGarageProps {
  bikeImageUrl: string | null
  onStart: () => void
  onSkip: () => void
}

// fixture: cosmetic swatches + unlock count — no per-part backend behind the
// starter bike yet, so these illustrate the garage rather than report state.
const SWATCHES = [T.acid, '#7B5CFF', '#E8EAED', '#2BE68F']

export default function W3OnboardGarageView({ bikeImageUrl, onStart, onSkip }: W3OnboardGarageProps) {
  const reduce = useReducedMotion()

  return (
    <div className="w3-root">
      <div style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>
        <W3StatusBar />
        <W3OnboardTopBar onSkip={onSkip} />

        {/* Hero — the starter bike card */}
        <div style={{ padding: '18px 20px 6px' }}>
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: EASE }}
            style={{ borderRadius: 24, background: T.surface, border: `1px solid ${T.stroke}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: T.quiet }}>AERO — STUFE 1</span>
              <span style={{ padding: '5px 12px', borderRadius: 100, background: T.acidDim, color: T.acid, fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>DEINS</span>
            </div>
            <div style={{ borderRadius: 16, overflow: 'hidden', background: '#AFC7D6', aspectRatio: '16 / 11', display: 'grid', placeItems: 'center' }}>
              {bikeImageUrl
                ? <img src={bikeImageUrl} alt="Dein Starter-Bike" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <Bike size={72} strokeWidth={1.2} color="#3A3A3A" />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 4px 2px' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {SWATCHES.map((c) => (
                  <span key={c} style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: c === T.acid ? `2px solid ${T.ink}` : `1px solid ${T.stroke}` }} />
                ))}
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.8, color: T.mid }}>+8 TEILE WARTEN</span>
            </div>
          </motion.div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '14px 20px 28px', flex: 1 }}>
          <W3OnboardHeadline
            kicker="04 — DIE GARAGE"
            line1="Fahr dir dein"
            line2="Bike frei."
            body="Laufräder, Rahmen, Lack — jedes Teil verdienst du im Training, keins kaufst du. Deine Garage ist deine Saison."
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 'auto' }}>
            <W3OnboardDots step={3} />
            <W3OnboardCta label="LOSFAHREN" onClick={onStart} />
          </div>
        </div>
      </div>
    </div>
  )
}
