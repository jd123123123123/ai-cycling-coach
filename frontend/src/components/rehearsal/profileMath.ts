/**
 * Pure helpers for RehearsalProfile — kept out of the component file because
 * this repo's eslint (react-refresh) forbids exporting non-components from a
 * component module.
 */

/**
 * Gradient → zone colour, for CLIMBING spans only (see `TERRAIN_FILL` below
 * for everything else). Used to be a straight mirror of `zone_for_gradient`
 * in `backend/app/services/climb_companion.py` (<3% z1, 3–6 z2, 6–9 z3,
 * 9–12 z4, >12 z5), which had two problems as a *drawing* palette:
 *
 * 1. `--color-zone-1` (#2A313A) is, in this app's dark theme, the same hex
 *    as `--color-surface-3` — indistinguishable from the card it's drawn
 *    on. Any segment landing in z1 painted invisible.
 * 2. A typical 6–9% alpine climb sits almost entirely in z2/z3 under those
 *    bands — amber (z4) and red (z5) were practically unreachable, so the
 *    steepest pitches on a route never actually read as the hardest colour.
 *
 * Rebalanced bands, climbing-only (this function is never called for a
 * flat/descending segment any more — those get `TERRAIN_FILL` regardless of
 * gradient, so there's no "below threshold" bucket to protect): a gentle
 * pitch reads green, a typical alpine grade splits green/lime/amber instead
 * of clustering in one bucket, and >=11% genuinely stands out red.
 */
export function zoneColorForGradient(gradientPct: number): string {
  if (gradientPct < 5.0) return 'var(--color-zone-2)' // gentle pitch
  if (gradientPct < 8.0) return 'var(--color-zone-3)' // moderate
  if (gradientPct < 11.0) return 'var(--color-zone-4)' // steep
  return 'var(--color-zone-5)' // very steep
}

/**
 * Neutral "ground" fill for the whole elevation silhouette. The terrain is
 * always drawn as one continuous shape in this colour first; climbing spans
 * are then tinted on top of it (see `zoneColorForGradient`). Deliberately
 * NOT a zone token or a surface token that could collide with the card
 * background behind the chart (that collision — `--color-zone-1` resolving
 * to the same hex as `--color-surface-3` — is exactly what made flats and
 * descents disappear before this fix). `--color-ink-2` is a light
 * secondary-text grey with no other role in this chart, so it can't quietly
 * match whatever the card surface happens to be.
 */
export const TERRAIN_FILL = 'var(--color-ink-2)'

/** Opacity for the neutral terrain base — visible against the card, but
 *  subdued enough that climb tints (drawn on top, see CLIMB_FILL_OPACITY)
 *  are unambiguously the foreground. */
export const TERRAIN_OPACITY = 0.22

/** Opacity for climb-band tints drawn over the terrain base. */
export const CLIMB_FILL_OPACITY = 0.65

/**
 * Evenly-spaced true indices into a length-`n` array, capped at `maxPoints`.
 * Always includes 0 and n-1 (when n > 0) so the silhouette's start/end match
 * the real route exactly. Drawing only needs enough points to look smooth —
 * a long alpine route can carry ~1300 pacing segments, and drawing all of
 * them buys nothing visually while costing a lot of DOM/paint work at
 * 390×844. The scrub readout does NOT use this: it maps the pointer
 * position straight to the true segment index so the numbers it shows are
 * real measurements, never interpolated from a downsampled point.
 */
export function downsampleIndices(n: number, maxPoints: number): number[] {
  if (n <= 0) return []
  if (n <= maxPoints) return Array.from({ length: n }, (_, i) => i)
  const out: number[] = []
  const step = (n - 1) / (maxPoints - 1)
  for (let i = 0; i < maxPoints; i++) {
    out.push(Math.round(i * step))
  }
  // Dedupe while preserving order (rounding can collide near the ends).
  return out.filter((v, i) => i === 0 || v !== out[i - 1])
}
