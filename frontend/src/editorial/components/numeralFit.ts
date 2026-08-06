/**
 * The owner's ruling (2026-08-05, plan commit f2f35b3): ONE numeral size,
 * 146/-9, on every screen — not the pen's three (this reverses the size
 * prop added in an earlier pass of this same task; see task-8-report.md).
 *
 * 146 is a ceiling, not a fixed value: Evening's numeral is a clock time
 * ("22:30", five glyphs) which does not fit the content column at 146px, so
 * it must shrink. Tracking scales with the resulting size so a shrunk
 * numeral keeps the same optical tightness as the full-size one.
 *
 * CORRECTED (design pass, 2026-08-06): `CONTENT_W` was 342 (390 frame minus
 * the pen's own 24px padding on each side) — `Cover.tsx`'s own design-pass
 * fix widened that padding to 32px each side for photographic air, so the
 * real column is 326px, not 342. Left at the old value this ceiling would
 * quietly overestimate how much room a shrinking numeral or headline
 * actually has.
 */
export const NUMERAL_MAX = 146 // the one size, ruled 2026-08-05
export const TRACKING_RATIO = -9 / NUMERAL_MAX
export const CONTENT_W = 326 // 390 frame - 32 padding * 2
export const GLYPH_RATIO = 0.62 // Sora 800 digit advance, in em

/** One size, shrunk only when the glyphs would not fit the frame. */
export function numeralFit(text: string): { fontSize: number; letterSpacing: number } {
  const glyphs = [...text].length
  const fits = CONTENT_W / (glyphs * GLYPH_RATIO)
  const fontSize = Math.min(NUMERAL_MAX, Math.floor(fits))
  return { fontSize, letterSpacing: Math.round(fontSize * TRACKING_RATIO * 10) / 10 }
}

/**
 * Real-data audit (2026-08-06): a real session title ("MAP — 5×3min @ 110%
 * FTP", 24 characters) wraps to two lines at the pen's flat 42px hero
 * headline size and collides with the Day Rail above it (`pages/
 * TodayView.tsx`'s hero — `Cover.tsx` deliberately carries NO gap between
 * its Meta/DayRail block and this one, matching the pen exactly, so a
 * taller two-line headline eats directly into that already-zero gap). The
 * pen's own headline node (`t3veYB`/`wokdA`, "Threshold") IS `textGrowth:
 * fixed-width` — wrapping is the pen's own spec, not something this build
 * invented — but the pen's own mock content was always one short word, so
 * the pen never had to answer what happens when it wraps. Truncating the
 * title was ruled out (the session name is information the athlete reads,
 * not decoration), so the headline gets the same shrink-to-fit rule
 * `numeralFit` above already established for the hero numeral: ONE size
 * (42px) as a ceiling, stepped down only far enough that realistic titles
 * still fit on one line, never truncated. 0.56em is a looser average glyph
 * advance than `numeralFit`'s own 0.62 (all-digit numerals run wider per
 * glyph, on average, than mixed-case prose in Sora 800). 26px is a floor —
 * short of that, two lines at 26px reads better than an illegibly small
 * one line.
 */
export const HEADLINE_MAX = 42
export const HEADLINE_MIN = 26
export const HEADLINE_TRACKING_RATIO = -2 / HEADLINE_MAX
export const HEADLINE_GLYPH_RATIO = 0.56

export function headlineFit(text: string): { fontSize: number; letterSpacing: number } {
  const glyphs = [...text].length
  if (glyphs === 0) return { fontSize: HEADLINE_MAX, letterSpacing: -2 }
  const fits = CONTENT_W / (glyphs * HEADLINE_GLYPH_RATIO)
  const fontSize = Math.max(HEADLINE_MIN, Math.min(HEADLINE_MAX, Math.floor(fits)))
  return { fontSize, letterSpacing: Math.round(fontSize * HEADLINE_TRACKING_RATIO * 10) / 10 }
}
