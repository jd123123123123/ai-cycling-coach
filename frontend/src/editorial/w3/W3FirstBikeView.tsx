import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, Loader2, Lock } from 'lucide-react'
import { T, FONT, EASE } from './w3tokens'
import { S, TNUM } from './w3surfaces'
import './w3.css'
import W3StatusBar from './W3StatusBar'
import { W3Coin } from './W3Coin'
import { TIERS } from './w3bikes'
import { artFit, type ShopItem } from './w3shop'
import W3BikeStage from './W3BikeStage'
import { BIKE_LOOK } from '../../utils/w3bikePaint'

/**
 * W3 · Dein erstes Rad — the last step of onboarding, and the only one with no
 * way past it.
 *
 * WHY IT CANNOT BE SKIPPED. Every other onboarding step is an offer: connect a
 * device, take a photo, set a goal — skip them and the app still works, just
 * emptier. This one is different because the bike is the spine of the whole
 * reward loop: RideCoin exists to upgrade it, the garage exists to hold it, and
 * Today's hero is it. A rider who skipped would land in an app whose entire
 * economy points at an object they do not own. So there is no SPÄTER here, and
 * the gate that sent them here reads real server state (`loadout.bike`), not a
 * localStorage flag — clearing the cache or opening a second device cannot lose
 * or repeat the claim.
 *
 * WHY IT IS A GIFT AND NOT A PURCHASE. The Rostlaube is deliberately awful — it
 * rusts, it squeaks, and it is free forever. A first bike you want to replace is
 * a better hook than a good one you are content with: the ladder behind it is
 * the point, and the locked tiers are shown here precisely so the rider leaves
 * onboarding already knowing where they are headed.
 *
 * This screen is a ONE-PAGER at 390×844 — nothing scrolls. The stage is the one
 * elastic band and everything under it is fixed height.
 */

export interface W3FirstBikeProps {
  /** The free bikes on offer. One today (the Rostlaube); the screen becomes a
   *  picker on its own if the catalogue ever grants more than one. */
  options: ShopItem[]
  /** Mid-claim — the CTA holds its spinner rather than letting a double tap
   *  fire two claims at a boundary the server would refuse anyway. */
  claiming: boolean
  /** Set once the server has actually granted it — this is what turns the
   *  screen into the reveal. Never fired optimistically: the whole point of the
   *  moment is that the bike is genuinely theirs when the stamp lands. */
  claimed: boolean
  /** A refused or failed claim, already turned into a rider-facing sentence. */
  error: string | null
  onClaim: (item: ShopItem) => void
  onEnter: () => void
}

