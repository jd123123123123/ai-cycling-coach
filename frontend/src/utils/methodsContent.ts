/**
 * methodsContent — the copy bank for the "Wie wird das berechnet?" methods
 * drawer (backlog 02·K3, model transparency).
 *
 * A methods entry is the deep sibling of a GlossarySheet entry: not a one-line
 * "what it is", but the full inspectable story a skeptical sports scientist
 * wants — name, plain-language purpose, the exact formula + constants, the
 * REAL data the model consumed (passed in by the caller), the honest
 * uncertainty/confidence, and a citation where one genuinely exists in the
 * engine (coach_knowledge.py / critical_power.py / readiness_score.py headers).
 *
 * Ethic (matches the app's honest-"—" signature): never fabricate a citation
 * and never invent a precision the model doesn't have. Missing inputs render
 * as an honest dash and the uncertainty line says so.
 *
 * Lives in a pure-importable .ts (not the .tsx) so the copy is unit-pinnable
 * from node-env vitest, exactly like metricLabel.ts.
 */
import type { Locale } from '../i18n/strings'

export type MethodKey = 'readiness' | 'cp'

/** One labelled row — used for both constants and consumed data inputs. */
export interface MethodRow {
  label: string
  /** Pre-formatted value; '—' when the real datum is absent (never faked). */
  value: string
  /** Optional dim sub-note (e.g. a weight, a Δ vs baseline). */
  note?: string
}

export interface MethodContent {
  /** Eyebrow — always the drawer's question. */
  eyebrow: string
  /** Method name (title). */
  title: string
  /** Plain-language: what this number actually is. */
  whatItIs: string
  /** The core formula, shown monospace. */
  formula: string
  /** Constants / weights the model uses. */
  constants: MethodRow[]
  /** The real data the model consumed for THIS athlete (dynamic). */
  inputs: MethodRow[]
  /** Honest uncertainty / confidence sentence. */
  uncertainty: string
  /** Citation string, or null when none genuinely exists. Never fabricated. */
  citation: string | null
}

// ─── formatting helpers ───────────────────────────────────────────────────

const DASH = '—'

