import { useEffect, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { Gift, Star } from 'lucide-react'
import { T, FONT, DASH } from './w3tokens'
import W3ReadinessSpectrum from './W3ReadinessSpectrum'

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

/** Seven bars, already normalised 0–1, plus the hue the last one lights in.
 *  Structurally identical to the view's `W3Spark`, declared here rather than
 *  imported because the view imports this file and a cycle helps nobody. */
/** The card's fixed height. The row animates to it, so it lives beside the
 *  card rather than as a number repeated in two places. */
const STAT_CARD_H = 108

/** What an absent series draws: a flat, dim track at the height the real bars
 *  would occupy, so three cards stay the same size whether or not the rider
 *  has history for all three. */
const EMPTY_TRACK = [0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18]

export interface W3DockSpark { bars: number[]; hi: string }

export interface W3DockStat {
  /** The trend line under the value — "+9 auf den Basiswert". Optional: it is
   *  the evidence, and evidence we do not have is left out rather than dashed. */
  note?: string | null
  /** The colour that trend deserves. Falls back to quiet. */
  noteHue?: string
  label: string
  /** Already formatted and localised, or null → an em dash. Never a padded 0. */
  value: string | null
  /** "ms" · "bpm" · "Std" — set small on the baseline beside the value. */
  unit?: string | null
  /** The metric's own last seven readings. NULL draws an empty track rather
   *  than an invented shape: a card that fakes a trend is worse than a card
   *  that admits it has none. */
  spark?: W3DockSpark | null
}

export interface W3DockVm {
  /** The gated readiness score, or null when the gate withheld it. */
  score: number | null
  /** The one-word verdict ("Grünes Licht"). Null → the state line is omitted. */
  state: string | null
  /** Why there is no score, in the rider's language. Shown ONLY when
   *  `score == null`, and it is the whole reason the dock still renders. */
  scoreNote: string | null
  /** Readiness vs the previous dated reading ("+6 ggü. gestern"), or null.
   *  Only ever set when the score above IS the reading the delta was computed
   *  on — the page guards that, the dock just draws it. */
  delta?: { text: string; favourable: boolean } | null
  /** The earn multiplier as "1.75×", or null → the bonus column is dropped. */
  bonus: string | null
  /** The ladder behind the bonus ("14 Tage Streak · noch 6 bis 1,5×"), or
   *  null. Revealed with the working, not on first sight: a multiplier with a
   *  visible next rung is a goal gradient; without one it is just a number. */
  bonusWhy?: string | null
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
  compact?: boolean
  planLabel?: string | null
  expand?: number
}

export default function W3TodayDock({ vm, onOpen }: {
  vm: W3DockVm
  onOpen?: () => void
}) {
  // Clamped here rather than at the call site: a scroll value that overshoots
  // would otherwise animate the panel past its own open state.
  const [detailsOpen, setDetailsOpen] = useState(false)
  const open = vm.compact ? Number(detailsOpen) : Math.max(0, Math.min(1, vm.expand ?? 0))
  const reduce = useReducedMotion()
  const hue = vm.score != null ? scoreHue(vm.score) : T.heroOff
  const shown = useCountUp(vm.score ?? 0, reduce)

  return (
    <div>
    <button
      onClick={vm.compact ? () => setDetailsOpen(!detailsOpen) : onOpen}
      aria-expanded={vm.compact ? detailsOpen : undefined}
      aria-label="Bereitschaft im Detail"
      style={{
        width: '100%', border: 0, textAlign: 'left', cursor: vm.compact || onOpen ? 'pointer' : 'default',
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
            fontFamily: ARCHIVO, fontSize: vm.compact ? 36 : 44, fontWeight: 700, lineHeight: 0.86,
            color: hue, fontVariantNumeric: 'tabular-nums', flex: 'none',
          }}>{shown}</span>
        ) : (
          <span style={{
            fontFamily: ARCHIVO, fontSize: vm.compact ? 36 : 44, fontWeight: 700, lineHeight: 0.86,
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
          {/* Trend beats snapshot for a daily ritual: the same score means a
              different morning after a 78 than after a 52. Quiet on purpose —
              the sign carries the direction, no second colour needed. */}
          {!vm.compact && vm.score != null && vm.delta && (
            <span style={{
              fontSize: 10.5, fontWeight: 600, color: T.heroMid, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
            }}>{vm.delta.text}</span>
          )}
        </div>

        {vm.compact && vm.planLabel ? <span style={{ maxWidth: 110, textAlign: 'right', color: T.ink, fontSize: 12, lineHeight: 1.3 }}>{vm.planLabel}</span> : vm.bonus && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end', flex: 'none' }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.heroMid }}>BONUS</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Star size={12} color={T.ink} fill={T.ink} />
              <span style={{ fontFamily: ARCHIVO, fontSize: 15, fontWeight: 700, color: T.ink }}>{vm.bonus}</span>
            </span>
          </div>
        )}
      </div>

      <W3ReadinessSpectrum score={vm.score} />

      {/* ── the ladder behind the bonus ── */}
      {/* Part of the working, so it opens with the working: the next rung is
          what turns the ★ multiplier from a stamp into something to keep. */}
      {vm.bonus && vm.bonusWhy && (
        <div style={{ height: open * 14, opacity: open, overflow: 'hidden' }} aria-hidden={open < 0.2}>
          <span style={{
            fontSize: 10.5, fontWeight: 600, color: T.heroMid,
            fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
          }}>{vm.bonusWhy}</span>
        </div>
      )}

      {/* ── the three overnight signals ── */}
      {/* THE WORKING BEHIND THE NUMBER, revealed by scrolling rather than by
          navigating. Height and opacity are driven together so the row grows
          out of the panel instead of appearing on top of it — and at `open: 0`
          it occupies nothing at all, so the closed panel is genuinely small
          rather than merely transparent. */}
      {(vm.compact || vm.showStats !== false) && (
      <div aria-hidden={open < 0.2} style={{
        display: 'flex', gap: 10, width: '100%',
        height: open * STAT_CARD_H, opacity: open, overflow: 'hidden',
        marginTop: open * 4, pointerEvents: open > 0.6 ? 'auto' : 'none',
      }}>
        {vm.stats.map((s) => (
          <div key={s.label} style={{
            flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
            gap: 7, padding: '11px 12px 10px', borderRadius: 16,
            background: T.heroDock, height: STAT_CARD_H,
          }}>
            <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.1, color: T.heroMid }}>{s.label}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, minWidth: 0 }}>
              <span style={{
                fontFamily: ARCHIVO, fontSize: 22, fontWeight: 700, lineHeight: 1,
                color: s.value ? T.ink : T.heroOff, fontVariantNumeric: 'tabular-nums',
                minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{s.value ?? DASH}</span>
              {s.value && s.unit && (
                <span style={{ fontSize: 10, fontWeight: 700, color: T.heroMid, flex: 'none' }}>{s.unit}</span>
              )}
            </div>
            {/* THE TREND, DRAWN RATHER THAN DESCRIBED. The row printed the
                delta as a sentence and nothing else, so three different shapes
                of week — a steady climb, a crash and a rebound, a flat line —
                all read as the same "+9". Seven bars say which it was before a
                word is read, and the last one lights because today is the one
                the rider is standing in. */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 22, flex: 'none' }}>
              {(s.spark?.bars ?? EMPTY_TRACK).slice(-7).map((b, i, all) => (
                <div key={i} style={{
                  flex: 1, minWidth: 0, borderRadius: 2,
                  height: Math.max(3, Math.round(b * 22)),
                  background: s.spark
                    ? (i === all.length - 1 ? (s.spark.hi ?? T.acid) : T.heroOff)
                    : T.heroOff,
                  opacity: s.spark ? 1 : 0.45,
                }} />
              ))}
            </div>
            {s.note && (
              <span style={{
                fontSize: 9.5, fontWeight: 700, lineHeight: 1.2,
                color: s.noteHue ?? T.heroMid, minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{s.note}</span>
            )}
          </div>
        ))}
      </div>
      )}
    </button>
    {vm.compact && detailsOpen && onOpen && <button type="button" onClick={onOpen} style={{ display: 'block', margin: '8px auto 0', padding: '8px 12px', background: 'none', border: 0, color: T.mid, fontFamily: FONT, fontSize: 12, cursor: 'pointer' }}>Alle Bereitschaftsdetails →</button>}
    </div>
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
