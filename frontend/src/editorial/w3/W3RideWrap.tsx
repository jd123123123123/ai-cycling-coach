import { useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, X } from 'lucide-react'
import { T, FONT, grow } from './w3tokens'
import { TNUM } from './w3surfaces'
import { fireConfetti } from '../../lib/confetti'
import { hapticCelebrate } from '../../lib/haptics'

/**
 * THE RIDE, WRAPPED — pen frame `tN23S` (W3 · 09 FAHRT · EDITORIAL).
 *
 * What a rider sees the moment they unlock a finished ride: their own machine
 * on the scene the ride earned, one sentence from the coach placing the ride in
 * their training, and the three numbers they would quote to somebody. The whole
 * ride detail scrolls underneath it — this is the lede, not a separate screen.
 *
 * THE HEADLINE IS THE POINT AND IT IS TWO WEIGHTS. `verdictSplit` cuts the
 * coach's sentence at its leftmost separator, and the second half goes acid:
 * "Deine schnellste Runde" / "seit Mai." The accent lands on what was actually
 * achieved, never merely on the last word.
 *
 * THE ACID IS `T.acid`, NOT THE PEN'S #C8FF00. That literal is the previous
 * editorial palette's lime and it is wrong here — `w3tokens` is the truth for
 * every W3 surface, and this frame sits next to screens that use it.
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
  ctaLabel: string
}

function StatTile({ s, i, reduce }: { s: W3WrapStat; i: number; reduce: boolean | null }) {
  const tint = s.best ? T.acid : T.ink
  return (
    <div style={{
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7,
      padding: '13px 12px 12px', borderRadius: 16, background: T.surface,
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

export default function W3RideWrap({ vm, hero, onShare, onClose }: {
  vm: W3RideWrapVm
  /** The bike on its scene. Whatever the hero room already renders. */
  hero?: React.ReactNode
  onShare?: () => void
  /** The way out. Without it this screen has none — the detail below hides its
   *  own back arrow in celebrate mode, so the rider is stuck on the page. */
  onClose?: () => void
}) {
  const reduce = useReducedMotion()

  // ── THE CELEBRATION, FIRED ONCE ────────────────────────────────────────
  // A ride landing is the one moment in this app that has earned confetti, and
  // it fired none: nothing in this component or the page above it ever called
  // it, so swiping the chest open produced a silent screen. It runs on MOUNT
  // (this component only exists in celebrate mode) and the ref makes a
  // re-render from a late scene or a resolved query unable to re-fire it.
  //
  // `fireConfetti` returns its own canceller and `hapticCelebrate` no-ops on a
  // platform without a vibrator, so neither needs a capability check here.
  // Reduced motion silences the confetti and KEEPS the haptic — the reason to
  // turn animation down is not a reason to lose the confirmation.
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
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', fontFamily: FONT, background: T.bg }}>

      {/* ── The machine, on the scene the ride earned ── */}
      {hero && (
        <div style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
          {hero}
          {vm.chip && (
            <div style={{
              position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 100,
              background: T.glass, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
            }}>
              <div style={{ width: 5, height: 5, borderRadius: 100, background: T.acid }} />
              <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, color: T.ink }}>{vm.chip}</span>
            </div>
          )}
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

      <div style={{ padding: '18px 20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Which ride this was, and when ── */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, color: T.acid, ...TNUM }}>{vm.chapter}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 1.4, color: T.mid,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{vm.route}</span>
          </div>
          <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, color: T.quiet, ...TNUM }}>{vm.when}</span>
        </div>

        {/* ── What the coach makes of it ── */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 27, fontWeight: 700, letterSpacing: -1, lineHeight: 1.12, color: T.ink }}>{vm.lead}</span>
          {vm.emphasis && (
            <span style={{ fontSize: 27, fontWeight: 700, letterSpacing: -1, lineHeight: 1.12, color: T.acid }}>{vm.emphasis}</span>
          )}
        </div>

        {/* ── The number a rider quotes ── */}
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

        {/* ── The three that fit beside it ── */}
        {vm.stats.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            {vm.stats.slice(0, 3).map((s, i) => <StatTile key={s.key} s={s} i={i} reduce={reduce} />)}
          </div>
        )}

        <button onClick={onShare} style={{
          width: '100%', height: 54, borderRadius: 100, border: 0, background: T.acid, cursor: 'pointer',
          fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: 1, color: T.bg }}>{vm.ctaLabel}</span>
          <ArrowRight size={17} color={T.bg} strokeWidth={2.6} />
        </button>
      </div>
    </div>
  )
}
