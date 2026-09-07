import type { FormProjection } from '../../api/formProjection'

/**
 * W3 · FORM VORAUS — every sentence and every formatted number on the card.
 *
 * A pure `.ts` module rather than four more exports out of the `.tsx`, for the
 * reason `w3surfaces.ts` states: a file that exports components may export
 * nothing else without failing `react-refresh/only-export-components`.
 *
 * It exists at all because `/analytics/form-projection` speaks ENGLISH. Its
 * `model_reason`, `load.assumption` and `uncertainty.covers` are the
 * inspectable record of how the number was made — they are not app copy, and
 * rendering them would put English prose in a German card. So the card composes
 * its own lines from the RESOLVED codes beside them (`fallback_reason`,
 * `load.source`, `planned_days`, the observation counts), which is this app's
 * copy rule anyway: state what the number is, from values that are already
 * decided, and stop.
 */

const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })

/** Signed, rounded, with a real minus sign — a hyphen next to a 56 px numeral
 *  reads as a dash, not as a negative. */
export function signedForm(v: number): string {
  const r = Math.round(v)
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)}`
}

/**
 * Which model is in use and — when it is the standard one — which gate stopped
 * the individual fit.
 *
 * The fallback branches are deliberately unhedged. "Für ein eigenes Modell
 * fehlen dir noch 3 harte Einheiten" is a fact with a next step in it; "leider
 * konnten wir noch kein persönliches Modell berechnen" is an apology that
 * tells the rider nothing they can act on.
 */
export function formProjectionModelLine(d: FormProjection): string {
  const c = d.constants
  if (d.model === 'individual' && c) {
    return `Aus ${c.n_observations} nahezu maximalen 20-Minuten-Werten gefittet. Deine Fitness zerfällt über ${nf1.format(c.tau1_days)} Tage, deine Ermüdung über ${nf1.format(c.tau2_days)} — nicht über 42 und 7.`
  }
  // No "Standardkonstanten 42 / 7" prefix here: the eyebrow already says
  // STANDARD 42 / 7 and the tile under it repeats the numbers. Saying it a
  // third time buys nothing and pushes the one sentence a rider can ACT on
  // down to the end of the paragraph.
  switch (d.fallback_reason) {
    case 'too_few_performance_observations': {
      const have = c?.n_observations ?? 0
      const need = c?.n_observations_required ?? 0
      const missing = need - have
      if (missing > 0) {
        return `Für ein eigenes Modell fehlen dir noch ${missing} harte ${missing === 1 ? 'Einheit' : 'Einheiten'} — ${have} von ${need} nahezu maximalen 20-Minuten-Werten liegen vor.`
      }
      return 'Für ein eigenes Modell liegen noch zu wenige nahezu maximale 20-Minuten-Werte vor.'
    }
    case 'fit_not_identifiable':
      return 'Deine Leistungshistorie ist zu flach — aus ihr lassen sich keine eigenen Zeitkonstanten bestimmen.'
    case 'standard_constants_fit_better':
      return 'Dein eigener Fit war seine zwei zusätzlichen Parameter nicht wert: auf AICc gewinnt 42 / 7.'
    case 'fit_not_scorable':
    case 'standard_model_not_scorable':
      return 'Der Vergleich der beiden Modelle war auf deinen Daten nicht berechenbar.'
    default:
      return 'Für ein eigenes Modell reichen deine Daten noch nicht.'
  }
}

/** What load the curve assumed, and whether anybody actually planned it. */
export function formProjectionLoadLine(d: FormProjection): string {
  const l = d.load
  if (!l) return ''
  const avg = nf1.format(l.rolling_7d_tss)
  if (l.source === 'plan') return `Die Kurve rechnet über alle ${l.horizon_days} Tage mit deinem Plan.`
  if (l.source === 'mixed') {
    return `Plan bis Tag ${l.planned_days}. Danach rechnet die Kurve mit deinem 7-Tage-Schnitt von ${avg} TSS/Tag — geplant hat das niemand.`
  }
  return `Kein Plan deckt diese ${l.horizon_days} Tage. Die Kurve nimmt an, dass dein 7-Tage-Schnitt von ${avg} TSS/Tag so weiterläuft — geplant hat das niemand.`
}

/** Why there is no projection, in day counts rather than in an excuse. */
export function formProjectionUnavailableLine(d: FormProjection): string {
  if (d.reason === 'no_history') {
    return 'Noch keine aufgezeichnete Fahrt. Das Modell beginnt zu rechnen, sobald die erste Einheit da ist.'
  }
  if (d.reason === 'insufficient_history' && d.history_days != null && d.history_days_required != null) {
    return `${d.history_days} von ${d.history_days_required} Tagen Historie. Darunter gibt es keinen Verlauf, den man belastbar fortschreiben könnte.`
  }
  return 'Für eine Projektion fehlen noch Daten.'
}

