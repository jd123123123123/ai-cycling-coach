/**
 * progression.ts — the sport-science engine behind the Run/Bike/Lift Progress
 * screens. Real, defensible models (no black-box fabrication):
 *   • Ordinary-least-squares trend + damped forecast toward a physiological ceiling
 *   • Riegel & Daniels VDOT race-time prediction (running)
 *   • Epley e1RM + DOTS strength scoring (lifting)
 * Every function is pure and takes real datapoints; callers pass measured data.
 * (The client-side Monod–Scherrer CP model and climb-power event forecast were
 * removed with audit P0-1/P0-4: cycling power modeling lives server-side and
 * the ONE forward projection is the /weeks/current Bayesian band.)
 */

// ── Linear regression ──────────────────────────────────────────────────────
export interface Trend {
  slope: number      // units per x-step
  intercept: number
  r2: number         // goodness of fit 0..1
  n: number
  predict: (x: number) => number
}

export function linreg(pts: Array<{ x: number; y: number }>): Trend | null {
  const n = pts.length
  if (n < 2) return null
  const sx = pts.reduce((s, p) => s + p.x, 0)
  const sy = pts.reduce((s, p) => s + p.y, 0)
  const mx = sx / n, my = sy / n
  let num = 0, den = 0
  for (const p of pts) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2 }
  const slope = den === 0 ? 0 : num / den
  const intercept = my - slope * mx
  // r²
  let ssTot = 0, ssRes = 0
  for (const p of pts) { const f = slope * p.x + intercept; ssTot += (p.y - my) ** 2; ssRes += (p.y - f) ** 2 }
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot)
  return { slope, intercept, r2, n, predict: (x) => slope * x + intercept }
}

/**
 * Damped forecast: adaptation slows as you approach a ceiling (exponential
 * approach), which is truer to physiology than a naive straight line. Returns
 * one value per future step. `ceiling` caps the asymptote; omit for linear.
 */
export function forecast(current: number, slopePerStep: number, steps: number, ceiling?: number): number[] {
  const out: number[] = []
  let v = current
  for (let i = 1; i <= steps; i++) {
    if (ceiling != null && slopePerStep > 0) {
      const gap = ceiling - v
      // approach the ceiling: effective gain shrinks with the remaining gap
      const gain = Math.max(0, slopePerStep) * Math.max(0, gap / Math.max(1, ceiling - current))
      v = Math.min(ceiling, v + gain)
    } else {
      v = v + slopePerStep
    }
    out.push(v)
  }
  return out
}

// ── Running ────────────────────────────────────────────────────────────────
/** Riegel: predict time over d2 from a known (d1,t1). exponent 1.06 default. */
export function riegel(d1_m: number, t1_s: number, d2_m: number, exp = 1.06): number {
  if (d1_m <= 0 || t1_s <= 0) return NaN
  return t1_s * Math.pow(d2_m / d1_m, exp)
}

/** Daniels VDOT from a race (distance m, time s). Returns VO2max-equivalent. */
export function vdot(dist_m: number, time_s: number): number | null {
  if (dist_m <= 0 || time_s <= 0) return null
  const v = dist_m / time_s * 60 // m/min
  const pctMax = 0.8 + 0.1894393 * Math.exp(-0.012778 * time_s) + 0.2989558 * Math.exp(-0.1932605 * time_s)
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v
  return vo2 / pctMax
}

/** Predict a race time (s) for target distance from a VDOT, inverting Daniels. */
export function raceTimeFromVdot(vdotVal: number, dist_m: number): number | null {
  if (!(vdotVal > 0) || dist_m <= 0) return null
  // solve for time by bisection on the VDOT model
  let lo = 60, hi = 6 * 3600
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    const v = dist_m / mid * 60
    const pctMax = 0.8 + 0.1894393 * Math.exp(-0.012778 * mid) + 0.2989558 * Math.exp(-0.1932605 * mid)
    const vo2at = (-4.6 + 0.182258 * v + 0.000104 * v * v) / pctMax
    if (vo2at > vdotVal) lo = mid; else hi = mid
  }
  return (lo + hi) / 2
}

// ── Lifting ────────────────────────────────────────────────────────────────
/** Epley estimated 1-rep-max from a working set. */
export function epley1RM(weightKg: number, reps: number): number {
  if (reps <= 0) return 0
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30)
}

/** DOTS strength score (sex-adjusted, bodyweight-normalized total). */
export function dots(totalKg: number, bodyweightKg: number, sex: 'male' | 'female' = 'male'): number {
  const bw = Math.min(Math.max(bodyweightKg, 40), sex === 'male' ? 210 : 150)
  const c = sex === 'male'
    ? [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093]
    : [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706]
  const denom = c[0] + c[1] * bw + c[2] * bw ** 2 + c[3] * bw ** 3 + c[4] * bw ** 4
  return denom === 0 ? 0 : (500 / denom) * totalKg
}