export default function W3FirstBikeView({
  options, claiming, claimed, error, onClaim, onEnter,
}: W3FirstBikeProps) {
  const reduce = useReducedMotion()
  const [pickedId, setPickedId] = useState<string | null>(null)
  const picked = options.find((o) => o.id === pickedId) ?? options[0] ?? null

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', height: '100dvh', minHeight: '100dvh', background: T.bg, overflow: 'hidden' }}>
        <W3StatusBar />

        {/* Header — deliberately no SPÄTER. */}
        <div style={{ flex: 'none', padding: `6px 20px ${S.sm}px`, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <W3Coin size={13} />
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.acid }}>GESCHENK ZUM START</span>
          </div>
          <span style={{ fontSize: 27, fontWeight: 700, letterSpacing: -1, lineHeight: 1.05, color: T.ink }}>
            {claimed ? 'Es gehört dir.' : 'Dein erstes Rad.'}
          </span>
        </div>

        {/* ── The stage ─────────────────────────────────────────────────────
            The single elastic band, so short viewports take height from the
            photo rather than from the copy or the button. */}
        <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 180, maxHeight: 430, overflow: 'hidden' }}>
          <div aria-hidden style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(64% 54% at 50% 54%, ${T.acid}1F 0%, transparent 72%)`,
          }} />
          {/* The bike is DRAWN, and lit, exactly as it will be in the garage
              five seconds from now — the first thing a rider sees of their bike
              must be the thing they'll keep seeing. The light stage is inset
              rather than full-bleed so the dark onboarding ground still frames
              it and the acid glow still reads behind. */}
          {picked && (
            <motion.div
              key={picked.id}
              initial={reduce ? false : { opacity: 0, scale: 1.04 }}
              animate={claimed && !reduce ? { opacity: 1, scale: 1.03 } : { opacity: 1, scale: 1 }}
              transition={{ duration: claimed ? 0.6 : 0.5, ease: EASE }}
              style={{ position: 'absolute', inset: '10px 20px 26px' }}
            >
              {BIKE_LOOK[picked.id]
                ? (
                  <div style={{ position: 'absolute', inset: 0, borderRadius: 24, overflow: 'hidden', border: `1px solid ${T.rule}` }}>
                    <W3BikeStage look={BIKE_LOOK[picked.id]} pad="12px 10px 22px" />
                  </div>
                )
                : <img src={picked.art} alt={picked.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: artFit(picked) }} />}
            </motion.div>
          )}

          {/* The stamp. It lands only after the server said yes. */}
          <AnimatePresence>
            {claimed && (
              <motion.div
                initial={reduce ? false : { opacity: 0, scale: 0.7, rotate: -14 }}
                animate={{ opacity: 1, scale: 1, rotate: -8 }}
                transition={{ type: 'spring', stiffness: 420, damping: 18 }}
                style={{
                  position: 'absolute', top: '50%', left: '50%', translate: '-50% -50%',
                  padding: '9px 18px', borderRadius: 10, border: `2.5px solid ${T.acid}`,
                  background: '#0B0B0BB3', boxShadow: `0 0 34px ${T.acid}59`,
                }}
              >
                <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: 2, color: T.acid }}>GEHÖRT DIR</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 96, background: `linear-gradient(180deg, transparent, ${T.bg})` }} />
        </div>

        {/* Name + the honest blurb */}
        <div style={{ flex: 'none', padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 4, marginTop: -14, position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: S.sm }}>
            <span style={{ fontSize: 23, fontWeight: 700, letterSpacing: -0.7, color: T.ink }}>{picked?.name ?? '—'}</span>
            <span style={{ ...TNUM, fontSize: 10, fontWeight: 700, letterSpacing: 1, color: T.acid }}>0 RC</span>
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>
            {picked?.blurb ?? ''} Jede Fahrt bringt RideCoin — damit wird daraus irgendwann Carbon.
          </span>
        </div>

        {/* Picker — only when there is genuinely something to choose between. */}
        {options.length > 1 && (
          <div style={{ flex: 'none', display: 'flex', gap: S.sm, padding: `${S.md}px 20px 0` }}>
            {options.map((o) => (
              <button key={o.id} onClick={() => setPickedId(o.id)} disabled={claimed}
                style={{
                  flex: 1, minWidth: 0, padding: 6, borderRadius: 14, cursor: claimed ? 'default' : 'pointer',
                  background: T.tile, border: `1px solid ${o.id === picked?.id ? T.acid : 'transparent'}`,
                }}>
                {BIKE_LOOK[o.id]
                  ? (
                    <div style={{ position: 'relative', width: '100%', height: 34, borderRadius: 9, overflow: 'hidden' }}>
                      <W3BikeStage look={BIKE_LOOK[o.id]} pad="2px 1px 4px" shadow={false} />
                    </div>
                  )
                  : <img src={o.art} alt={o.name} style={{ width: '100%', height: 34, objectFit: artFit(o) }} />}
              </button>
            ))}
          </div>
        )}

        {/* ── The ladder they just joined ───────────────────────────────────
            Five tiers, the first one lit. This is the argument for the whole
            economy in one row: you start on rust, and everything above it is
            bought with kilometres. */}
        <div style={{ flex: 'none', padding: `${S.lg}px 20px 0`, display: 'flex', gap: 5 }}>
          {TIERS.map((t, i) => {
            const here = i === 0
            return (
              <div key={t.tier} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center' }}>
                <div style={{ width: '100%', height: 3, borderRadius: 2, background: here ? T.acid : T.rule }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  {!here && <Lock size={7} color={T.quiet} />}
                  <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: 0.4, color: here ? T.acid : T.quiet, whiteSpace: 'nowrap' }}>
                    {t.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {error && (
          <div style={{ flex: 'none', padding: `${S.md}px 20px 0` }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: T.warn }}>{error}</span>
          </div>
        )}

        {/* CTA */}
        <div style={{ flex: 'none', padding: `${S.lg}px 20px calc(${S.lg}px + env(safe-area-inset-bottom))`, marginTop: 'auto' }}>
          <button
            onClick={() => {
              if (claiming) return
              if (claimed) return onEnter()
              if (picked) onClaim(picked)
            }}
            disabled={claiming || !picked}
            style={{
              width: '100%', height: 54, borderRadius: 100, border: 0, background: T.acid, color: T.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: S.sm,
              fontFamily: FONT, fontSize: 14, fontWeight: 700, letterSpacing: 0.6,
              cursor: claiming ? 'default' : 'pointer', opacity: picked ? 1 : 0.5,
              boxShadow: claimed ? `0 0 30px ${T.acid}4D` : 'none',
            }}
          >
            {claiming ? <Loader2 size={18} color={T.bg} className="w3-spin" />
              : claimed ? <><Check size={18} color={T.bg} />LOSFAHREN</>
              : 'RAD ÜBERNEHMEN'}
          </button>
          <span style={{ display: 'block', textAlign: 'center', fontSize: 10.5, fontWeight: 500, color: T.quiet, marginTop: S.sm, lineHeight: 1.4 }}>
            {claimed
              ? 'Du findest es jederzeit im Garage-Tab.'
              : 'Kostenlos, für immer deins — und der Startpunkt für alles andere.'}
          </span>
        </div>
      </div>
    </div>
  )
}
