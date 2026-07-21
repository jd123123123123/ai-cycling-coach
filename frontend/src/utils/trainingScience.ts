/**
 * trainingScience — pure, well-cited sports-science helpers for onboarding.
 *
 * Everything here is deterministic and side-effect free so it can be unit
 * tested and reused. Citations live next to each function so the onboarding
 * UI can surface the "why" honestly.
 */
import type { ActivityRead } from '../api/dashboard'
import type { DailyMetric } from '../api/dashboard'

export type Locale = 'en' | 'de'

// ─── Max heart rate ─────────────────────────────────────────────────────────

/**
 * Tanaka et al. (2001) age-predicted maximum heart rate: 208 − 0.7 × age.
 * More accurate across ages than the classic 220 − age. Returns null without
 * a usable age.
 */
export function predictedMaxHr(age: number | null): number | null {
  if (!age || age <= 0 || age > 120) return null
  return Math.round(208 - 0.7 * age)
}

export function ageFromDob(dob: string | null): number | null {
  if (!dob) return null
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return null
  // Compare on yyyy-mm-dd without relying on Date.now() (unavailable in some
  // sandboxes) — the caller passes today via the DOM-free path normally, but
  // here we use the standard constructor which is fine in the browser.
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1
  return age >= 0 && age < 120 ? age : null
}

// ─── Power zones (Coggan) ───────────────────────────────────────────────────

export interface Zone {
  z: number
  name: string
  nameDe: string
  /** Lower bound (inclusive), absolute units. */
  low: number
  /** Upper bound; null means open-ended (∞). */
  high: number | null
}

/**
 * Coggan / Allen 7-zone power model as a fraction of FTP. The canonical bands
 * from "Training and Racing with a Power Meter" (Allen & Coggan).
 */
const POWER_BANDS: Array<{ name: string; nameDe: string; lo: number; hi: number | null }> = [
  { name: 'Active recovery', nameDe: 'Aktive Erholung', lo: 0, hi: 0.55 },
  { name: 'Endurance', nameDe: 'Grundlagenausdauer', lo: 0.56, hi: 0.75 },
  { name: 'Tempo', nameDe: 'Tempo', lo: 0.76, hi: 0.9 },
  { name: 'Threshold', nameDe: 'Schwelle', lo: 0.91, hi: 1.05 },
  { name: 'VO2max', nameDe: 'VO2max', lo: 1.06, hi: 1.2 },
  { name: 'Anaerobic', nameDe: 'Anaerob', lo: 1.21, hi: 1.5 },
  { name: 'Neuromuscular', nameDe: 'Neuromuskulär', lo: 1.51, hi: null },
]

export function powerZones(ftp: number | null): Zone[] | null {
  if (!ftp || ftp <= 0) return null
  return POWER_BANDS.map((b, i) => ({
    z: i + 1,
    name: b.name,
    nameDe: b.nameDe,
    low: Math.round(ftp * b.lo),
    high: b.hi == null ? null : Math.round(ftp * b.hi),
  }))
}

// ─── Heart-rate zones (Karvonen / %HRR) ─────────────────────────────────────

const HR_BANDS: Array<{ name: string; nameDe: string; lo: number; hi: number }> = [
  { name: 'Recovery', nameDe: 'Erholung', lo: 0.5, hi: 0.6 },
  { name: 'Endurance', nameDe: 'Grundlage', lo: 0.6, hi: 0.7 },
  { name: 'Tempo', nameDe: 'Tempo', lo: 0.7, hi: 0.8 },
  { name: 'Threshold', nameDe: 'Schwelle', lo: 0.8, hi: 0.9 },
  { name: 'VO2max', nameDe: 'VO2max', lo: 0.9, hi: 1.0 },
]

/**
 * Karvonen heart-rate-reserve zones: HR = rest + pct × (max − rest). Needs both
 * max and resting HR; falls back to a flat %max model when resting HR is
 * missing.
 */
export function hrZones(maxHr: number | null, restHr: number | null): Zone[] | null {
  if (!maxHr || maxHr <= 0) return null
  const rest = restHr && restHr > 0 && restHr < maxHr ? restHr : null
  const reserve = rest != null ? maxHr - rest : maxHr
  const base = rest ?? 0
  return HR_BANDS.map((b, i) => ({
    z: i + 1,
    name: b.name,
    nameDe: b.nameDe,
    low: Math.round(base + b.lo * reserve),
    high: Math.round(base + b.hi * reserve),
  }))
}

// ─── FTP / HR estimation from synced history ────────────────────────────────

const FTP_FACTOR = 0.95 // best ~20-min normalized power × 0.95 ≈ FTP
const MIN_DURATION_S = 18 * 60
const MAX_DURATION_S = 75 * 60

/**
 * Estimate FTP from recent cycling: best normalized power over efforts in the
 * 18–75 min window × 0.95. Mirrors the existing FTPEstimate card so the
 * onboarding agrees with the dashboard. Returns the watts + a 0–1 confidence
 * (more qualifying rides → more confidence).
 */
