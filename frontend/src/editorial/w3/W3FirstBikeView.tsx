import { motion, useReducedMotion } from 'motion/react'
import { Sparkles, ArrowRight, Wrench, TrendingUp, Palette, Camera, Plus } from 'lucide-react'
import { T, FONT, EASE, band } from './w3tokens'
import { GhostBike } from './W3BikeHero'
import './w3.css'

/**
 * W3 · First bike — the onboarding step that opens the rider's garage and
 * frames the upgrade loop: "put your real bike in here; earn RideCoin from
 * training and it grows with you." Pure function of props.
 *
 * This step used to hand out a stock "starter bike" and call it theirs, which
 * meant a rider who never touched the studio still saw a bike they'd never
 * made — on this screen and on Today. The garage is real state now, so the
 * cover is an honest empty stand: a bike-shaped absence, and one way to fill
 * it. Skipping is allowed; it just leaves the garage empty, and every surface
 * says so.
 *
 * Layout contract: this is a ONE-PAGER at 390×844 — nothing scrolls, and there
 * is no inner scroller either. The frame is exactly 100dvh; every band below
 * the cover is fixed-height (`flex: none`), and the cover is the single elastic
 * element (`flex: 1 1 auto`, 170–340px) so it absorbs whatever the viewport
 * gives or takes. The upgrade loop is three one-line rows rather than three
 * cards: on a phone the loop has to be legible in a glance, not read.
 */

export interface W3FirstBikeProps {
  /** The rider's bike, when they already have one (returning to this step).
   *  Null is the normal first-run case and shows the empty stand. */
  bikeImageUrl: string | null
  onContinue: () => void
  /** Route into the LLM pipeline (bike studio): photo → generated collectible. */
  onDigitalize?: () => void
}

/** The upgrade loop, one line each — title carries the promise, tail carries
 *  the honesty (no junk-mile farming, never pay-to-win). */
const UPGRADES: { icon: typeof Wrench; title: string; body: string }[] = [
  { icon: TrendingUp, title: 'Jede Fahrt bringt RideCoin', body: '— härter zahlt mehr.' },
  { icon: Wrench, title: 'Teile aufrüsten', body: '— Laufräder, Reifen, Antrieb.' },
  { icon: Palette, title: 'Mach es zu deinem', body: '— Lack, rare Drops, nie Pay-to-win.' },
]

export default function W3FirstBikeView({ bikeImageUrl, onContinue, onDigitalize }: W3FirstBikeProps) {
  const reduce = useReducedMotion()
  const empty = !bikeImageUrl

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', height: '100dvh', minHeight: '100dvh', background: T.bg }}>

        {/* Cover — their bike, or the empty stand waiting for it.
            The one elastic band: it gives back height on short viewports so
            the copy and the CTAs never need a scrollbar. */}
        <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 170, maxHeight: 340, background: '#151615', overflow: 'hidden' }}>
          {bikeImageUrl ? (
            <img src={bikeImageUrl} alt="Dein Bike" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 45%' }} />
          ) : (
            <>
              <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(58% 46% at 50% 44%, #FFFFFF14, transparent 70%)' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: '0 50px' }}>
                <div style={{ width: '100%', maxWidth: 280, height: '100%', opacity: 0.24 }}>
                  <GhostBike />
                </div>
              </div>
              <button onClick={onDigitalize} aria-label="Foto deines Bikes hinzufügen"
                style={{ position: 'absolute', top: '48%', left: '50%', transform: 'translate(-50%, -50%)', width: 66, height: 66, borderRadius: 100, background: T.bg, border: `1px solid ${T.acid}59`, boxShadow: `0 0 34px ${T.acid}26`, display: 'grid', placeItems: 'center', cursor: 'pointer', fontFamily: FONT }}>
                <Plus size={28} color={T.acid} strokeWidth={2.6} />
              </button>
            </>
          )}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 44, padding: '0 22px', display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 700, color: '#fff' }}>9:41</div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 120, background: `linear-gradient(180deg, transparent, ${T.bg})` }} />
        </div>

        {/* Combined card over the cover */}
        <div style={{ ...band(0), flex: 'none', paddingTop: 0, marginTop: -56, position: 'relative', zIndex: 2 }}>
          <motion.div initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
            style={{ width: '100%', padding: '16px 16px 18px', borderRadius: 20, background: T.surface, border: `1px solid ${T.stroke}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', alignSelf: 'flex-start', padding: '5px 11px', borderRadius: 100, background: T.acidDim }}>
              <Sparkles size={11} color={T.acid} /><span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.acid }}>DEINE GARAGE</span>
            </div>
            <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -1, lineHeight: 1.05, color: T.ink }}>
              {empty ? 'Ein Foto. Das ist dein Bike.' : 'Start hier. Bau es aus.'}
            </span>
            <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>
              {empty
                ? 'Foto deines Bikes — wir rendern dein Collectible: gleicher Rahmen, gleiche Farben, W3-Finish.'
                : 'Das Bike gehört dir — so wächst es mit deiner Fitness.'}
            </span>
          </motion.div>
        </div>

        {/* How the upgrade loop works — three one-liners, no card chrome */}
        <div style={{ ...band(0), flex: 'none', gap: 10, paddingTop: 14 }}>
          {UPGRADES.map((r, i) => {
            const Ic = r.icon
            return (
              <motion.div key={r.title} initial={reduce ? false : { opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: EASE, delay: 0.12 + i * 0.08 }}
                style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: T.acidDim, display: 'grid', placeItems: 'center', flex: 'none' }}><Ic size={14} color={T.acid} /></div>
                <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.35, color: T.mid }}>
                  <span style={{ fontWeight: 700, color: T.ink }}>{r.title}</span> {r.body}
                </span>
              </motion.div>
            )
          })}
        </div>

        {/* CTA */}
        <div style={{ ...band(0), flex: 'none', paddingTop: 14, paddingBottom: 'calc(18px + env(safe-area-inset-bottom))', marginTop: 'auto' }}>
          {onDigitalize && (
            <button onClick={onDigitalize} style={{ height: 52, borderRadius: 100, border: 0, background: T.acid, color: T.bg, fontFamily: FONT, fontSize: 16, fontWeight: 700, letterSpacing: -0.2, cursor: 'pointer', display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', width: '100%', flex: 'none' }}>
              <Camera size={19} color={T.bg} />{empty ? 'Mein Bike hinzufügen' : 'Anderes Bike rendern'}
            </button>
          )}
          <button onClick={onContinue} style={{ height: onDigitalize ? 44 : 52, marginTop: onDigitalize ? 8 : 0, borderRadius: 100, border: onDigitalize ? `1px solid ${T.stroke}` : 0, background: onDigitalize ? 'transparent' : T.acid, color: onDigitalize ? T.ink : T.bg, fontFamily: FONT, fontSize: onDigitalize ? 14 : 16, fontWeight: 700, letterSpacing: -0.2, cursor: 'pointer', display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', width: '100%', flex: 'none' }}>
            {empty ? 'Später' : 'Das ist mein Bike'}<ArrowRight size={16} color={onDigitalize ? T.ink : T.bg} />
          </button>
          <span style={{ display: 'block', textAlign: 'center', fontSize: 10.5, fontWeight: 500, color: T.quiet, marginTop: 8, lineHeight: 1.4 }}>
            {empty
              ? 'Ohne Bike bleibt die Garage leer — du kannst es jederzeit im Garage-Tab hinzufügen.'
              : 'Du kannst es jederzeit im Garage-Tab neu rendern.'}
          </span>
        </div>
      </div>
    </div>
  )
}
