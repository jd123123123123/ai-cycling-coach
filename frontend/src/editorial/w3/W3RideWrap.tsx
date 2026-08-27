import { useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Share2, X } from 'lucide-react'
import { T, FONT, grow } from './w3tokens'
import { TNUM } from './w3surfaces'
import RouteSketch from '../../components/ui/RouteSketch'
import { fireConfetti } from '../../lib/confetti'
import { hapticCelebrate } from '../../lib/haptics'

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
}

function StatTile({ s, i, reduce }: { s: W3WrapStat; i: number; reduce: boolean | null }) {
  const tint = s.best ? T.acid : T.ink
  return (
    <div style={{
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6,
      padding: '12px 12px 11px', borderRadius: 16,
      // Glass, because it sits on the route rather than on the ground — a
      // solid tile here would punch three holes in the picture.
      background: `${T.bg}A6`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    }}>
      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, color: T.quiet }}>{s.label}</span>
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
  /** Open the chest. The reason the rider is here. */
  onUnlock?: () => void
  /** The full analysis, the same page a past ride opens. */
  onDetails?: () => void
}) {
  const reduce = useReducedMotion()

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

      {/* ── THE ROUTE, AS THE GROUND ──────────────────────────────────────
          The ride's own track fills the lower two thirds and everything below
          the hero stands on it. A scrim keeps the headline legible at the top
          and hands the picture back in the middle, where the line actually is. */}
      {vm.polyline && vm.polyline.length > 1 && (
        <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {/* `fluid` gives 100% width and `renderHeight` the CSS height, so the
              drawing SCALES rather than re-projecting — the track keeps its real
              geographic aspect and simply fills more of the ground. Without a
              height it drew at its natural aspect and floated mid-screen. */}
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
            onClick={vm.rewardRc != null ? onUnlock : onShare}
            initial={reduce ? false : { scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={grow(0.18)}
            style={{
              flex: 1, minWidth: 0, height: 56, borderRadius: 100, border: 0, cursor: 'pointer',
              background: T.acid, boxShadow: `0 8px 28px ${T.acid}40`,
              fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
            }}>
            <span style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: -0.2, color: T.bg }}>
              {vm.rewardRc != null ? 'Belohnung einlösen' : 'Fahrt teilen'}
            </span>
            {vm.rewardRc != null ? (
              // THE AMOUNT IS ON THE BUTTON. "Belohnung einlösen" with the
              // figure on it is a different button from one without — the
              // number is the reason to press.
              <span style={{
                fontSize: 13, fontWeight: 700, padding: '4px 9px', borderRadius: 100,
                background: `${T.bg}1F`, color: T.bg, ...TNUM,
              }}>{vm.rewardRc} RC</span>
            ) : (
              <ArrowRight size={17} color={T.bg} strokeWidth={2.6} />
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
