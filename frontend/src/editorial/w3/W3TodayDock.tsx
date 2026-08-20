import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Gift, Star } from 'lucide-react'
import { T, FONT, EASE, DASH } from './w3tokens'

/**
 * W3 · Today — THE DOCK. A 1:1 rebuild of the pen's `Today Stats Dock`
 * (`P4hc7`, frame `qv4Aw`) and its `Ride Rewards Banner` sibling (`LwuP7`,
 * frame `YIU3g`) — the two things that can occupy Today's bottom slot.
 *
 * ONE flat panel, radius 28, no border and no gradient. That is deliberate and
 * it is the biggest single difference from the rest of the app: `lux()` cards
 * are LIT objects with a hairline edge, which is right for a scrolling list of
 * cards and wrong here, where the dock is the only panel on screen and the
 * stage above it is already carrying all the light.
 *
 * THREE DEPARTURES FROM THE PEN, all in service of not lying:
 *
 *  1. THE SCORE IS NOT ALWAYS LIME. The pen draws 88 in acid; a 54 drawn in
 *     acid would tell the rider they are good to go when they are not. The
 *     score and its meter take their hue from the value.
 *  2. NO SCORE, NO DOCK-AS-USUAL. Readiness is gated upstream by
 *     `utils/readinessGate` (the stale-wearable rule). When the gate withholds
 *     it, the dock says so in the same shape rather than drawing a 0 or an
 *     em dash inside a meter that implies a measurement happened.
 *  3. THE METER IS THE SCORE, NOT A PROGRESS BAR. 22 segments, filled from the
 *     real value. It fills once, left to right, on arrival — a bar that
 *     re-animates every time the rider scrolls back is what makes reveal
 *     effects tiring.
 */

/** The pen's meter: 22 segments, 3px apart, 10 tall, radius 2. */
const SEGMENTS = 22

const ARCHIVO = 'Archivo, "Inter Tight", sans-serif'

/** The hue a readiness score earns. Deliberately three bands, not a gradient:
 *  a rider needs to know which of three things today is, and a continuously
 *  shifting colour communicates a precision the number does not have.
 *
 *  The thresholds are NOT invented here — they are the boundaries the app's own
 *  `readinessWord` already uses (W3TodayPage: 80 Topfit / 65 Bereit / 45 Solide
 *  / 30 Locker / Ruhe), collapsed to three. A colour that disagreed with the
 *  word beside it would be worse than no colour at all. */
export function scoreHue(score: number): string {
  return score >= 65 ? T.acid : score >= 45 ? T.warn : T.bad
}

function useCountUp(target: number, reduce: boolean | null, ms = 720) {
  const [n, setN] = useState(reduce ? target : 0)
  useEffect(() => {
    if (reduce) { setN(target); return }
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms)
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, reduce, ms])
  return n
}

export interface W3DockStat {
  label: string
  /** Already formatted and localised, or null → an em dash. Never a padded 0. */
  value: string | null
}

export interface W3DockVm {
  /** The gated readiness score, or null when the gate withheld it. */
  score: number | null
  /** The one-word verdict ("Grünes Licht"). Null → the state line is omitted. */
  state: string | null
  /** Why there is no score, in the rider's language. Shown ONLY when
   *  `score == null`, and it is the whole reason the dock still renders. */
  scoreNote: string | null
  /** The earn multiplier as "1.75×", or null → the bonus column is dropped. */
  bonus: string | null
  /** The three overnight signals. Always three, so the row never reflows. */
  stats: [W3DockStat, W3DockStat, W3DockStat]
  /**
   * Whether the three overnight signals are drawn here.
   *
   * FALSE ON FIRST SIGHT. Today opens on one question — how am I today — and
   * the answer is a number and a meter. HRV, resting pulse and sleep are the
   * WORKING behind that answer, and printing them under it on the first screen
   * makes the rider read four numbers to learn one thing. They live just below
   * the fold instead, where scrolling is the gesture that asks "why".
   */
  showStats?: boolean
  /**
   * How far open the panel is, 0 → 1, driven by the page's own scroll.
   *
   * ONE PANEL THAT GROWS, rather than a compact panel with a second band
   * underneath it. The band was a separate surface, which meant a second edge
   * where its colour stopped — and the whole point of reading the stage's
   * ground colour is that the screen should have no edges to hide. Folding the
   * overnight signals INTO the panel removes the surface, and scrolling
   * becomes the gesture that asks "why 88" instead of a jump to another card.
   */
  expand?: number
}

