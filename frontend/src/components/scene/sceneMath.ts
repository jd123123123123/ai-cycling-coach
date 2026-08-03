/**
 * sceneMath — the pure half of the illustration engine.
 *
 * Everything here is deterministic and side-effect free so the drawing code
 * stays a thin renderer over values that can be unit-tested directly. No React,
 * no canvas, no DOM.
 */

/**
 * A tiny string hash (FNV-1a, 32-bit) used to seed a scene.
 *
 * Scenes are seeded from `athleteId + date` rather than left to Math.random so
 * a ridgeline does not reshuffle itself on every re-render — a landscape that
 * changes while you scroll reads as a glitch, not as art. Same athlete, same
 * day, same drawing.
 */
export function seedFrom(key: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  // >>> 0 keeps it an unsigned 32-bit value; Math.imul can hand back a negative.
  return h >>> 0
}

/** Deterministic [0,1) generator (mulberry32) from a seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Resample an arbitrary-length series onto exactly `n` points.
 *
 * Route profiles arrive at wildly different resolutions (174 segments here, 266
 * there, 1 Hz streams in the thousands). Drawing them raw would make a long
 * ride's ridgeline denser than a short one's for no reason the rider can see,
 * so every terrain is resampled to the same point count and the visual
 * difference between two rides stays about their *shape*, not their sampling.
 *
 * Returns an empty array for empty input — callers must treat that as the
 * honest empty state rather than substituting a placeholder shape.
 */
export function resample(values: readonly number[], n: number): number[] {
  if (values.length === 0 || n <= 0) return []
  if (values.length === 1) return new Array(n).fill(values[0])

  const out: number[] = []
  for (let i = 0; i < n; i++) {
    // Map i onto the source index space, then linearly interpolate.
    const t = (i / (n - 1)) * (values.length - 1)
    const lo = Math.floor(t)
    const hi = Math.min(lo + 1, values.length - 1)
    out.push(values[lo] + (values[hi] - values[lo]) * (t - lo))
  }
  return out
}

/**
 * Normalise a series into [0,1].
 *
 * A flat series maps to a constant 0.5 rather than 0 or NaN: a ride with no
 * elevation change is a flat line through the middle of its box, which is the
 * truth. Dividing by a zero range would otherwise produce NaN and silently
 * blank the drawing.
 */
export function normalize(values: readonly number[]): number[] {
  if (values.length === 0) return []
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (v < min) min = v
    if (v > max) max = v
  }
  const range = max - min
  if (range < 1e-9) return values.map(() => 0.5)
  return values.map((v) => (v - min) / range)
}

/**
 * Build an SVG path for a ridgeline over `values` (already normalised to [0,1]),
 * closed along the bottom so it can be filled as terrain.
 *
 * Uses midpoint-smoothed quadratics rather than straight segments: real terrain
 * has no hard vertices, and at phone width a polyline over ~64 points reads as
 * visibly faceted.
 */
export function ridgePath(
  values: readonly number[],
  width: number,
  height: number,
): string {
  if (values.length === 0) return ''
  const x = (i: number) =>
    values.length === 1 ? width / 2 : (i / (values.length - 1)) * width
  const y = (v: number) => height - v * height

  if (values.length === 1) {
    return `M 0 ${y(values[0])} L ${width} ${y(values[0])} L ${width} ${height} L 0 ${height} Z`
  }

  let d = `M ${x(0)} ${y(values[0])}`
  for (let i = 1; i < values.length; i++) {
    const mx = (x(i - 1) + x(i)) / 2
    const my = (y(values[i - 1]) + y(values[i])) / 2
    d += ` Q ${x(i - 1)} ${y(values[i - 1])} ${mx} ${my}`
  }
  d += ` L ${x(values.length - 1)} ${y(values[values.length - 1])}`
  d += ` L ${width} ${height} L 0 ${height} Z`
  return d
}

