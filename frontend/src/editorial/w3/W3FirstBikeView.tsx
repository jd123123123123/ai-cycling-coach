import { motion, useReducedMotion } from 'motion/react'
import { Sparkles, ArrowRight, Wrench, TrendingUp, Palette, Bike, Camera } from 'lucide-react'
import { T, FONT, EASE, band } from './w3tokens'
import './w3.css'

/**
 * W3 · First bike — the onboarding step that hands the rider their starter
 * bike and frames the whole upgrade loop: "this is yours; earn RideCoin from
 * training and upgrade it." Same W3 cover + combined-card + reasons pattern as
 * the avatar onboarding. Pure function of props.
 */

export interface W3FirstBikeProps {
  bikeImageUrl: string | null
  onContinue: () => void
  /** Route into the LLM pipeline (bike studio): photo → generated collectible. */
  onDigitalize?: () => void
}

const UPGRADES: { icon: typeof Wrench; title: string; body: string }[] = [
  { icon: TrendingUp, title: 'Every ride earns RideCoin', body: 'The harder the session (TSS), the more you bank — no junk-mile farming.' },
  { icon: Wrench, title: 'Upgrade the parts', body: 'Spend it on wheels, tyres, a drivetrain — your bike grows with your fitness.' },
  { icon: Palette, title: 'Make it yours', body: 'Frame paint, finishes and rare seasonal drops. Cosmetic only — never pay-to-win.' },
]

export default function W3FirstBikeView({ bikeImageUrl, onContinue, onDigitalize }: W3FirstBikeProps) {
  const reduce = useReducedMotion()

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>

        {/* Cover — the starter bike */}
        <div style={{ position: 'relative', height: 380, background: '#151615', overflow: 'hidden' }}>
          {bikeImageUrl
            ? <img src={bikeImageUrl} alt="Your starter bike" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 45%' }} />
            : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: T.quiet }}>
                <Bike size={80} strokeWidth={1.2} color="#3A3A3A" />
              </div>}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 44, padding: '0 22px', display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 700, color: '#fff' }}>9:41</div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 150, background: `linear-gradient(180deg, transparent, ${T.bg})` }} />
        </div>

        {/* Combined card over the cover */}
        <div style={{ ...band(4), paddingTop: 0, marginTop: -70, position: 'relative', zIndex: 2 }}>
          <motion.div initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
            style={{ width: '100%', padding: '18px 18px 20px', borderRadius: 20, background: T.surface, border: `1px solid ${T.stroke}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', alignSelf: 'flex-start', padding: '5px 11px', borderRadius: 100, background: T.acidDim }}>
              <Sparkles size={11} color={T.acid} /><span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.acid }}>YOUR FIRST BIKE</span>
            </div>
            <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1, lineHeight: 1.05, color: T.ink }}>Start here. Build it up.</span>
            <span style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.5, color: T.mid }}>
              This starter bike is yours. Train, earn RideCoin, and upgrade every part of it as your fitness climbs.
            </span>
          </motion.div>
        </div>

        {/* How the upgrade loop works */}
        <div style={{ ...band(10), gap: 8, paddingTop: 16 }}>
          {UPGRADES.map((r, i) => {
            const Ic = r.icon
            return (
              <motion.div key={r.title} initial={reduce ? false : { opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: EASE, delay: 0.12 + i * 0.08 }}
                style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', borderRadius: 16, background: T.surface, border: `1px solid ${T.rule}` }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: T.acidDim, display: 'grid', placeItems: 'center', flex: 'none' }}><Ic size={16} color={T.acid} /></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{r.title}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.35, color: T.mid }}>{r.body}</span>
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* CTA */}
        <div style={{ ...band(38), paddingTop: 6, marginTop: 'auto' }}>
          {onDigitalize && (
            <button onClick={onDigitalize} style={{ height: 56, borderRadius: 100, border: 0, background: T.acid, color: T.bg, fontFamily: FONT, fontSize: 16, fontWeight: 700, letterSpacing: -0.2, cursor: 'pointer', display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
              <Camera size={19} color={T.bg} />Turn my real bike into a collectible
            </button>
          )}
          <button onClick={onContinue} style={{ height: onDigitalize ? 48 : 56, marginTop: onDigitalize ? 8 : 0, borderRadius: 100, border: onDigitalize ? `1px solid ${T.stroke}` : 0, background: onDigitalize ? 'transparent' : T.acid, color: onDigitalize ? T.ink : T.bg, fontFamily: FONT, fontSize: onDigitalize ? 14 : 16, fontWeight: 700, letterSpacing: -0.2, cursor: 'pointer', display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', width: '100%' }}>
            {onDigitalize ? 'Start with this starter bike' : 'This is my bike'}<ArrowRight size={16} color={onDigitalize ? T.ink : T.bg} />
          </button>
          <span style={{ display: 'block', textAlign: 'center', fontSize: 10.5, fontWeight: 500, color: T.quiet, marginTop: 10, lineHeight: 1.4 }}>
            Snap your real bike and we style it into a collectible. You can also do it later in the Garage.
          </span>
        </div>
      </div>
    </div>
  )
}
