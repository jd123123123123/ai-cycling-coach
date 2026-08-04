import type { CSSProperties } from 'react'

/**
 * The card treatment from the pencil frame "V4 · Route Forecast (GPX)",
 * transcribed rather than approximated.
 *
 * ── Why this exists next to glassCard.ts ─────────────────────────────────
 * `glassCard` is Today's treatment: 72% tint, blur 14, tuned to sit over the
 * animated road behind <main>. This frame specifies its own: `#14181DE6`
 * (90%), a 1px `#FFFFFF14` hairline and `background_blur: 10`. Close, but not
 * the same, and "close" is exactly what made the first rebuild of this page
 * look flatter than its design — flat `var(--color-paper-2)` with a solid
 * `--color-rule` border reads as a slab where the frame reads as glass.
 *
 * Transcribed values, not tokens, on purpose: the frame's alphas
 * (`E6`, `14`, `0F`, `8C`, `59`) have no equivalents in the token set, and
 * rounding them to the nearest token is precisely the drift this file exists
 * to stop. When the frame changes, this changes.
 */

/** Does the runtime actually blur what is behind the card? */
function supportsBlur(): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false
  return (
    CSS.supports('backdrop-filter', 'blur(1px)') ||
    CSS.supports('-webkit-backdrop-filter', 'blur(1px)')
  )
}

const BLUR = supportsBlur()

/**
 * The frame's card: 90% dark, hairline rim, 20px radius, blurred backdrop.
 *
 * Without `backdrop-filter` the fill goes fully opaque instead of leaving a
 * 90% tint over an unblurred background — a translucent card with nothing
 * blurred behind it is a legibility risk, not a style.
 */
export const penCard: CSSProperties = {
  background: BLUR ? '#14181DE6' : '#14181D',
  border: '1px solid #FFFFFF14',
  borderRadius: 20,
  ...(BLUR
    ? { backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }
    : {}),
}

/** Section eyebrow: 11px / 800 / 1.5 letter-spacing. Colour is per-card. */
export function penEyebrow(color: string): CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 1.5,
    color,
    textTransform: 'uppercase',
  }
}

/** The small stroked pill the frame puts in card headers. */
export const penPill: CSSProperties = {
  background: '#FFFFFF0F',
  border: '1px solid #FFFFFF14',
  borderRadius: 100,
  padding: '3px 9px',
}

/** The frame's hairline divider. */
export const penDivider: CSSProperties = {
  height: 1,
  background: '#FFFFFF14',
  width: '100%',
}

/** Footnote under a card's body: 10.5px / 500 / 1.4, half-strength white. */
export const penNote: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 500,
  lineHeight: 1.4,
  color: '#FFFFFF80',
  margin: 0,
}
