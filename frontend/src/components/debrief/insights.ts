// The interpretation layer — turns the raw analyzer blocks into plain-language,
// color-coded "reads": what happened, what it means, and what to do about it.
// This is what makes the debrief legible at a glance (WHOOP-style status +
// coaching) instead of a wall of numbers. Pure, bilingual, no rendering.
import type { RaceDebrief } from '../../api/debrief'

export type Status = 'good' | 'ok' | 'watch' | 'bad'

export interface Read {
  /** stable key for React lists */
  key: string
  status: Status
  /** the headline metric, e.g. "6.2%" or "3 matches" */
  metric?: string
  /** short title, e.g. "Cardiac drift" */
  title: string
  /** the plain-language read — what it means */
  read: string
  /** optional imperative — what to do about it */
  doThis?: string
  /** rank weight — higher surfaces first in Key Reads */
  weight: number
}

export const STATUS_COLOR: Record<Status, string> = {
  good: 'var(--color-good)',
  ok: 'var(--color-ink-blue)',
  watch: 'var(--color-caution)',
  bad: 'var(--color-bad)',
}

export const STATUS_LABEL = (s: Status, de: boolean): string =>
  ({
    good: de ? 'Stark' : 'Strong',
    ok: de ? 'Solide' : 'Solid',
    watch: de ? 'Achtung' : 'Watch',
    bad: de ? 'Kritisch' : 'Flag',
  })[s]

const r = (o: Read): Read => o