/**
 * Add seeded fractal detail to a smooth series (midpoint displacement).
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 * A resampled elevation profile is SMOOTH — a climb is one long ramp. Drawn
 * directly it produces a triangle, which reads as a chart, not as a mountain.
 * (This is the same trap the Today Road fell into: correct data, chart output.)
 * Real ridgelines are self-similar: big shapes carry smaller shapes carrying
 * smaller ones. Displacing midpoints at halving amplitude is the cheapest
 * honest way to get that.
 *
 * The underlying shape is NEVER changed — detail is added at `roughness` scale
 * relative to the series' own range, so a flat route stays visibly flat and a
 * 900 m climb still reads as a 900 m climb. This is texture, not invention.
 */
export function fractalDetail(
  values: readonly number[],
  seed: number,
  roughness = 0.06,
): number[] {
  if (values.length < 3) return [...values]
  const r = rng(seed)
  const out = [...values]

  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (v < min) min = v
    if (v > max) max = v
  }
  const range = max - min
  if (range < 1e-9) return out

  // Successively finer octaves; each contributes half the previous amplitude.
  let step = Math.floor(out.length / 2)
  let amp = range * roughness
  while (step >= 1) {
    for (let i = step; i < out.length - step; i += step * 2) {
      out[i] += (r() - 0.5) * 2 * amp
    }
    step = Math.floor(step / 2)
    // 0.62, not 0.5: at a halving falloff the finer octaves die out before they
    // are visible at phone scale and the ridge reads as a smooth hill again.
    amp *= 0.62
    if (step === 0) break
  }
  return out
}

/**
 * A seeded rolling ridge with no underlying data — used only where the shape
 * is explicitly decorative background depth (the far haze behind real terrain),
 * never as a stand-in for a route the athlete does not have.
 */
export function noiseRidge(n: number, seed: number, base = 0.4, amp = 0.12): number[] {
  const r = rng(seed)
  const out: number[] = []
  // Two offset sine waves with seeded phase give a soft, non-repeating skyline
  // far more cheaply than layered noise, and it only has to read as "distance".
  const p1 = r() * Math.PI * 2
  const p2 = r() * Math.PI * 2
  for (let i = 0; i < n; i++) {
    const t = (i / Math.max(1, n - 1)) * Math.PI * 2
    out.push(base + Math.sin(t * 1.3 + p1) * amp + Math.sin(t * 2.7 + p2) * amp * 0.45)
  }
  return out
}

/**
 * Time-of-day → sky stop pair, as CSS custom-property references.
 *
 * The palette is drawn entirely from existing tokens: no new colours enter the
 * system through the illustration layer. Dawn and dusk borrow the warm end
 * (gold/amber), midday the neutral paper end, night the ink end.
 */
export type SkyPhase = 'dawn' | 'day' | 'dusk' | 'night'

export function skyPhase(hour: number): SkyPhase {
  if (hour < 5 || hour >= 21) return 'night'
  if (hour < 9) return 'dawn'
  if (hour < 17) return 'day'
  return 'dusk'
}

/**
 * Stops are color-mixed toward transparent rather than used neat.
 *
 * This app's paper is DARK. A neat gold laid over it at full strength does not
 * read as a sunrise — it reads as mud, which is exactly how the first render at
 * 390×844 came out. Mixing toward transparent makes the sky TINT the page
 * instead of replacing it, so the warmth arrives without the surface below
 * turning brown.
 */
export const SKY_STOPS: Record<SkyPhase, { from: string; to: string }> = {
  dawn: { from: 'color-mix(in srgb, var(--color-gold) 22%, transparent)', to: 'transparent' },
  day: { from: 'color-mix(in srgb, var(--color-ink-blue) 16%, transparent)', to: 'transparent' },
  dusk: { from: 'color-mix(in srgb, var(--color-amber) 20%, transparent)', to: 'transparent' },
  night: { from: 'color-mix(in srgb, var(--color-violet) 20%, transparent)', to: 'transparent' },
}
