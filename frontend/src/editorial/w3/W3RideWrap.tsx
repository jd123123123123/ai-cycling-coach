import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Check, Gauge, Mountain, Share2, Timer, X, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { T, FONT, grow } from './w3tokens'
import { TNUM } from './w3surfaces'
import RouteSketch from '../../components/ui/RouteSketch'
import { W3_MAP } from './w3map'
import { fireConfetti } from '../../lib/confetti'
import { hapticCelebrate } from '../../lib/haptics'

/** maplibre is the app's biggest chunk and only this screen's ground needs it,
 *  so it loads when the ground does — never on the way to Today. */
const RouteMap = lazy(() => import('../../components/crew/RouteMap'))

/**
 * Which glyph belongs to which reading. Keyed on the stat's own id rather than
 * its label, so a translated or reworded label cannot silently drop the icon.
 */
const STAT_ICON: Record<string, LucideIcon> = {
  time: Timer, moving: Timer, duration: Timer,
  climb: Mountain, elevation: Mountain, ascent: Mountain,
  power: Zap, np: Zap,
  speed: Gauge, pace: Gauge,
}

/**
 * THE RIDE, WRAPPED — the moment a rider unlocks a finished ride.
 *
 * ── ONE PAGE, AND IT IS A POSTER ─────────────────────────────────────────
 * This used to be the lede of a scrolling detail page: headline, hero number,
 * three tiles, a share button, and then the map further down with the rest of
 * the analysis under it. Two things were wrong with that. The rider had to
 * scroll to see their own route, and the screen they most want to screenshot
 * was never composed as one — the picture and the numbers never met.
 *
 * So the route IS the ground now. The ride's own GPS track fills the lower
 * half, the numbers and the actions sit on it, and the whole viewport is a
 * card that can go straight to a story without a crop. Nothing scrolls.
 *
 * ── WHAT THE BUTTON IS FOR ───────────────────────────────────────────────
 * It said "FAHRT TEILEN". That is not why a rider opened this: they opened it
 * because a chest was sealed and there are coins in it. The primary action is
 * the reward and it CARRIES ITS AMOUNT, because "Belohnung einlösen" with the
 * figure on it is a different button from one without — the number is the
 * reason to press.
 *
 * Sharing sits beside it as an icon, not under it: one primary action per
 * screen, its secondary adjacent and equal in height so the thumb finds either
 * without leaving the same band. The detail view goes below both as a text
 * link, which is the right weight for "there is more if you want it".
 *
 * Pure function of `vm`. Nothing here fetches, and nothing here invents: a
 * number the ride does not carry is simply not drawn.
 */

export interface W3WrapStat {
  key: string
  label: string
  /** Already formatted for de-DE. */
  value: string
  unit: string
  /** "+1,4 zum Ø" · "Bestwert" — the ride's own comparison, or null. */
  note: string | null
  /** 0–1 for the little bar under the number; null draws none. */
  fill: number | null
  /** The one stat that beat something. Goes acid. */
  best?: boolean
}

export interface W3RideWrapVm {
  /** "SONNENAUFGANG · SOLO" — conditions the ride actually had. */
  chip: string | null
  /** "01" — the ride's place in the day/week, as a chapter number. */
  chapter: string
  /** "RHEINSCHLEIFE" — the route's real name. */
  route: string
  /** "SA 23. AUG · 06:41" */
  when: string
  /** The coach's sentence, already split. `emphasis` may be empty. */
  lead: string
  emphasis: string
  /** The headline number — distance, the one a rider quotes. */
  heroValue: string
  heroUnit: string
  stats: W3WrapStat[]
  /**
   * The ride's own GPS track. It is the BACKGROUND of this screen, so a ride
   * without one falls back to the ground rather than to a decorative squiggle
   * belonging to nobody.
   */
  polyline: [number, number][] | null
  /**
   * What is in the chest, in RideCoin. Null when nothing is sealed — the
   * button then says what it can honestly say and shares instead.
   */
  rewardRc: number | null
  /**
   * THE CLAIM HAPPENS HERE, so this is a state and not a destination.
   *
   * `idle` offers it, `claiming` is the round trip, `claimed` is the receipt.
   * The button never navigates: sending a rider to another screen to press a
   * second button for coins they were already shown is a step that exists only
   * because the code was split that way.
   */
  claimState: 'idle' | 'claiming' | 'claimed'
}

