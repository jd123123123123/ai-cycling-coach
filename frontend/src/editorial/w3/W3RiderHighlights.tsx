import { motion, useReducedMotion } from 'motion/react'
import { T, FONT, EASE } from './w3tokens'
import { TNUM } from './w3surfaces'

/**
 * RIDR · THE RIDER, as the deck builds a profile.
 *
 * WHAT THE OLD SCREEN WAS. A level pill, seven "monuments" each with its own
 * bespoke drawing, an engine block, a streak, a coin balance, a referral code
 * and a device list — a settings page with a portrait on top. Everything a
 * rider might ever want to check, which is a different screen from the one
 * they open to feel something.
 *
 * WHAT THE DECK DOES INSTEAD, and this follows it exactly:
 *
 *  · THE FIGURE IS THE PAGE. It stands on its own pale tinted ground, full
 *    bleed, with the handle riding on the seam — not framed in a card on a
 *    black page. The tint is what makes it a portrait rather than a readout.
 *  · METERS ARE RINGS. Tier and next milestone are arcs on a dark tile, the
 *    same instrument the deck uses for every progression it shows.
 *  · RECORDS ARE A BENTO OF TINTED CARDS, mixed sizes, the number enormous and
 *    the ride's own name under it. Four cards, not seven, and each one is a
 *    thing that happened rather than a lifetime total.
 *  · EVERYTHING ELSE IS GONE. Wallet, referral and devices are settings; a
 *    profile that lists them is a profile nobody opens twice.
 *
 * Pure function of props. Every value is real or the card is not drawn — a
 * celebration screen showing a personal best of zero is worse than one showing
 * three cards instead of four.
 */

export interface HighlightRecord {
  key: string
  /** Already formatted for display, including its thousands separators. */
  value: string
  unit: string
  label: string
  /** The ride it came from, or null. */
  ride: string | null
  when: string | null
}

export interface W3RiderHighlightsProps {
  avatarUrl: string | null
  handle: string
  role: string
  /** Lifetime totals, formatted. Shown as the two pills over the portrait. */
  pills: { v: string; l: string }[]
  tier: { label: string; pct: number; note: string }
  milestone: { pct: number; label: string; note: string } | null
  records: HighlightRecord[]
  /** Null while /achievements/mine is unresolved — the row is withheld. */
  badges: { unlocked: number; total: number; latest: string | null } | null
  onAllBadges?: () => void
  onRecord?: (key: string) => void
  /** Sends a rider with no figurine to the avatar studio. Without it the empty
   *  portrait is a dead end: the studio is reachable from the nav menu, but a
   *  rider looking at their own blank profile should not have to go hunting for
   *  the one action the screen is asking them to take. */
  onCreateRider?: () => void
}

function Ring({ pct, size = 62, label }: { pct: number; size?: number; label: string }) {
  const r = (size - 10) / 2
  const c = 2 * Math.PI * r
  const reduce = useReducedMotion()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke="rgba(255,255,255,0.10)" strokeWidth={7} />
          <motion.circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={T.acid} strokeWidth={7} strokeLinecap="round"
            strokeDasharray={c}
            initial={reduce ? false : { strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(1, pct))) }}
            transition={{ duration: 1.1, ease: EASE, delay: 0.15 }} />
        </svg>
        <span style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          fontSize: 15, fontWeight: 800, color: T.ink, ...TNUM,
        }}>{Math.round(pct * 100)}%</span>
      </div>
      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: T.quiet }}>
        {label}
      </span>
    </div>
  )
}

