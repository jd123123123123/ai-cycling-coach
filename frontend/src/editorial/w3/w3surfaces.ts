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
export const lux = (radius = 28) => ({
  // ── THE HERO'S LANGUAGE, APPLIED TO EVERY CARD ─────────────────────────
  //
  // The hero is the best surface in the app and it does none of what this
  // helper used to do. The bike stands in a room; the readiness panel sits ON
  // that room as a single flat tone with a big radius and NO EDGE AT ALL.
  // Nothing up there is framed, and that is exactly why it reads as expensive:
  // depth comes from light and from a tone step, never from a drawn line.
  //
  // This used to be a five-stop gradient, a hairline border and an inset top
  // highlight — an object rendered as a physical bevel. Held next to the hero
  // it is the older, busier idiom: every card announced its own edges, so a
  // screen of cards read as a stack of boxes instead of as things lying on one
  // surface.
  //
  // Flat tone, generous radius, one soft shadow for lift. `radius` defaults to
  // 28 to match the readiness panel, so a card further down the page and the
  // panel under the bike are recognisably the same object.
  background: T.heroDock,
  borderRadius: radius,
  boxShadow: '0 2px 10px #00000040',
  display: 'flex',
  flexDirection: 'column' as const,
  width: '100%',
})

/** A nested tile inside a `lux` card — one step brighter, never bordered.
 *  20 rather than 16, so a tile inside a 28 card keeps the same family of
 *  curvature instead of reading as a sharper object pasted into a softer one. */
export const luxTile = (radius = 20) => ({
  background: T.tile,
  borderRadius: radius,
  display: 'flex',
  flexDirection: 'column' as const,
})

/** Hairline divider, INSET from the card's padding so it reads as a rule
 *  between blocks rather than a seam splitting the card in two. */
export const hairline = (inset = 0) => ({
  // KEPT, BUT QUIETER. With the card's own border gone, a divider at the old
  // weight became the loudest line on the screen — the one drawn edge in an
  // idiom that has none. It survives only where two blocks genuinely need
  // separating, at a weight that suggests rather than states.
  height: 1,
  background: T.rule,
  opacity: 0.55,
  margin: inset ? `0 ${inset}px` : undefined,
  flex: 'none' as const,
})

/** Numerals that change in place must not reflow their neighbours. */
export const TNUM = { fontVariantNumeric: 'tabular-nums' as const }
