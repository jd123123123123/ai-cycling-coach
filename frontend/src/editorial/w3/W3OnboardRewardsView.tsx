import { motion, useReducedMotion } from 'motion/react'
import { Zap } from 'lucide-react'
import { T, FONT, EASE } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import { W3OnboardTopBar, W3OnboardDots, W3OnboardCta, W3OnboardHeadline } from './W3OnboardKit'
import './w3.css'

/**
 * W3 · Onboarding 03 — Ride and get rewarded (pen b5Bzg). The pen's XP/level
 * gamification is rewritten to the REAL RideCoin economy: the equal 250 RC
 * head start (125 photo + 125 device) and ~1 RC per TSS earn rate. The three
 * tiles are supplied by the Page (real wallet balance + real constants).
 */
export interface W3RewardTile { value: string; label: string }
export interface W3OnboardRewardsProps {
  tiles: [W3RewardTile, W3RewardTile, W3RewardTile]
  onNext: () => void
  onSkip: () => void
}

export default function W3OnboardRewardsView({ tiles, onNext, onSkip }: W3OnboardRewardsProps) {
  const reduce = useReducedMotion()

  const Chip = ({ children, top, left, right, delay }: { children: string; top: number; left?: number; right?: number; delay: number }) => (
    <motion.div
      initial={reduce ? false : { scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 280, damping: 16, delay }}
      style={{
        position: 'absolute', top, left, right,
        padding: '7px 13px', borderRadius: 100,
        background: children.includes('RC') ? T.acid : T.surface2,
        color: children.includes('RC') ? T.bg : T.ink,
        border: children.includes('RC') ? 'none' : `1px solid ${T.stroke}`,
        fontSize: 11, fontWeight: 800, letterSpacing: 0.5, whiteSpace: 'nowrap',
      }}
    >
      {children}
    </motion.div>
  )

  return (
    <div className="w3-root">
      <div style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>
        <W3StatusBar />
        <W3OnboardTopBar onSkip={onSkip} />

        {/* Hero — the RideCoin */}
        <div style={{ position: 'relative', display: 'grid', placeItems: 'center', height: 260 }}>
          <div style={{ position: 'absolute', width: 360, height: 360, borderRadius: '50%', background: `radial-gradient(circle, ${T.acid}22 0%, transparent 60%)`, pointerEvents: 'none' }} />
          <motion.div
            initial={reduce ? false : { scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 18 }}
            style={{ position: 'relative', width: 168, height: 168, borderRadius: '50%', background: T.acid, display: 'grid', placeItems: 'center', boxShadow: `0 0 60px ${T.acid}55` }}
          >
            <div style={{ position: 'absolute', inset: 14, borderRadius: '50%', border: `2px solid ${T.bg}33` }} />
            <Zap size={72} color={T.bg} fill={T.bg} strokeWidth={1.5} />
          </motion.div>
          {/* fixture: floating chips illustrating the loop; the +RC value below is real */}
          <Chip top={44} left={30} delay={0.25}>+250 RC</Chip>
          <Chip top={30} right={34} delay={0.35}>NEW PART</Chip>
          <Chip top={188} right={48} delay={0.45}>LEVEL UP</Chip>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '6px 20px 28px', flex: 1 }}>
          <W3OnboardHeadline
            kicker="03 — THE LOOP"
            line1="Ride and get"
            line2="rewarded."
            body="Every ride banks RideCoin — about 1 RC per TSS of training stress, so the harder the session the more you earn. No junk-mile farming, no pay-to-win."
          />

          {/* Real RideCoin tiles */}
          <div style={{ display: 'flex', gap: 10 }}>
            {tiles.map((t, i) => (
              <motion.div
                key={t.label}
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE, delay: 0.15 + i * 0.08 }}
                style={{ flex: 1, padding: '16px 12px', borderRadius: 18, background: T.surface, border: `1px solid ${T.rule}`, display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: -1, color: T.ink }}>{t.value}</span>
                <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: T.quiet, lineHeight: 1.3 }}>{t.label}</span>
              </motion.div>
            ))}
          </div>

          <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.45, color: T.quiet }}>
            Your 250 RC head start is the same for everyone — 125 for your photo, 125 for linking a device. Earning takes over from there.
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 'auto' }}>
            <W3OnboardDots step={2} />
            <W3OnboardCta label="NEXT" onClick={onNext} />
          </div>
        </div>
      </div>
    </div>
  )
}