export default function W3RiderHighlights(p: W3RiderHighlightsProps) {
  const reduce = useReducedMotion()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', fontFamily: FONT }}>

      {/* ── THE FIGURE, ON ITS OWN GROUND ───────────────────────────────
          Full bleed on a pale tint, with the handle riding the seam. The deck
          never puts its characters in a card; the tinted ground IS the frame,
          and that is the single move that makes this a portrait rather than an
          avatar next to some statistics. */}
      <div style={{
        position: 'relative', width: '100%', aspectRatio: '1 / 1',
        background: `radial-gradient(120% 100% at 50% 15%, ${T.portraitHi} 0%, ${T.tintLilac} 55%, ${T.portraitLo} 100%)`,
        overflow: 'hidden',
      }}>
        {p.avatarUrl ? (
          <motion.img
            src={p.avatarUrl} alt=""
            initial={reduce ? false : { opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: EASE }}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <button
            onClick={p.onCreateRider}
            disabled={!p.onCreateRider}
            style={{
              position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', gap: 8,
              background: 'transparent', border: 0, fontFamily: FONT,
              cursor: p.onCreateRider ? 'pointer' : 'default',
            }}>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.4, color: T.tintInk }}>
                NOCH KEIN RIDER
              </span>
              {p.onCreateRider && (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: T.tintInk, opacity: 0.62 }}>
                  Im Studio aufnehmen
                </span>
              )}
            </span>
          </button>
        )}

        {/* The two lifetime figures, over the portrait, in the deck's own
            place: small, top-right, never competing with the face. */}
        <div style={{
          position: 'absolute', top: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 7,
          alignItems: 'flex-end',
        }}>
          {p.pills.map((s) => (
            <span key={s.l} style={{
              display: 'inline-flex', alignItems: 'baseline', gap: 6,
              padding: '7px 12px', borderRadius: 100, background: T.glass,
              // Glass, like every other pill this app floats on art. Flat
              // near-black over a helmet reads as a smudge, not a chip.
              backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
            }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: T.ink, ...TNUM }}>{s.v}</span>
              <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: 'rgba(255,255,255,0.6)' }}>
                {s.l}
              </span>
            </span>
          ))}
        </div>

        {/* The handle on the seam. */}
        {/* THE SCRIM HAS TO CLEAR THE JERSEY, not just the bottom edge. The
            portrait wears a W3 wordmark across the chest, and this gradient
            reached 0.86 only at the very bottom — so the handle was set over
            the middle of that wordmark and the two read as one smear. It starts
            higher and lands opaque, which is the difference between type on a
            picture and type in a picture. */}
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, padding: '86px 20px 18px',
          background: 'linear-gradient(180deg, rgba(11,11,12,0) 0%, rgba(11,11,12,0.72) 46%, rgba(11,11,12,0.96) 100%)',
          display: 'flex', flexDirection: 'column', gap: 3,
        }}>
          <span style={{ fontSize: 27, fontWeight: 800, letterSpacing: -0.9, color: T.ink }}>
            {p.handle}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, color: T.acid }}>
            {p.role.toUpperCase()}
          </span>
        </div>
      </div>

      {/* ── TIER AND WHAT IS NEXT ───────────────────────────────────────── */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: 16,
          borderRadius: 26, background: T.surface,
        }}>
          {/* TWO RINGS, TWO DIFFERENT CLAIMS. Both used to be labelled STUFE
              and the panel printed only ONE note — the milestone's, which
              shadowed the level's — so the screen showed two identical
              captions over two different percentages and never said how far
              the next level was. Each ring is named for what it measures, and
              each note is printed under its own. */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.2, color: T.quiet }}>
              DEIN STAND
            </span>
            <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.5, color: T.ink }}>
              {p.tier.label}
            </span>
            {p.tier.note && (
              <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.35, color: T.quiet }}>
                {p.tier.note}
              </span>
            )}
            {p.milestone?.note && (
              <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.35, color: T.quiet }}>
                {p.milestone.note}
              </span>
            )}
          </div>
          <Ring pct={p.tier.pct} label="LEVEL" />
          {p.milestone && <Ring pct={p.milestone.pct} label={p.milestone.label.toUpperCase()} />}
        </div>
      </div>

    </div>
  )
}