export default function W3TodayDock({ vm, onOpen }: {
  vm: W3DockVm
  onOpen?: () => void
}) {
  // Clamped here rather than at the call site: a scroll value that overshoots
  // would otherwise animate the panel past its own open state.
  const open = Math.max(0, Math.min(1, vm.expand ?? 0))
  const reduce = useReducedMotion()
  const hue = vm.score != null ? scoreHue(vm.score) : T.heroOff
  const shown = useCountUp(vm.score ?? 0, reduce)
  const filled = vm.score != null ? Math.round((vm.score / 100) * SEGMENTS) : 0

  return (
    <button
      onClick={onOpen}
      aria-label="Bereitschaft im Detail"
      style={{
        width: '100%', border: 0, textAlign: 'left', cursor: onOpen ? 'pointer' : 'default',
        background: T.heroDock, borderRadius: 28,
        // SMALLER WHEN CLOSED. 16 all round pushed the panel up into the back
        // wheel; it breathes out again as it opens.
        padding: `${12 + open * 4}px 16px ${12 + open * 4}px`,
        display: 'flex', flexDirection: 'column', gap: 10, fontFamily: FONT,
      }}>

      {/* ── score · verdict · bonus ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%', minWidth: 0 }}>
        {vm.score != null ? (
          <span style={{
            fontFamily: ARCHIVO, fontSize: 44, fontWeight: 700, lineHeight: 0.86,
            color: hue, fontVariantNumeric: 'tabular-nums', flex: 'none',
          }}>{shown}</span>
        ) : (
          <span style={{
            fontFamily: ARCHIVO, fontSize: 44, fontWeight: 700, lineHeight: 0.86,
            color: T.heroOff, flex: 'none',
          }}>{DASH}</span>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.heroMid }}>
            BEREITSCHAFT
          </span>
          {/* The verdict when there is one; otherwise the reason there isn't —
              same slot, same size, so the dock never changes shape. */}
          <span style={{
            fontFamily: ARCHIVO, fontSize: 17, fontWeight: 700, color: vm.score != null ? T.ink : T.mid,
            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {vm.score != null ? (vm.state ?? DASH) : (vm.scoreNote ?? 'Noch keine Messung')}
          </span>
        </div>

        {vm.bonus && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end', flex: 'none' }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.heroMid }}>BONUS</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Star size={12} color={T.ink} fill={T.ink} />
              <span style={{ fontFamily: ARCHIVO, fontSize: 15, fontWeight: 700, color: T.ink }}>{vm.bonus}</span>
            </span>
          </div>
        )}
      </div>

      {/* ── the meter: the score itself, in 22 segments ── */}
      <div style={{ display: 'flex', gap: 3, height: 10, width: '100%' }} aria-hidden>
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <motion.span key={i}
            initial={reduce ? false : { opacity: 0.25 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: EASE, delay: i < filled ? i * 0.018 : 0 }}
            style={{
              flex: 1, height: 10, borderRadius: 2,
              background: i < filled ? hue : T.heroOff,
            }} />
        ))}
      </div>

      {/* ── the three overnight signals ── */}
      {/* THE WORKING BEHIND THE NUMBER, revealed by scrolling rather than by
          navigating. Height and opacity are driven together so the row grows
          out of the panel instead of appearing on top of it — and at `open: 0`
          it occupies nothing at all, so the closed panel is genuinely small
          rather than merely transparent. */}
      {vm.showStats !== false && (
      <div style={{
        display: 'flex', gap: 12, width: '100%',
        height: open * 44, opacity: open, overflow: 'hidden',
        marginTop: open * 2, pointerEvents: open > 0.6 ? 'auto' : 'none',
      }}>
        {vm.stats.map((s) => (
          <div key={s.label} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.heroMid }}>{s.label}</span>
            <span style={{
              fontFamily: ARCHIVO, fontSize: 17, fontWeight: 700,
              color: s.value ? T.ink : T.heroOff, fontVariantNumeric: 'tabular-nums',
              minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{s.value ?? DASH}</span>
          </div>
        ))}
      </div>
      )}
    </button>
  )
}

/**
 * The other thing that can occupy the bottom slot: a finished ride waiting to
 * be claimed (pen `LwuP7`). It REPLACES the dock rather than stacking above it
 * — a rider who has just ridden does not need this morning's readiness, and two
 * panels would make neither one the answer.
 */
export function W3RideRewardsBanner({ label = 'Neue Ride-Rewards', cta = 'ÖFFNEN', onOpen }: {
  label?: string
  cta?: string
  onOpen?: () => void
}) {
  return (
    <div style={{
      width: '100%', height: 64, borderRadius: 100, background: T.heroBg,
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '0 8px 0 22px', fontFamily: FONT,
    }}>
      <Gift size={22} color={T.ink} style={{ flex: 'none' }} />
      <span style={{
        flex: 1, minWidth: 0, fontSize: 17, fontWeight: 600, color: T.ink,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{label}</span>
      <button
        onClick={onOpen}
        style={{
          flex: 'none', height: 48, padding: '0 26px', borderRadius: 100, border: 0,
          background: T.acid, color: T.heroInk, cursor: 'pointer',
          fontFamily: ARCHIVO, fontSize: 15, fontWeight: 700, letterSpacing: 0.4,
        }}>{cta}</button>
    </div>
  )
}
