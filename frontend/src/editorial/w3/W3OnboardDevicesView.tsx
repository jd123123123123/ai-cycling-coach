import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Activity } from 'lucide-react'
import { T, FONT, EASE } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import { W3OnboardTopBar, W3OnboardDots, W3OnboardCta, W3OnboardHeadline } from './W3OnboardKit'
import './w3.css'

/**
 * W3 · Onboarding 02 — Connect your devices (pen QINnT). Chrome + hero +
 * headline live here; the actual device rows are passed in as `children` so
 * the wired Page can own the real connect state (useGarminStatus /
 * useWahooStatus / Apple Health setup) while this view stays presentational.
 */
export interface W3OnboardDevicesProps {
  children: ReactNode   // the device rows (real, from the Page)
  onNext: () => void
  onSkip: () => void
}

export default function W3OnboardDevicesView({ children, onNext, onSkip }: W3OnboardDevicesProps) {
  const reduce = useReducedMotion()

  // fixture: a decorative "live session" dial — a mock of what a synced ride
  // looks like landing in W3, not a reading of any real activity.
  const ARC = 2 * Math.PI * 78

  return (
    <div className="w3-root">
      <div style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>
        <W3StatusBar />
        <W3OnboardTopBar onSkip={onSkip} />

        {/* Hero — the live-session dial (fixture) */}
        <div style={{ position: 'relative', display: 'grid', placeItems: 'center', padding: '18px 0 6px' }}>
          <div style={{ position: 'absolute', width: 320, height: 320, borderRadius: '50%', background: `radial-gradient(circle, ${T.acid}18 0%, transparent 62%)`, pointerEvents: 'none' }} />
          <motion.div
            initial={reduce ? false : { scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.55, ease: EASE }}
            style={{ position: 'relative', width: 190, height: 190, borderRadius: 32, background: T.surface, border: `1px solid ${T.stroke}`, display: 'grid', placeItems: 'center' }}
          >
            <svg width={172} height={172} viewBox="0 0 172 172" style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
              <circle cx={86} cy={86} r={78} fill="none" stroke="#FFFFFF14" strokeWidth={9} />
              <motion.circle
                cx={86} cy={86} r={78} fill="none" stroke={T.acid} strokeWidth={9} strokeLinecap="round"
                strokeDasharray={ARC}
                initial={reduce ? false : { strokeDashoffset: ARC }}
                animate={{ strokeDashoffset: ARC * 0.32 }}
                transition={{ duration: 1.3, ease: EASE, delay: 0.2 }}
              />
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Activity size={30} color={T.acid} strokeWidth={2.4} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5, color: T.ink }}>1:42:09</span>
                <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.5, color: T.quiet }}>LIVE SESSION</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Copy + rows + footer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '10px 20px 28px', flex: 1 }}>
          <W3OnboardHeadline
            kicker="02 — SETUP"
            line1="Connect your"
            line2="devices."
            body="Link your head unit or watch once. Every ride lands in W3 automatically and starts earning."
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 'auto' }}>
            <W3OnboardDots step={1} />
            <W3OnboardCta label="NEXT" onClick={onNext} />
          </div>
        </div>
      </div>
    </div>
  )
}
