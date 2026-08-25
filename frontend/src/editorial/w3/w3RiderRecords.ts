import type { RiderRecords } from '../../api/records'
import type { HighlightRecord } from './W3RiderHighlights'

/**
 * `/achievements/records` → the four cards the profile's bento draws.
 *
 * A separate module because it is the only part of the profile with real
 * arithmetic in it, and arithmetic that nothing can test is how a screen ends
 * up quietly printing "0:00" as somebody's longest ride.
 *
 * THE ORDER IS FIXED, not the server's key order: the bento's first tile is
 * the acid one, so whichever record leads is the one the rider sees first, and
 * that should be the same card every time they open the page rather than
 * whatever the JSON happened to enumerate.
 *
 * A NULL RECORD IS DROPPED, NEVER ZEROED. The backend returns null when no ride
 * clears the floor (`rider_records._FIELDS`), and a celebration screen showing
 * a personal best of nothing is worse than one showing three cards.
 */

const DE = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })
const DE0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 })

/** `8:12` — hours and minutes, the way a ride is talked about. */
function hoursMinutes(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** `4. Mai` — the day it happened, never the year: these are all this rider's
 *  own rides and the year adds a column of noise to four small captions. */
function germanDay(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
}

interface Spec { label: string; format: (value: number) => { value: string; unit: string } }

/** Keyed by the backend's own record keys (`rider_records._FIELDS`). A key that
 *  is not here is ignored rather than guessed at — a new server record shows up
 *  as nothing on screen, which is visible and safe, instead of as a card
 *  labelled with its raw key. */
const SPEC: Record<string, Spec> = {
  longest_ride_km: {
    label: 'LÄNGSTE FAHRT',
    format: (v) => ({ value: DE.format(v), unit: 'km' }),
  },
  highest_climb_m: {
    label: 'HÖCHSTER ANSTIEG',
    // The API says `m`; riders say Höhenmeter. Same number, the word they use.
    format: (v) => ({ value: DE0.format(Math.round(v)), unit: 'hm' }),
  },
  longest_time_s: {
    label: 'LÄNGSTE ZEIT',
    format: (v) => ({ value: hoursMinutes(v), unit: 'Std.' }),
  },
  hardest_ride_tss: {
    label: 'HÄRTESTE FAHRT',
    format: (v) => ({ value: DE0.format(Math.round(v)), unit: 'TSS' }),
  },
}

/** The order the bento lays them out in. */
export const RECORD_ORDER = ['longest_ride_km', 'highest_climb_m', 'longest_time_s', 'hardest_ride_tss'] as const

export function highlightRecords(records: RiderRecords | undefined): HighlightRecord[] {
  if (!records) return []
  const out: HighlightRecord[] = []
  for (const key of RECORD_ORDER) {
    const rec = records[key]
    const spec = SPEC[key]
    if (!rec || !spec || !Number.isFinite(rec.value)) continue
    const { value, unit } = spec.format(rec.value)
    out.push({
      key,
      value,
      unit,
      label: spec.label,
      ride: rec.title?.trim() || null,
      when: germanDay(rec.at),
    })
  }
  return out
}
