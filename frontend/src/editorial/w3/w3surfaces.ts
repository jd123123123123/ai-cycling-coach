import { T } from './w3tokens'

/**
 * W3 · the surface + rhythm primitives.
 *
 * These live in their OWN module rather than in `w3tokens.tsx` on purpose:
 * that file exports the `Kicker` component, so every additional constant it
 * carries adds another `react-refresh/only-export-components` error. A pure
 * `.ts` module with no components is exempt from the rule entirely.
 */

// ── Spacing scale ───────────────────────────────────────────────────────────
// One rhythm, so a screen reads as composed rather than assembled. Ad-hoc gaps
// (7, 9, 11, 13…) are what make an otherwise good layout feel cheap: the eye
// registers the inconsistency long before it can name it.
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, section: 28 } as const

/**
 * The LUXURY surface: a card that is lit, not filled.
 *
 * A flat `#161616` rectangle on a `#0B0B0B` page is a shape; a surface with a
 * top-lit vertical gradient and a hairline edge is an object. The gradient is
 * deliberately tiny (5 levels) — enough for the eye to read a light source,
 * far below the threshold where it looks like a "glossy" 2010s panel. The
 * inset top highlight is what sells the edge as a physical bevel.
 */
export const lux = (radius = 24) => ({
  background: `linear-gradient(180deg, ${T.cardTop} 0%, ${T.cardMid} 62%, ${T.cardBot} 100%)`,
  border: `1px solid ${T.rule}`,
  boxShadow: 'inset 0 1px 0 #FFFFFF0A, 0 1px 2px #00000059',
  borderRadius: radius,
  display: 'flex',
  flexDirection: 'column' as const,
  width: '100%',
})

/** A nested tile inside a `lux` card — one step brighter, never bordered. */
export const luxTile = (radius = 16) => ({
  background: T.tile,
  borderRadius: radius,
  display: 'flex',
  flexDirection: 'column' as const,
})

/** Hairline divider, INSET from the card's padding so it reads as a rule
 *  between blocks rather than a seam splitting the card in two. */
export const hairline = (inset = 0) => ({
  height: 1,
  background: T.rule,
  margin: inset ? `0 ${inset}px` : undefined,
  flex: 'none' as const,
})

/** Numerals that change in place must not reflow their neighbours. */
export const TNUM = { fontVariantNumeric: 'tabular-nums' as const }