/** Strength level bucket from a lift's e1RM relative to bodyweight (barbell). */
export function strengthLevel(ratio: number): { label: string; label_de: string; idx: number } {
  const levels = [
    { label: 'Untrained', label_de: 'Untrainiert' },
    { label: 'Novice', label_de: 'Anfänger' },
    { label: 'Intermediate', label_de: 'Fortgeschritten' },
    { label: 'Advanced', label_de: 'Erfahren' },
    { label: 'Elite', label_de: 'Elite' },
  ]
  // rough squat-style bodyweight-ratio thresholds
  const idx = ratio < 0.75 ? 0 : ratio < 1.25 ? 1 : ratio < 1.75 ? 2 : ratio < 2.5 ? 3 : 4
  return { ...levels[idx], idx }
}

// ── Potential vs sport-science standards ────────────────────────────────────
// These map a real, weight-relative performance figure onto a standard level
// ladder and return a *realistic attainable target* (top of the next 1–2 levels
// up) with genuine headroom — NOT a fabricated genetic max or current×small
// factor. Every threshold is an approximation of widely-used coaching norms and
// is framed as a target you can train toward, not a hard limit.

export interface PotentialModel {
  level: string; level_de: string          // current band
  levelIdx: number
  nextLevel: string; nextLevel_de: string   // immediate next milestone band
  nextValue: number                          // W/kg (bike) · VO₂ (run) · ratio (lift) at the next band
  targetValue: number                        // long-range strong-amateur target used for the gauge + forecast ceiling
  pctToTarget: number                        // 0..100 — current ÷ target (this is the honest "how far along" gauge)
}

/** Build a PotentialModel from a metric value against a level ladder.
 *  `strongAmateurIdx` picks which band top is the long-range target; if the
 *  athlete is already at/above it we push the target one band higher so the
 *  gauge always shows real headroom (never ~100%). */
function buildPotential(
  value: number,
  ladder: Array<{ label: string; label_de: string; v: number }>,
  strongAmateurIdx: number,
): PotentialModel | null {
  if (!(value > 0) || ladder.length === 0) return null
  // Current band = highest ladder entry whose threshold ≤ value.
  let idx = 0
  for (let i = 0; i < ladder.length; i++) if (value >= ladder[i].v) idx = i
  const next = ladder[Math.min(idx + 1, ladder.length - 1)]
  // Long-range target: the strong-amateur band top, bumped up a band if already met.
  let targetIdx = strongAmateurIdx
  while (targetIdx < ladder.length - 1 && value >= ladder[targetIdx].v * 0.97) targetIdx += 1
  const targetValue = ladder[targetIdx].v
  return {
    level: ladder[idx].label, level_de: ladder[idx].label_de, levelIdx: idx,
    nextLevel: next.label, nextLevel_de: next.label_de, nextValue: next.v,
    targetValue,
    pctToTarget: Math.max(0, Math.min(100, Math.round((value / targetValue) * 100))),
  }
}

// Men's FTP W/kg ladder — approximate coaching bands (Coggan-style category
// guidance, rounded). Attainable targets, not genetic limits:
//   novice ≈2.0 · recreational ≈2.5 · Cat 5 ≈3.0 · Cat 4 ≈3.5 · Cat 3 ≈4.0 ·
//   Cat 1–2 ≈4.5 · elite/pro ≈5.0+. (Women's bands run ~0.85× — approximation.)
export function wkgPotential(wkg: number): PotentialModel | null {
  const LADDER = [
    { label: 'Novice', label_de: 'Anfänger', v: 2.0 },
    { label: 'Recreational', label_de: 'Freizeit', v: 2.5 },
    { label: 'Cat 5', label_de: 'Cat 5', v: 3.0 },
    { label: 'Cat 4', label_de: 'Cat 4', v: 3.5 },
    { label: 'Cat 3', label_de: 'Cat 3', v: 4.0 },
    { label: 'Cat 1–2', label_de: 'Cat 1–2', v: 4.5 },
    { label: 'Elite', label_de: 'Elite', v: 5.0 },
  ]
  return buildPotential(wkg, LADDER, 5) // long-range target: strong amateur ≈ Cat 1–2 (4.5 W/kg)
}

// Men's VO₂max fitness ladder — approximate ACSM/Cooper norms for ~20–45 y:
//   poor <35 · fair ≈35 · good ≈42 · excellent ≈48 · superior ≈55 · elite ≈62+.
// Framed as attainable fitness targets, not a genetic ceiling.
export function vo2maxPotential(vo2: number): PotentialModel | null {
  const LADDER = [
    { label: 'Fair', label_de: 'Mäßig', v: 35 },
    { label: 'Good', label_de: 'Gut', v: 42 },
    { label: 'Excellent', label_de: 'Sehr gut', v: 48 },
    { label: 'Superior', label_de: 'Hervorragend', v: 55 },
    { label: 'Elite', label_de: 'Elite', v: 62 },
  ]
  return buildPotential(vo2, LADDER, 3) // long-range target: superior ≈ 55
}

