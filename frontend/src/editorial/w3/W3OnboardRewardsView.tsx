import type { ComponentType } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Zap, Wallet, Gift, Flame } from 'lucide-react'
import { T, FONT, EASE } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import { W3OnboardTopBar, W3OnboardDots, W3OnboardCta, W3OnboardHeadline } from './W3OnboardKit'
import './w3.css'

/**
 * W3 · Onboarding 03 — Ride and get rewarded (pen b5Bzg). The pen's XP/level
 * gamification is rewritten to the REAL RideCoin economy: the equal 400 RC
 * head start (125 photo + 125 device + 150 bike) and ~1 RC per TSS earn rate.
 * The three tiles are supplied by the Page (real wallet balance + real
 * constants from `api/rewards.ts`, mirroring `services/rewards.py`).
 */
export interface W3RewardTile { value: string; label: string; story?: string }
export interface W3OnboardRewardsProps {
  tiles: [W3RewardTile, W3RewardTile, W3RewardTile]
  onNext: () => void
  onSkip: () => void
}

/** The three tiles always arrive in the same order (balance → head-start grant →
 *  earn rate), so each gets a fixed icon, step marker and default story line that
 *  turns the bare numbers into a start → how → why sequence. A tile may override
 *  the copy via `story`; otherwise these defaults tell the RideCoin story. */
const STORY: { Icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>; step: string; story: string; accent: boolean }[] = [
  { Icon: Wallet, step: '01 · DEIN START', accent: true, story: 'Alle starten mit denselben 400 — Vorsprung gibt es nicht zu kaufen.' },
  { Icon: Gift, step: '02 · WO ES HERKOMMT', accent: false, story: '125 fürs Foto, 125 fürs Gerät, 150 für dein digitalisiertes Bike. Einmalig.' },
  { Icon: Flame, step: '03 · WIE ES WÄCHST', accent: false, story: 'Jede Fahrt bringt ~1 RC pro TSS — härtere Einheit, größere Auszahlung.' },
]

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
          <Chip top={44} left={30} delay={0.25}>+400 RC</Chip>
          <Chip top={30} right={34} delay={0.35}>NEUES TEIL</Chip>
          <Chip top={188} right={48} delay={0.45}>LEVEL UP</Chip>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '6px 20px 28px', flex: 1 }}>
          <W3OnboardHeadline
            kicker="03 — DER LOOP"
            line1="Fahr und werde"
            line2="belohnt."
            body="Jede Fahrt bringt RideCoin — etwa 1 RC pro TSS. Je härter die Einheit, desto mehr. Kein Kilometer-Schinden, kein Pay-to-win."
          />

          {/* Real RideCoin tiles, read as a start → how → why story */}
          <div style={{ position: 'relative', borderRadius: 22, background: T.surface, border: `1px solid ${T.rule}`, padding: '4px 18px 6px' }}>
            {tiles.map((t, i) => {
              const meta = STORY[i] ?? STORY[0]
              const { Icon } = meta
              const isLast = i === tiles.length - 1
              return (
                <motion.div
                  key={t.label}
                  initial={reduce ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE, delay: 0.15 + i * 0.09 }}
                  style={{ display: 'flex', gap: 15, padding: '16px 0', borderTop: i === 0 ? 'none' : `1px solid ${T.rule}` }}
                >
                  {/* icon rail — a connector line threads the three steps together */}
                  <div style={{ position: 'relative', width: 44, flex: 'none', display: 'flex', justifyContent: 'center' }}>
                    <div style={{ position: 'absolute', left: 'calc(50% - 1px)', width: 2, top: i === 0 ? 22 : 0, bottom: isLast ? 'calc(100% - 22px)' : 0, background: T.rule }} />
                    <div style={{ position: 'relative', width: 44, height: 44, borderRadius: 13, display: 'grid', placeItems: 'center', background: meta.accent ? T.acid : T.surface2, border: `1px solid ${meta.accent ? 'transparent' : T.stroke}`, boxShadow: meta.accent ? `0 0 18px ${T.acid}44` : 'none' }}>
                      <Icon size={20} color={meta.accent ? T.bg : T.acid} strokeWidth={2} />
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 1 }}>
                    <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 1, color: T.quiet }}>{meta.step}</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: -1.2, lineHeight: 1, color: meta.accent ? T.acid : T.ink }}>{t.value}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: T.mid }}>{t.label}</span>
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.4, color: T.quiet }}>{t.story ?? meta.story}</span>
                  </div>
                </motion.div>
              )
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 'auto' }}>
            <W3OnboardDots step={2} />
            <W3OnboardCta label="WEITER" onClick={onNext} />
          </div>
        </div>
      </div>
    </div>
  )
}
