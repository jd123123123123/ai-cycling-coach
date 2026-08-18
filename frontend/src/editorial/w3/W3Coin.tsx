import { useId } from 'react'
import { T, FONT } from './w3tokens'
import { TNUM } from './w3surfaces'

/**
 * W3 · The RideCoin mark.
 *
 * Replaces lucide's generic `Coins` glyph, which was a grey outline of two
 * stacked discs — it said "money" in the abstract and nothing about this app,
 * and at a price pill's 12px it collapsed into a smudge.
 *
 * THE MOTIF IS A CHAINRING, not a coin with a currency letter on it. A ring
 * with a spider centre and five bolt holes is instantly a bicycle part at any
 * size, and it is the one piece of a bike that literally converts effort into
 * motion — which is exactly what RideCoin does with TSS. A "₡"-style letterform
 * would have needed a typeface decision and would still have read as fake money.
 *
 * WHY IT SURVIVES 12px. The whole mark is a filled disc with round holes
 * punched in it, so its silhouette carries the meaning: even when the holes
 * blur together the shape stays a solid lime coin, and it never turns into the
 * grey mush a stroked icon becomes. Everything decorative (the rim, the
 * specular arc) is drawn UNDER the holes and fades out first. The teeth are
 * deliberately shallow for the same reason — at small sizes they read as a
 * slightly soft edge rather than noise.
 *
 * The engraving is `acidDeep` rather than the page background: a coin whose
 * holes are punched through to the page breaks the moment it sits on a lime
 * button or a light sheet. Engraved, it is self-contained on any surface.
 */

export interface W3CoinProps {
  /** Rendered size in px. Designed at 32; legible from 12 to 96. */
  size?: number
  /** Greyed out — for a price the rider cannot currently afford. Keeps the
   *  exact same geometry so the coin doesn't appear to change shape. */
  muted?: boolean
  /**
   * Which ground the coin is sitting on.
   *
   * `dark` exists because the buy button is a solid acid slab, and a lime coin
   * on a lime button disappeared — only its engraving survived, so the CTA read
   * as "KAUFEN FÜR 700" with a smudge in front of it. On acid, the coin inverts
   * to a struck-black token with lime engraving instead.
   */
  tone?: 'acid' | 'dark'
  style?: React.CSSProperties
}

export function W3Coin({ size = 16, muted = false, tone = 'acid', style }: W3CoinProps) {
  // Gradients are per-instance: two coins on one screen sharing an id makes the
  // second one inherit the first's stops.
  const uid = useId().replace(/:/g, '')
  // Muted uses `mid`/`quiet` rather than `quiet`/`surface2`: on the disabled
  // CTA's own grey the darker pair was very nearly invisible.
  const face = muted ? T.mid : tone === 'dark' ? T.bg : T.acid
  const deep = muted ? T.quiet : tone === 'dark' ? T.acidDeep : T.acidDeep

  // Five bolt holes on a chainring spider, starting at 12 o'clock.
  const holes = [-90, -18, 54, 126, 198].map((deg) => {
    const rad = (deg * Math.PI) / 180
    return { x: 16 + Math.cos(rad) * 8.2, y: 16 + Math.sin(rad) * 8.2 }
  })

  return (
    <svg
      width={size} height={size} viewBox="0 0 32 32" fill="none"
      style={{ flex: 'none', display: 'block', ...style }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`c${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={face} />
          <stop offset="100%" stopColor={deep} />
        </linearGradient>
      </defs>

      {/* Teeth — a dashed ring sitting just proud of the disc. Shallow on
          purpose: at 12px they should soften the edge, not serrate it. */}
      <circle
        cx="16" cy="16" r="15.1" fill="none" stroke={deep}
        strokeWidth="1.8" strokeDasharray="1.9 2.1"
      />
      {/* The disc */}
      <circle cx="16" cy="16" r="14.2" fill={`url(#c${uid})`} />
      {/* Inner bevel, so the face reads as recessed inside a rim */}
      <circle cx="16" cy="16" r="12.1" fill="none" stroke={deep} strokeWidth="0.9" opacity="0.55" />
      {/* Specular arc, top-left — the one cue that says "metal" rather than
          "flat circle". Drawn before the holes so it never crosses them. */}
      <path
        d="M6.6 10.2A11.6 11.6 0 0 1 16 4.4"
        stroke={T.ink} strokeOpacity="0.5" strokeWidth="1.6" strokeLinecap="round" fill="none"
      />

      {/* Chainring spider: centre bore + five bolt holes */}
      <circle cx="16" cy="16" r="3.7" fill={deep} />
      {holes.map((h, i) => (
        <circle key={i} cx={h.x} cy={h.y} r="2.15" fill={deep} />
      ))}
    </svg>
  )
}

/**
 * A price/balance as the shop prints it: the coin, then the number.
 *
 * One component so that every RideCoin figure in the app has the same coin-to-
 * numeral gap and the same tabular numerals — a balance that reflows its
 * neighbours by a pixel every time it ticks is the sort of detail that reads as
 * cheap without anyone being able to say why.
 */
export function W3Price({
  amount, size = 16, muted = false, bold = true, color, style,
}: {
  amount: number
  size?: number
  muted?: boolean
  bold?: boolean
  color?: string
  style?: React.CSSProperties
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.34, ...style }}>
      <W3Coin size={size} muted={muted} />
      <span style={{
        ...TNUM,
        fontFamily: FONT,
        fontSize: size * 0.92,
        fontWeight: bold ? 700 : 600,
        letterSpacing: -0.3,
        color: color ?? (muted ? T.quiet : T.ink),
      }}>
        {amount.toLocaleString('de-DE')}
      </span>
    </span>
  )
}

export default W3Coin