// Barbell strength ladder by lift-to-bodyweight ratio (squat-style), matching
// the strengthLevel() thresholds — standard strength-standards bands, framed as
// attainable targets: untrained 0 · novice ≈0.75× · intermediate ≈1.25× ·
// advanced ≈1.75× · elite ≈2.5×.
export function strengthPotential(ratio: number): PotentialModel | null {
  const LADDER = [
    { label: 'Untrained', label_de: 'Untrainiert', v: 0.01 },
    { label: 'Novice', label_de: 'Anfänger', v: 0.75 },
    { label: 'Intermediate', label_de: 'Fortgeschritten', v: 1.25 },
    { label: 'Advanced', label_de: 'Erfahren', v: 1.75 },
    { label: 'Elite', label_de: 'Elite', v: 2.5 },
  ]
  return buildPotential(ratio, LADDER, 3) // long-range target: advanced ≈ 1.75× bodyweight
}

// ── Period-over-period + range-adaptive bucketing ──────────────────────────
// The Progress screens compare the selected window [today−N, today] against the
// immediately-prior equivalent window [today−2N, today−N] and re-bucket their
// trend charts at a granularity derived from the range (never hardcoded).

export type Granularity = 'daily' | 'weekly' | 'monthly'

/** Bucket granularity from a range span: ≤7d daily · 8–31d weekly · >31d monthly. */
export function granularityForDays(days: number): Granularity {
  if (days <= 7) return 'daily'
  if (days <= 31) return 'weekly'
  return 'monthly'
}

export function granularityLabel(g: Granularity, de = false): string {
  if (de) return g === 'daily' ? 'täglich' : g === 'weekly' ? 'wöchentlich' : 'monatlich'
  return g
}

/** Percent change of cur vs prev. Null when prev is missing/zero — an honest
 *  "no prior base to compare against" rather than a fake 0 %/∞. */
export function pctChange(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur == null || prev == null || prev === 0 || !isFinite(cur) || !isFinite(prev)) return null
  return ((cur - prev) / Math.abs(prev)) * 100
}

export interface GBucket { start: Date; label: string; value: number; n: number }

/** Bucket dated points ({t: epoch ms, v}) into calendar daily/weekly/monthly
 *  buckets spanning [windowStart, windowEnd]. Empty buckets stay 0 (honest gap).
 *  `agg`: sum (volume), avg (rates like CTL), or max (bests like NP). */
export function bucketByGranularity(
  points: Array<{ t: number; v: number }>,
  windowStart: Date,
  windowEnd: Date,
  g: Granularity,
  agg: 'sum' | 'avg' | 'max' = 'sum',
): GBucket[] {
  const startOf = (d: Date): Date => {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    if (g === 'daily') return x
    if (g === 'weekly') { const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return x } // Monday
    x.setDate(1); return x // monthly
  }
  const next = (d: Date): Date => {
    const x = new Date(d)
    if (g === 'daily') x.setDate(x.getDate() + 1)
    else if (g === 'weekly') x.setDate(x.getDate() + 7)
    else x.setMonth(x.getMonth() + 1)
    return x
  }
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const label = (d: Date): string => g === 'monthly' ? MON[d.getMonth()] : `${MON[d.getMonth()]} ${d.getDate()}`
  const buckets: GBucket[] = []
  const idx = new Map<number, number>()
  for (let cur = startOf(windowStart); +cur <= +windowEnd; cur = next(cur)) {
    idx.set(+cur, buckets.length)
    buckets.push({ start: new Date(cur), label: label(cur), value: 0, n: 0 })
  }
  for (const p of points) {
    const i = idx.get(+startOf(new Date(p.t)))
    if (i == null) continue
    const b = buckets[i]
    if (agg === 'max') b.value = Math.max(b.value, p.v)
    else b.value += p.v
    b.n += 1
  }
  if (agg === 'avg') for (const b of buckets) b.value = b.n ? b.value / b.n : 0
  return buckets
}

// ── Shared helpers ─────────────────────────────────────────────────────────
export function fmtRaceTime(s: number): string {
  if (!isFinite(s) || s <= 0) return '—'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

/** Confidence label from a trend's r² + sample size. */
export function confidence(tr: Trend | null): { pct: number; label: string; label_de: string } {
  if (!tr) return { pct: 0, label: 'no data', label_de: 'keine Daten' }
  const pct = Math.round(Math.min(0.95, tr.r2 * Math.min(1, tr.n / 8)) * 100)
  const label = pct >= 70 ? 'high' : pct >= 40 ? 'moderate' : 'low'
  const label_de = pct >= 70 ? 'hoch' : pct >= 40 ? 'moderat' : 'niedrig'
  return { pct, label, label_de }
}
