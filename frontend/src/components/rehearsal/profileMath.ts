/**
 * Pure helpers for RehearsalProfile — kept out of the component file because
 * this repo's eslint (react-refresh) forbids exporting non-components from a
 * component module.
 */

/** Gradient → zone colour. Mirrors `zone_for_gradient` in
 *  `backend/app/services/climb_companion.py`: <3 % z1, 3–6 z2, 6–9 z3,
 *  9–12 z4, >12 z5. No abs() — descents (negative gradient) fall into z1
 *  along with flats, same as the backend. */
export function zoneColorForGradient(gradientPct: number): string {
  if (gradientPct < 3.0) return 'var(--color-zone-1)'
  if (gradientPct < 6.0) return 'var(--color-zone-2)'
  if (gradientPct < 9.0) return 'var(--color-zone-3)'
  if (gradientPct < 12.0) return 'var(--color-zone-4)'
  return 'var(--color-zone-5)'
}

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