export function estimateFtp(activities: ActivityRead[]): { watts: number; confidence: number } | null {
  const candidates = activities.filter(
    (a) =>
      a.sport === 'cycling' &&
      typeof a.normalized_power === 'number' &&
      (a.normalized_power ?? 0) > 0 &&
      typeof a.duration_seconds === 'number' &&
      (a.duration_seconds ?? 0) >= MIN_DURATION_S &&
      (a.duration_seconds ?? 0) <= MAX_DURATION_S,
  )
  if (candidates.length === 0) return null
  const bestNp = Math.max(...candidates.map((a) => a.normalized_power as number))
  return { watts: Math.round(bestNp * FTP_FACTOR), confidence: Math.min(candidates.length / 5, 1) }
}

// ─── Starter FTP (no ride data) ─────────────────────────────────────────────

export type StarterFitness = 'new' | 'returning' | 'seasoned'

/**
 * Conservative W/kg priors for a self-assessed starting FTP when no ride
 * history exists. Standard coaching heuristics (e.g. Coggan power-profile
 * "untrained"–"fair" bands): a true beginner sits around 1.8–2.2 W/kg at
 * threshold, a regular unstructured rider ~2.5–2.8, a fit long-time rider
 * ~3.0+. We pick the conservative middle of each band — the plan engine
 * calibrates upward from real rides, and undershooting is safe while
 * overshooting prescribes intervals the athlete can't hold.
 */
const STARTER_WKG: Record<StarterFitness, number> = {
  new: 2.0,
  returning: 2.6,
  seasoned: 3.0,
}

/** Floor: the plan engine requires a plausible FTP (backend gate ftp ≥ 100 W). */
const STARTER_FTP_MIN_W = 100
const STARTER_FTP_MAX_W = 350

/**
 * Self-assessment starter FTP: weight × conservative W/kg prior, clamped to a
 * plausible range. Returns null without a usable weight. Explicitly labeled
 * in the UI as "Startschätzung — wir kalibrieren, sobald du fährst".
 */
export function starterFtp(weightKg: number | null, fitness: StarterFitness): number | null {
  if (!weightKg || !Number.isFinite(weightKg) || weightKg < 30 || weightKg > 200) return null
  const watts = Math.round(weightKg * STARTER_WKG[fitness])
  return Math.min(STARTER_FTP_MAX_W, Math.max(STARTER_FTP_MIN_W, watts))
}

/** Highest max-HR observed across synced activities (a real-world max proxy). */
export function observedMaxHr(activities: ActivityRead[]): number | null {
  const hrs = activities.map((a) => a.max_hr ?? 0).filter((v) => v > 0)
  return hrs.length ? Math.max(...hrs) : null
}

/** Lowest resting HR across daily metrics (the truest resting value). */
export function observedRestingHr(metrics: DailyMetric[]): number | null {
  const hrs = metrics.map((m) => m.resting_hr ?? 0).filter((v) => v > 0)
  return hrs.length ? Math.min(...hrs) : null
}

// ─── Weekly intensity philosophy ────────────────────────────────────────────

export type TrainingModel = 'polarized' | 'sweetspot' | 'pyramidal'

export interface ModelInfo {
  key: TrainingModel
  name: string
  nameDe: string
  blurb: string
  blurbDe: string
  /** Fraction of weekly sessions that are hard/quality. */
  hardFraction: number
}

export const TRAINING_MODELS: ModelInfo[] = [
  {
    key: 'polarized',
    name: 'Polarized 80/20',
    nameDe: 'Polarisiert 80/20',
    blurb: '~80% easy, ~20% hard. The most evidence-backed model for endurance gains (Seiler).',
    blurbDe: '~80% locker, ~20% hart. Das am besten belegte Modell für Ausdauergewinne (Seiler).',
    hardFraction: 0.25,
  },
  {
    key: 'sweetspot',
    name: 'Sweet-spot',
    nameDe: 'Sweet-Spot',
    blurb: 'More time near threshold (88–94% FTP). Time-efficient when hours are limited.',
    blurbDe: 'Mehr Zeit nahe der Schwelle (88–94% FTP). Zeiteffizient bei knappen Stunden.',
    hardFraction: 0.45,
  },
  {
    key: 'pyramidal',
    name: 'Pyramidal',
    nameDe: 'Pyramidal',
    blurb: 'Most volume easy, a moderate slice of tempo, a little hard. A balanced middle ground.',
    blurbDe: 'Viel Grundlage, ein moderater Tempo-Anteil, etwas Hartes. Ausgewogener Mittelweg.',
    hardFraction: 0.33,
  },
]

export function modelInfo(model: TrainingModel): ModelInfo {
  return TRAINING_MODELS.find((m) => m.key === model) ?? TRAINING_MODELS[0]
}

/**
 * Translate a model + weekly availability into an approximate hard/easy session
 * split. Intentionally conservative: at least one hard day, capped at 3, never
 * more hard days than total days.
 */
export function sessionSplit(model: TrainingModel, daysPerWeek: number): { hard: number; easy: number } {
  const days = Math.max(1, Math.min(7, Math.round(daysPerWeek)))
  const info = modelInfo(model)
  const hard = Math.max(1, Math.min(3, Math.min(days, Math.round(days * info.hardFraction))))
  return { hard, easy: days - hard }
}
