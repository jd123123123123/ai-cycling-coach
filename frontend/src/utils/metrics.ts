import type { DailyMetric } from '../api/dashboard'

/** Normalize HRV to 0-100. Garmin typically returns 30-100ms; clamp. */
export function normalizeHrv(hrv: number | null): number | null {
  if (hrv == null) return null
  return Math.max(0, Math.min(100, hrv))
}

/**
 * Composite readiness 0-100. Null metrics get weight 0; remaining weights renormalize.
 * Returns null if all three inputs are null.
 *  - HRV        40%
 *  - Body batt  35%
 *  - Sleep      25%
 */
export function computeReadiness(
  hrv: number | null,
  bodyBattery: number | null,
  sleepScore: number | null,
): number | null {
  const weights = { hrv: 0.4, battery: 0.35, sleep: 0.25 }
  const values = { hrv: normalizeHrv(hrv), battery: bodyBattery, sleep: sleepScore }

  let totalWeight = 0
  let sum = 0
  if (values.hrv !== null) { totalWeight += weights.hrv; sum += weights.hrv * values.hrv }
  if (values.battery !== null) { totalWeight += weights.battery; sum += weights.battery * values.battery }
  if (values.sleep !== null) { totalWeight += weights.sleep; sum += weights.sleep * values.sleep }

  if (totalWeight === 0) return null
  return Math.round(sum / totalWeight)
}

export type ReadinessTier = 'rest' | 'caution' | 'ready' | 'peak'

export function readinessTier(score: number | null): ReadinessTier | null {
  if (score == null) return null
  if (score >= 85) return 'peak'
  if (score >= 70) return 'ready'
  if (score >= 40) return 'caution'
  return 'rest'
}

export interface TierMeta {
  label: string        // 2-3 word
  verb: string         // action-oriented coach word
  sentiment: string    // short interpretation
  labelDe: string
  verbDe: string
  sentimentDe: string
  color: string        // css token
  bg: string           // subtle bg
}

export const TIER_META: Record<ReadinessTier, TierMeta> = {
  peak: {
    label: 'Primed',
    verb: 'Push it',
    sentiment: 'Every system green — a rare window to go deep.',
    labelDe: 'Topform',
    verbDe: 'Voll angreifen',
    sentimentDe: 'Alle Systeme grün — ein seltenes Fenster, um tief zu gehen.',
    color: 'var(--color-forest-2)',
    bg: 'rgba(48, 209, 88, 0.10)',
  },
  ready: {
    label: 'Ready',
    verb: 'Train hard',
    sentiment: 'Recovery is complete. Today can be a quality day.',
    labelDe: 'Bereit',
    verbDe: 'Hart trainieren',
    sentimentDe: 'Die Erholung ist komplett. Heute darf ein Qualitätstag sein.',
    color: 'var(--color-forest)',
    bg: 'rgba(52, 199, 89, 0.08)',
  },
  caution: {
    label: 'Middling',
    verb: 'Keep it easy',
    sentiment: 'Body is muddled. Hold intensity down until trends turn.',
    labelDe: 'Durchwachsen',
    verbDe: 'Locker bleiben',
    sentimentDe: 'Der Körper ist unklar. Halte die Intensität unten, bis die Trends drehen.',
    color: 'var(--color-amber-2)',
    bg: 'rgba(255, 159, 10, 0.10)',
  },
  rest: {
    label: 'Drained',
    verb: 'Rest',
    sentiment: 'Too much fatigue in the tank. A true rest day compounds later.',
    labelDe: 'Ausgelaugt',
    verbDe: 'Ruhen',
    sentimentDe: 'Zu viel Ermüdung im Tank. Ein echter Ruhetag zahlt sich später aus.',
    color: 'var(--color-alert)',
    bg: 'rgba(255, 69, 58, 0.10)',
  },
}

/** Localized tier words. `locale === 'de'` swaps in the German label/verb/sentiment. */
export function tierText(meta: TierMeta, locale: string) {
  const de = locale === 'de'
  return {
    label: de ? meta.labelDe : meta.label,
    verb: de ? meta.verbDe : meta.verb,
    sentiment: de ? meta.sentimentDe : meta.sentiment,
  }
}

// ─── Zone classification for individual KPIs ──────────────────────────────────

export type MetricZone = 'good' | 'fair' | 'poor' | 'unknown'

export function classifyMetric(
  value: number | null,
  goodAt: number,
  warnBelow: number,
  higherIsBetter = true,
): MetricZone {
  if (value == null) return 'unknown'
  if (higherIsBetter) {
    if (value >= goodAt) return 'good'
    if (value < warnBelow) return 'poor'
    return 'fair'
  }
  // lower is better (e.g. stress, resting HR)
  if (value <= goodAt) return 'good'
  if (value > warnBelow) return 'poor'
  return 'fair'
}

// ─── Deltas / trends ─────────────────────────────────────────────────────────

export function latestWithData(metrics: DailyMetric[], key: keyof DailyMetric): DailyMetric | null {
  for (let i = metrics.length - 1; i >= 0; i--) {
    const m = metrics[i]
    if (m[key] != null) return m
  }
  return null
}

/**
 * Compute trend delta: latest value vs. 7-day average excluding that latest value.
 * Returns { delta, pct, baseline } or null if insufficient data.
 */
export function trendDelta(
  metrics: DailyMetric[],
  key: keyof DailyMetric,
): { current: number; delta: number; pct: number; baseline: number } | null {
  const values = metrics
    .map((m) => m[key])
    .filter((v): v is number => typeof v === 'number')
  if (values.length < 2) return null
  const current = values[values.length - 1]
  const prior = values.slice(0, -1)
  const baseline = prior.reduce((s, v) => s + v, 0) / prior.length
  if (baseline === 0) return null
  const delta = current - baseline
  const pct = (delta / baseline) * 100
  return { current, delta, pct, baseline }
}

/** Return an array of size N: series[i] = metric.<key> for the i-th day in the window, or null. */
export function seriesForSparkline(
  metrics: DailyMetric[],
  key: keyof DailyMetric,
): Array<number | null> {
  return metrics.map((m) => {
    const v = m[key]
    return typeof v === 'number' ? v : null
  })
}

// ─── Formatters ──────────────────────────────────────────────────────────────

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m.toString().padStart(2, '0')}m`
}

export function formatDistanceKm(meters: number | null): string {
  if (meters == null) return '—'
  const km = meters / 1000
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`
}

export function formatRelativeDay(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return `${diff}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