/** Build every interpreted read the ride supports (unordered). */
export function buildReads(d: RaceDebrief, de: boolean): Read[] {
  const out: Read[] = []
  const p = d.pacing
  const eff = d.efficiency
  const mb = d.matchbook
  const fu = d.fueling
  const wko = d.wko

  // ── Pacing: split ─────────────────────────────────────────────
  if (p) {
    const s = p.split_pct
    if (s < -8) {
      out.push(r({ key: 'split', status: 'bad', metric: `${s.toFixed(1)}%`,
        title: de ? 'Positiver Split' : 'Positive split',
        read: de ? `Deine zweite Hälfte lag ${Math.abs(s).toFixed(0)} % unter der ersten — du bist eingebrochen.`
                 : `Your second half was ${Math.abs(s).toFixed(0)}% down on the first — you faded.`,
        doThis: de ? 'Starte ~5 % ruhiger; ziele auf einen negativen Split.' : 'Start ~5% easier and aim to negative-split.',
        weight: 90 }))
    } else if (s < -3) {
      out.push(r({ key: 'split', status: 'watch', metric: `${s.toFixed(1)}%`,
        title: de ? 'Leicht nachgelassen' : 'Slight fade',
        read: de ? `Die zweite Hälfte war ${Math.abs(s).toFixed(0)} % schwächer — noch im Rahmen.`
                 : `Second half ${Math.abs(s).toFixed(0)}% weaker — within reason, but watch it.`,
        weight: 55 }))
    } else {
      out.push(r({ key: 'split', status: 'good', metric: `${s > 0 ? '+' : ''}${s.toFixed(1)}%`,
        title: de ? 'Gleichmäßig gefahren' : 'Evenly paced',
        read: de ? 'Erste und zweite Hälfte fast identisch — vorbildliche Pace-Disziplin.'
                 : 'First and second halves almost identical — textbook pacing discipline.',
        weight: 40 }))
    }
    // Variability
    if (p.variability_index != null && p.variability_index > 1.25) {
      out.push(r({ key: 'vi', status: 'watch', metric: p.variability_index.toFixed(2),
        title: de ? 'Sehr wechselhaft' : 'Very surgy',
        read: de ? 'Viele harte Antritte statt gleichmäßiger Leistung — teuer für einen langen Tag.'
                 : 'Lots of hard accelerations rather than steady power — expensive over a long day.',
        doThis: de ? 'Auf Flachstücken die Leistung glätten.' : 'Smooth the power on flat sections.',
        weight: 50 }))
    }
  }

  // ── Matchbook ─────────────────────────────────────────────────
  if (mb) {
    if (mb.fully_depleted) {
      out.push(r({ key: 'match', status: 'bad', metric: `${mb.match_count}`,
        title: de ? 'Tank geleert' : 'Emptied the tank',
        read: de ? `Du hast ${mb.match_count} Streichhölzer verbrannt und W′ komplett entleert — nichts blieb für den Schluss.`
                 : `You burned ${mb.match_count} matches and drained W′ to zero — nothing left for the finale.`,
        doThis: de ? 'Frühe Antritte rationieren; VO₂-Intervalle heben W′.' : 'Ration early surges; VO₂ intervals raise W′.',
        weight: 85 }))
    } else {
      out.push(r({ key: 'match', status: 'good', metric: `${mb.match_count}`,
        title: de ? 'Streichhölzer geschont' : 'Matches rationed',
        read: de ? `${mb.match_count} Antritte, aber die anaerobe Reserve blieb intakt — clever eingeteilt.`
                 : `${mb.match_count} surges but your anaerobic reserve held — you paced the anaerobic system well.`,
        weight: 35 }))
    }
  }

  // ── Efficiency / decoupling ───────────────────────────────────
  if (eff && eff.decoupling_pct != null) {
    const dc = eff.decoupling_pct
    if (dc > 10) {
      out.push(r({ key: 'dec', status: 'bad', metric: `${dc.toFixed(1)}%`,
        title: de ? 'Herzfrequenz-Drift' : 'Cardiac drift',
        read: de ? `Deine HF stieg spät um ${dc.toFixed(0)} % bei gleicher Leistung — ein Zeichen für zu wenig Kohlenhydrate oder zu harte Pace.`
                 : `Your HR climbed ${dc.toFixed(0)}% late for the same power — a sign of under-fuelling or too-hard pacing.`,
        doThis: de ? 'Früher essen und Startpace senken.' : 'Fuel earlier and ease the opening pace.',
        weight: 70 }))
    } else if (dc > 5) {
      out.push(r({ key: 'dec', status: 'watch', metric: `${dc.toFixed(1)}%`,
        title: de ? 'Etwas Drift' : 'Some drift',
        read: de ? `${dc.toFixed(1)} % HF-Drift — akzeptabel, aber näher an 5 % ist besser.`
                 : `${dc.toFixed(1)}% cardiac drift — acceptable, but closer to 5% is better.`,
        weight: 40 }))
    } else {
      out.push(r({ key: 'dec', status: 'good', metric: `${dc.toFixed(1)}%`,
        title: de ? 'Form gehalten' : 'Held your form',
        read: de ? `Nur ${dc.toFixed(1)} % Drift — gut versorgt und sauber gefahren.`
                 : `Only ${dc.toFixed(1)}% drift — well fuelled and cleanly paced.`,
        weight: 30 }))
    }
  }

  // ── Fueling ───────────────────────────────────────────────────
  if (fu && fu.likely_underfueled) {
    const [lo, hi] = fu.carb_target_g_per_h
    out.push(r({ key: 'fuel', status: 'bad',
      title: de ? 'Unterversorgt' : 'Under-fuelled',
      read: de ? `${Math.round(fu.total_kj)} kJ verbrannt, aber die späte Ermüdung deutet auf ein Kohlenhydrat-Defizit.`
               : `You burned ${Math.round(fu.total_kj)} kJ, and the late fatigue points to a carbohydrate deficit.`,
      doThis: de ? `Ab dem Start ${Math.round(lo)}–${Math.round(hi)} g KH/h aufnehmen.` : `Take ${Math.round(lo)}–${Math.round(hi)} g carbs/h from the gun.`,
      weight: 75 }))
  }

  // ── Efforts: PRs ──────────────────────────────────────────────
  const prs = (d.efforts ?? []).filter((e) => e.is_pr)
  if (prs.length) {
    const best = prs.reduce((a, b) => ((b.pct_of_best ?? 0) > (a.pct_of_best ?? 0) ? b : a))
    out.push(r({ key: 'pr', status: 'good', metric: `${prs.length} PR${prs.length > 1 ? 's' : ''}`,
      title: de ? 'Neue Bestwerte' : 'New power records',
      read: de ? `Du hast ${prs.length} Leistungs-Rekord${prs.length > 1 ? 'e' : ''} aufgestellt — u. a. ${Math.round(best.ride_watts)} W über ${durLabel(best.duration_s, de)}.`
               : `You set ${prs.length} power record${prs.length > 1 ? 's' : ''} this ride — including ${Math.round(best.ride_watts)} W for ${durLabel(best.duration_s, de)}.`,
      weight: 60 }))
  } else {
    // near-max highlight
    const near = (d.efforts ?? []).filter((e) => (e.pct_of_best ?? 0) >= 95)
    if (near.length) {
      const top = near.reduce((a, b) => ((b.pct_of_best ?? 0) > (a.pct_of_best ?? 0) ? b : a))
      out.push(r({ key: 'near', status: 'ok', metric: `${Math.round(top.pct_of_best ?? 0)}%`,
        title: de ? 'Nah am Limit' : 'Near your ceiling',
        read: de ? `Deine ${durLabel(top.duration_s, de)}-Leistung lag bei ${Math.round(top.pct_of_best ?? 0)} % deiner Bestleistung.`
                 : `Your ${durLabel(top.duration_s, de)} power reached ${Math.round(top.pct_of_best ?? 0)}% of your best.`,
        weight: 33 }))
    }
  }

  // ── Power model ───────────────────────────────────────────────
  if (wko) {
    out.push(r({ key: 'wko', status: 'ok', metric: `${Math.round(wko.mftp_watts)} W`,
      title: de ? 'Modell-FTP' : 'Modelled FTP',
      read: de ? `Aus dieser Fahrt: mFTP ${Math.round(wko.mftp_watts)} W, W′ ${(wko.w_prime_j / 1000).toFixed(1)} kJ${wko.vo2max_estimate != null ? `, VO₂max ~${wko.vo2max_estimate.toFixed(0)}` : ''}.`
               : `From this ride: mFTP ${Math.round(wko.mftp_watts)} W, W′ ${(wko.w_prime_j / 1000).toFixed(1)} kJ${wko.vo2max_estimate != null ? `, VO₂max ~${wko.vo2max_estimate.toFixed(0)}` : ''}.`,
      weight: 20 }))
  }

  return out
}

/** Top N reads, most important first — for the Key Reads band. */
export function keyReads(d: RaceDebrief, de: boolean, n = 4): Read[] {
  return [...buildReads(d, de)].sort((a, b) => b.weight - a.weight).slice(0, n)
}

function durLabel(seconds: number, de: boolean): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.round(seconds / 60)
  return de ? `${m} min` : `${m} min`
}
