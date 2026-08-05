/**
 * The owner's ruling (2026-08-05, plan commit f2f35b3): ONE numeral size,
 * 146/-9, on every screen — not the pen's three (this reverses the size
 * prop added in an earlier pass of this same task; see task-8-report.md).
 *
 * 146 is a ceiling, not a fixed value: Evening's numeral is a clock time
 * ("22:30", five glyphs) which does not fit the 342px content column
 * (390px frame minus 24px padding on each side) at 146px, so it must
 * shrink. Tracking scales with the resulting size so a shrunk numeral
 * keeps the same optical tightness as the full-size one.
 */
export const NUMERAL_MAX = 146 // the one size, ruled 2026-08-05
export const TRACKING_RATIO = -9 / NUMERAL_MAX
export const CONTENT_W = 342 // 390 frame - 24 padding * 2
export const GLYPH_RATIO = 0.62 // Sora 800 digit advance, in em

/** One size, shrunk only when the glyphs would not fit the frame. */
export function numeralFit(text: string): { fontSize: number; letterSpacing: number } {
  const glyphs = [...text].length
  const fits = CONTENT_W / (glyphs * GLYPH_RATIO)
  const fontSize = Math.min(NUMERAL_MAX, Math.floor(fits))
  return { fontSize, letterSpacing: Math.round(fontSize * TRACKING_RATIO * 10) / 10 }
}