function StatTile({ s, i, reduce }: { s: W3WrapStat; i: number; reduce: boolean | null }) {
  const tint = s.best ? T.acid : T.ink
  const Ic = STAT_ICON[s.key]
  return (
    <div style={{
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6,
      padding: '12px 12px 11px', borderRadius: 16,
      // Glass, because it sits on the route rather than on the ground — a
      // solid tile here would punch three holes in the picture.
      background: `${T.bg}A6`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
        {Ic && <Ic size={11} color={s.best ? T.acid : T.quiet} strokeWidth={2.2} />}
        <span style={{
          fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, color: T.quiet,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{s.label}</span>
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.7, lineHeight: 1, color: tint, ...TNUM }}>{s.value}</span>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: T.quiet, ...TNUM }}>{s.unit}</span>
      </div>
      {s.fill != null && (
        <div style={{ height: 3, borderRadius: 100, background: T.d1, overflow: 'hidden' }}>
          <motion.div
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${Math.round(Math.max(0, Math.min(1, s.fill)) * 100)}%` }}
            transition={grow(0.1 + i * 0.06)}
            style={{ height: '100%', borderRadius: 100, background: s.best ? T.acid : T.d3 }} />
        </div>
      )}
      {s.note && (
        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.4, color: s.best ? T.acid : T.quiet, ...TNUM }}>{s.note}</span>
      )}
    </div>
  )
}

export default function W3RideWrap({ vm, onShare, onClose, onUnlock, onDetails }: {
  vm: W3RideWrapVm
  onShare?: () => void
  /** The way out. Without it this screen has none — the detail below hides its
   *  own back arrow in celebrate mode, so the rider is stuck on the page. */
  onClose?: () => void
  /** Claim the coins, HERE. Never a navigation. */
  onUnlock?: () => void
  /** The full analysis, the same page a past ride opens. */
  onDetails?: () => void
}) {
  const reduce = useReducedMotion()
  const [mapReady, setMapReady] = useState(false)

  // ── THE CELEBRATION, FIRED ONCE ────────────────────────────────────────
  // A ride landing is the one moment in this app that has earned confetti, and
  // it fired none: nothing in this component or the page above it ever called
  // it. It runs on MOUNT (this component only exists in celebrate mode) and the
  // ref makes a re-render from a late scene or a resolved query unable to
  // re-fire it. Reduced motion silences the confetti and KEEPS the haptic —
  // turning animation down is not a reason to lose the confirmation.
  const firedRef = useRef(false)
  useEffect(() => {
    if (firedRef.current) return
    firedRef.current = true
    hapticCelebrate()
    if (reduce) return
    const cancel = fireConfetti()
    return () => cancel?.()
  }, [reduce])

  return (
    <div style={{
      position: 'relative', height: '100dvh', width: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', fontFamily: FONT, background: T.bg,
    }}>

      {/* ── THE MAP, AS THE GROUND ────────────────────────────────────────
          The ride's own route on the real basemap, filling the screen. A bare
          line on black is a diagram; the streets are what make it a place the
          rider recognises and therefore a picture worth posting.
          `RouteSketch` stays as the pre-paint fallback — and permanently if the
          tiles never arrive — because a ride screen without its route is not a
          slower screen, it is a broken one. */}
      {vm.polyline && vm.polyline.length > 1 && (
        <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', inset: 0 }}>
            <Suspense fallback={null}>
              <RouteMap
                polyline={vm.polyline}
                styleKey="dark"
                interactive={false}
                onReady={() => setMapReady(true)}
                palette={W3_MAP}
                lineColor={T.acid}
                lineWidth={6}
                startColor={T.ink}
                endColor={T.acid}
                // Clear of the action band, or the licence notice sits behind a
                // button — which is the one thing the licence asks for.
                attributionBottom={210}
                className="w3-ride-map" />
            </Suspense>
          </div>
          {!mapReady && (
            <div style={{
              position: 'absolute', left: 0, right: 0, top: '24%', bottom: 0,
              display: 'flex', alignItems: 'center',
            }}>
              <RouteSketch
                polyline={vm.polyline}
                width={390} height={420} renderHeight={560}
                fluid color={T.acid} strokeWidth={4} halo endpoints pad={16}
                ariaLabel="Deine Strecke" />
            </div>
          )}
          <div style={{
            position: 'absolute', inset: 0,
            background: `linear-gradient(180deg, ${T.bg} 0%, ${T.bg}D9 20%, ${T.bg}00 44%, ${T.bg}D9 72%, ${T.bg} 88%)`,
          }} />
        </div>
      )}

      {onClose && (
        <button type="button" onClick={onClose} aria-label="Schließen"
          style={{
            position: 'absolute', top: 'calc(12px + env(safe-area-inset-top))', right: 16, zIndex: 5,
            width: 36, height: 36, borderRadius: 100, border: 0, cursor: 'pointer',
            background: T.glass, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
            display: 'grid', placeItems: 'center',
          }}>
          <X size={17} color={T.ink} strokeWidth={2.4} />
        </button>
      )}

      {/* ── THE TOP: whose ride, what the coach makes of it, the number ── */}
      <div style={{
        position: 'relative', display: 'flex', flexDirection: 'column', gap: 14,
        padding: `calc(16px + env(safe-area-inset-top)) 20px 0`,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingRight: 44 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, color: T.acid, ...TNUM }}>{vm.chapter}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 1.4, color: T.mid,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{vm.route}</span>
          </div>
          <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, color: T.quiet, ...TNUM }}>{vm.when}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 25, fontWeight: 700, letterSpacing: -0.9, lineHeight: 1.14, color: T.ink }}>{vm.lead}</span>
          {vm.emphasis && (
            <span style={{ fontSize: 25, fontWeight: 700, letterSpacing: -0.9, lineHeight: 1.14, color: T.acid }}>{vm.emphasis}</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <motion.span
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={grow(0.05)}
            style={{ fontSize: 62, fontWeight: 700, letterSpacing: -2.6, lineHeight: 0.92, color: T.acid, ...TNUM }}>
            {vm.heroValue}
          </motion.span>
          <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.4, color: T.acid, ...TNUM }}>{vm.heroUnit}</span>
        </div>

        {vm.chip && (
          <span style={{
            alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 100, background: T.glass,
            backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: 100, background: T.acid }} />
            <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, color: T.ink }}>{vm.chip}</span>
          </span>
        )}
      </div>

      {/* The route breathes here — the one place on the screen with nothing on
          it, which is what makes the rest read as composed rather than packed. */}
      <div style={{ flex: 1, minHeight: 0 }} />

      {/* ── THE BOTTOM: the numbers, the reward, the way deeper ───────── */}
      <div style={{
        position: 'relative', display: 'flex', flexDirection: 'column', gap: 12,
        padding: `0 20px calc(16px + env(safe-area-inset-bottom))`,
      }}>
        {vm.stats.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            {vm.stats.slice(0, 3).map((s, i) => <StatTile key={s.key} s={s} i={i} reduce={reduce} />)}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
          <motion.button
            onClick={
              vm.rewardRc == null || vm.claimState === 'claimed' ? onShare
                : vm.claimState === 'claiming' ? undefined
                : onUnlock
            }
            disabled={vm.claimState === 'claiming'}
            initial={reduce ? false : { scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={grow(0.18)}
            style={{
              flex: 1, minWidth: 0, height: 56, borderRadius: 100, border: 0,
              cursor: vm.claimState === 'claiming' ? 'default' : 'pointer',
              background: vm.claimState === 'claimed' ? `${T.ink}14` : T.acid,
              boxShadow: vm.claimState === 'claimed' ? 'none' : `0 8px 28px ${T.acid}40`,
              backdropFilter: vm.claimState === 'claimed' ? 'blur(12px)' : undefined,
              fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
            }}>
            {/* THE RECEIPT REPLACES THE OFFER IN PLACE. The rider pressed for
                coins; showing them landing here is the confirmation, and a
                second screen to press a second button was a step that existed
                only because the code was split that way. */}
            {vm.claimState === 'claimed' ? (
              <>
                <Check size={17} color={T.acid} strokeWidth={2.8} />
                <span style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: -0.2, color: T.ink }}>
                  {vm.rewardRc != null ? `${vm.rewardRc} RC gutgeschrieben` : 'Gutgeschrieben'}
                </span>
              </>
            ) : (
              <>
                <span style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: -0.2, color: T.bg }}>
                  {vm.rewardRc == null ? 'Fahrt teilen'
                    : vm.claimState === 'claiming' ? 'Wird gutgeschrieben…'
                    : 'Belohnung einlösen'}
                </span>
                {vm.rewardRc != null && vm.claimState === 'idle' ? (
                  // THE AMOUNT IS ON THE BUTTON. "Belohnung einlösen" with the
                  // figure on it is a different button from one without — the
                  // number is the reason to press.
                  <span style={{
                    fontSize: 13, fontWeight: 700, padding: '4px 9px', borderRadius: 100,
                    background: `${T.bg}1F`, color: T.bg, ...TNUM,
                  }}>{vm.rewardRc} RC</span>
                ) : vm.rewardRc == null ? (
                  <ArrowRight size={17} color={T.bg} strokeWidth={2.6} />
                ) : null}
              </>
            )}
          </motion.button>

          {/* Secondary, adjacent and the same height: one primary per screen,
              its partner within the same thumb band. */}
          {vm.rewardRc != null && (
            <button type="button" onClick={onShare} aria-label="Fahrt teilen"
              style={{
                width: 56, height: 56, flex: 'none', borderRadius: 100, border: 0, cursor: 'pointer',
                background: `${T.ink}14`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                display: 'grid', placeItems: 'center',
              }}>
              <Share2 size={19} color={T.ink} strokeWidth={2.2} />
            </button>
          )}
        </div>

        {onDetails && (
          <button type="button" onClick={onDetails}
            style={{
              alignSelf: 'center', background: 'transparent', border: 0, cursor: 'pointer',
              fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: T.quiet,
              textDecoration: 'underline', textUnderlineOffset: 3, padding: '4px 8px',
            }}>
            Fahrt-Details
          </button>
        )}
      </div>
    </div>
  )
}
