/**
 * Canonical client selectors for the load/form numbers every surface must share.
 *
 * Usability audit P0-5: TSB, days-to-event and the CTL trend were computed
 * independently per surface (with different windows, rounding and date math),
 * so the app contradicted itself (+1 vs +7 form, 138 vs 139 days). These
 * selectors are the ONLY place those numbers may be derived on the client —
 * components must not do their own arithmetic on PMC entries or event dates.
 */

import { differenceInCalendarDays } from 'date-fns'
import type { PMCEntry } from '../api/dashboard'

export interface LoadNow {
  ctl: number
  atl: number
  /** Displayed TSB is derived from the *displayed* CTL/ATL so the visible
   *  arithmetic always reconciles: 33 − 26 = +7 on every surface. */
  tsb: number
  /** CTL change over the trailing 7 days (signed, whole number). */
  dCtl7: number | null
}

/** The one producer for "where is my form right now". */
export function latestLoad(entries: PMCEntry[] | undefined | null): LoadNow | null {
  if (!entries || entries.length === 0) return null
  const last = entries[entries.length - 1]
  const ctl = Math.round(last.ctl)
  const atl = Math.round(last.atl)
  const prev7 = entries.length >= 8 ? entries[entries.length - 8] : null
  return {
    ctl,
    atl,
    tsb: ctl - atl,
    dCtl7: prev7 ? Math.round(last.ctl - prev7.ctl) : null,
  }
}

/**
 * The one producer for "how many days until the event".
 * Calendar-day difference in the browser's local timezone — never Math.round
 * or Math.ceil over millisecond arithmetic (those flip at noon / disagree by 1).
 */
export function daysToEvent(eventDate: string | Date | undefined | null, now: Date = new Date()): number | null {
  if (!eventDate) return null
  const target = typeof eventDate === 'string' ? new Date(`${eventDate.slice(0, 10)}T00:00:00`) : eventDate
  if (Number.isNaN(target.getTime())) return null
  return differenceInCalendarDays(target, now)
}

/** Local calendar-day key (yyyy-MM-dd) of a stored UTC timestamp — the only
 *  sanctioned way to bucket an activity onto a day on the client. Never use
 *  `iso.slice(0, 10)` on a UTC string: a 00:30 Berlin ride lands on the wrong day. */
export function localDayKey(ts: string | Date): string {
  const d = typeof ts === 'string' ? new Date(ts) : ts
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** True when the stored timestamp falls on the browser-local current day. */
export function isTodayLocal(isoTimestamp: string, now: Date = new Date()): boolean {
  return localDayKey(isoTimestamp) === localDayKey(now)
}

/**
 * TSB → fitness/form state, used by the Load & Form hero. The ONLY place the
 * form bands are defined so the hero number, the pill and the gauge can never
 * disagree. Neutral tone by contract: the banned words Verletzung / Gefahr /
 * Untertraining (project science-methods avoid-list) never appear.
 */
export interface FormState {
  label: string
  /** CSS custom-property reference for the band colour. */
  color: string
  sub: string
}
/** CTL lost per week below which high freshness is detraining, not a taper.
 *  A taper sheds ~2–4 CTL/week while holding the engine; a genuine layoff
 *  sheds more, and keeps shedding. */
export const DETRAINING_CTL_DROP = 4

export function classifyForm(
  tsb: number | null,
  de: boolean,
  /** CTL change over the last 7 days, when known. High TSB means opposite
   *  things depending on this sign, so the top band cannot be read off TSB
   *  alone — see below. */
  dCtl7: number | null = null,
): FormState {
  if (tsb == null) return { label: '—', color: 'var(--color-muted)', sub: de ? 'Noch keine Lastdaten' : 'No load data yet' }
  if (tsb <= -15) return { label: de ? 'Überlastet' : 'Overreached', color: 'var(--color-move)', sub: de ? 'Hohe Ermüdung — Erholung einplanen' : 'High fatigue — plan recovery' }
  if (tsb <= -5) return { label: de ? 'Aufbauend' : 'Building', color: 'var(--color-amber)', sub: de ? 'Produktive Last — Fitness wächst' : 'Productive load — fitness rising' }
  if (tsb <= 10) return { label: de ? 'Optimal' : 'Sweet spot', color: 'var(--color-recovery)', sub: de ? 'Ausgewogen — bereit für Qualität' : 'Balanced — ready for quality' }
  // TSB > 10 has two completely different causes and the number cannot tell
  // them apart. Shed fatigue on top of a held CTL is a taper — race sharpness.
  // Shed fatigue because no training happened is detraining, and calling that
  // "ideal for racing" congratulates an athlete for a week off the bike. The
  // CTL trend is the discriminator, so when it is known and clearly falling,
  // the band says so instead.
  if (dCtl7 != null && dCtl7 <= -DETRAINING_CTL_DROP) {
    return {
      label: de ? 'Frisch' : 'Fresh',
      color: 'var(--color-amber)',
      sub: de ? 'Ausgeruht, aber die Fitness fällt — Zeit zurückzukommen' : 'Rested, but fitness is slipping — time to get back on',
    }
  }
  return { label: de ? 'Frisch' : 'Fresh', color: 'var(--color-strain)', sub: de ? 'Sehr frisch — ideal für den Wettkampf' : 'Very fresh — ideal for racing' }
}