function num(v: number | null | undefined, locale: Locale, digits = 0): string {
  if (v == null || Number.isNaN(v)) return DASH
  return v.toLocaleString(locale === 'de' ? 'de-DE' : 'en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function signed(v: number | null | undefined, locale: Locale): string {
  if (v == null || Number.isNaN(v)) return DASH
  const s = num(Math.abs(v), locale)
  return v >= 0 ? `+${s}` : `−${s}`
}

// ─── readiness ────────────────────────────────────────────────────────────

export interface ReadinessMethodData {
  /** 7-day HRV mean (ms), the value shown as a driver. */
  hrv: number | null
  /** Resting HR (bpm). */
  rhr: number | null
  /** Last night's sleep score (0–100). */
  sleep: number | null
  /** Training-stress balance / form. */
  tsb: number | null
  /** The composite score currently on screen (0–100). */
  score: number | null
}

/**
 * The multi-factor readiness dial (backend readiness_score.py). Six signals,
 * each scored 0–100 against the athlete's own 28-day baseline, then combined
 * as an evidence-weighted average; missing signals drop out and the remaining
 * weights renormalize.
 */
export function buildReadinessMethod(
  locale: Locale,
  data: ReadinessMethodData,
): MethodContent {
  const de = locale === 'de'
  const present = [data.hrv, data.rhr, data.sleep, data.tsb].filter((v) => v != null).length

  return {
    eyebrow: de ? 'WIE WIRD DAS BERECHNET?' : 'HOW IS THIS CALCULATED?',
    title: de ? 'Readiness-Score' : 'Readiness score',
    whatItIs: de
      ? 'Ein gewichteter Durchschnitt deiner Erholungs- und Belastungssignale, zu einer Zahl von 0–100 verrechnet. Jedes Signal wird gegen deine eigene 28-Tage-Basislinie gemessen — nicht gegen einen Normwert.'
      : 'A weighted average of your recovery and load signals, blended into a single 0–100 number. Each signal is scored against your own 28-day baseline — not a population norm.',
    formula: 'Score = Σ(Signalᵢ × wᵢ) / Σ wᵢ',
    constants: [
      { label: de ? 'Schlaf' : 'Sleep', value: '25 %', note: de ? 'Gewicht' : 'weight' },
      { label: 'HRV', value: '22 %', note: de ? 'Gewicht' : 'weight' },
      { label: de ? 'Form (TSB)' : 'Form (TSB)', value: '20 %', note: de ? 'Gewicht' : 'weight' },
      { label: de ? 'Belastung (ACWR)' : 'Load ratio (ACWR)', value: '15 %', note: de ? 'Gewicht' : 'weight' },
      { label: de ? 'Ruhepuls' : 'Resting HR', value: '10 %', note: de ? 'Gewicht' : 'weight' },
      { label: 'Body Battery', value: '8 %', note: de ? 'Gewicht' : 'weight' },
    ],
    inputs: [
      { label: 'HRV', value: data.hrv != null ? `${num(data.hrv, locale)} ms` : DASH },
      { label: de ? 'Ruhepuls' : 'Resting HR', value: data.rhr != null ? `${num(data.rhr, locale)} bpm` : DASH },
      { label: de ? 'Schlaf' : 'Sleep', value: data.sleep != null ? num(data.sleep, locale) : DASH },
      { label: de ? 'Form (TSB)' : 'Form (TSB)', value: data.tsb != null ? signed(data.tsb, locale) : DASH },
    ],
    uncertainty: de
      ? `Fehlt ein Signal, verteilt sich sein Gewicht auf die übrigen — der Score bleibt ehrlich, wird aber weniger sicher. Heute fließen ${present} von 6 möglichen Signalen ein. Der Score ist ein Richtwert, kein Urteil.`
      : `When a signal is missing, its weight is redistributed across the rest — the score stays honest but gets less certain. Today ${present} of 6 possible signals are in play. The score is a guide, not a verdict.`,
    citation: 'Plews et al., Sports Med 2013 · Halson, Sports Med 2008 · Banister 1991',
  }
}

// ─── critical power / eFTP ────────────────────────────────────────────────

export interface CpMethodData {
  cp: number | null
  wPrimeJ: number | null
  eftp: number | null
  /** Goodness of fit, 0–1. */
  rSquared: number | null
  /** Overall model confidence, 0–1 (fit quality × data richness). */
  confidence: number | null
  /** Rides with power that fed the MMP envelope. */
  ridesN: number | null
}

/**
 * The 2-parameter critical-power model (critical_power.py). CP and W′ are fit
 * by least squares over the athlete's own mean-maximal-power envelope in the
 * 2–20 min band; eFTP is the modeled 60-min power.
 */
export function buildCpMethod(locale: Locale, data: CpMethodData): MethodContent {
  const de = locale === 'de'
  const r2 = data.rSquared
  const confPct = data.confidence != null ? Math.round(data.confidence * 100) : null

  const r2Sentence = (() => {
    if (r2 == null) return de ? 'Noch keine Fit-Güte verfügbar.' : 'No fit quality available yet.'
    const r2Str = num(r2, locale, 2)
    if (r2 >= 0.9) {
      return de
        ? `R² = ${r2Str} — deine Punkte liegen sehr nah an der Modell-Geraden.`
        : `R² = ${r2Str} — your points sit very close to the model line.`
    }
    if (r2 >= 0.7) {
      return de
        ? `R² = ${r2Str} — solider Fit, aber deine Efforts streuen etwas.`
        : `R² = ${r2Str} — a solid fit, though your efforts scatter a little.`
    }
    return de
      ? `R² = ${r2Str} — noch grob; ein paar saubere Volleistungen schärfen ihn.`
      : `R² = ${r2Str} — still rough; a few clean maximal efforts will sharpen it.`
  })()

  return {
    eyebrow: de ? 'WIE WIRD DAS BERECHNET?' : 'HOW IS THIS CALCULATED?',
    title: de ? 'Kritische Leistung (CP)' : 'Critical Power (CP)',
    whatItIs: de
      ? 'CP ist die höchste Leistung, die dein aerober Motor theoretisch dauerhaft hält; W′ ist die begrenzte Energie darüber. Beides wird als Gerade P gegen 1/t aus deinen eigenen Bestleistungen gefittet — nicht geschätzt.'
      : "CP is the highest power your aerobic engine can theoretically hold indefinitely; W′ is the finite energy available above it. Both are fit as a straight line of P against 1/t from your own best efforts — not guessed.",
    formula: 'P(t) = CP + W′ / t',
    constants: [
      { label: de ? 'Fit-Fenster' : 'Fit window', value: '2–20 min', note: '120–1200 s' },
      { label: 'eFTP', value: 'CP + W′ / 3600 s' },
      { label: de ? 'Min. Punkte' : 'Min. points', value: '2' },
    ],
    inputs: [
      { label: 'CP', value: data.cp != null ? `${num(data.cp, locale)} W` : DASH },
      { label: 'W′', value: data.wPrimeJ != null ? `${num(data.wPrimeJ / 1000, locale, 1)} kJ` : DASH },
      { label: 'eFTP', value: data.eftp != null ? `${num(data.eftp, locale)} W` : DASH },
      { label: de ? 'Fit-Güte (R²)' : 'Fit quality (R²)', value: r2 != null ? num(r2, locale, 2) : DASH },
      { label: de ? 'Fahrten mit Power' : 'Rides with power', value: data.ridesN != null ? num(data.ridesN, locale) : DASH },
    ],
    uncertainty: de
      ? `${r2Sentence} Die Konfidenz von ${confPct != null ? `${confPct} %` : DASH} kombiniert Fit-Güte mit Datenmenge — sie steigt, je mehr harte Efforts einfließen. Außerhalb von 2–20 min gilt das Modell nicht.`
      : `${r2Sentence} The ${confPct != null ? `${confPct}%` : DASH} confidence combines fit quality with how much data you have — it climbs as more hard efforts land. Outside the 2–20 min band the model does not apply.`,
    citation: 'Monod & Scherrer 1965 · Hill 1993 · Jones et al., MSSE 2010',
  }
}
