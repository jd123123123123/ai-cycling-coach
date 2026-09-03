import type { CrewRide } from '../../api/crewRides'

/**
 * The feed shell's pure parts — what a cut means, who counts as a story, and
 * what the dated eyebrow says.
 *
 * Split out of the page because each of these is a rule rather than a layout,
 * and a rule with a test on it is worth more than a rule inside a JSX tree.
 */

export type W3FeedTab = 'crew' | 'all' | 'challenges' | 'records'

/**
 * THE FOUR CHIPS OF THE PEN, ALL OF THEM NOW REAL.
 *
 * `dly9G` shows Crew / Alle / Challenges / Rekorde. An earlier version of this
 * file cut that down to three and said in a comment that "Rekorde" would be a
 * chip filtering nothing, because no per-ride record flag existed. That is no
 * longer true and the comment was outliving its fact: `crew_records` now
 * batches personal-best detection over the whole feed page and every ride
 * carries `record`, and `/crews/challenges` returns the crew's live
 * challenges. Both chips have something to show, so the pen's row stands.
 *
 * CREW is everyone but you — the pen selects it first, and it is the right
 * default for a screen about other people. ALLE widens it to include your own
 * rides. REKORDE keeps only the rides that beat something. CHALLENGES is not a
 * cut of rides at all: it swaps the list for the crew's challenges, which is
 * why this function returns an empty array for it rather than pretending.
 */
export function tabRides(rides: CrewRide[], tab: W3FeedTab): CrewRide[] {
  if (tab === 'crew') return rides.filter((r) => !r.is_mine)
  if (tab === 'records') return rides.filter((r) => r.record != null)
  if (tab === 'challenges') return []
  return rides
}

/** Local midnight — the boundary "today" actually means to a rider. */
function startOfToday(now: Date): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Who appears on the rail.
 *
 * A crew-mate WHO RODE TODAY, newest first, one entry per rider — their most
 * recent ride. Not "is riding right now": the app learns about a ride when it
 * syncs, minutes to hours after the wheels stopped, so a rail claiming live
 * activity would claim something it cannot know.
 *
 * One per rider because a rail is a list of people, not of rides. Somebody who
 * commuted twice is one face, and it is their latest ride behind it.
 */
export function storiesFromRides<T>(
  rides: CrewRide[],
  now: Date,
  make: (ride: CrewRide) => T,
): T[] {
  const since = startOfToday(now)
  const newestByRider = new Map<number, CrewRide>()
  for (const r of rides) {
    const t = new Date(r.started_at).getTime()
    if (Number.isNaN(t) || t < since) continue
    const held = newestByRider.get(r.user_id)
    if (!held || new Date(held.started_at).getTime() < t) newestByRider.set(r.user_id, r)
  }
  return [...newestByRider.values()]
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    .map(make)
}

const DAYS = ['SONNTAG', 'MONTAG', 'DIENSTAG', 'MITTWOCH', 'DONNERSTAG', 'FREITAG', 'SAMSTAG']

/**
 * "MITTWOCH · 18:24".
 *
 * The pen prints a clock, and a clock is the part worth thinking about: a time
 * rendered once at mount is wrong within the minute and stays wrong for as
 * long as the screen is open. This is stamped when the feed is built, which is
 * a fact about the feed rather than a claim about now — and it is what a rider
 * actually wants to know about a list of other people's rides.
 */
export function feedHeadEyebrow(now: Date = new Date()): string {
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return `${DAYS[now.getDay()]} · ${hh}:${mm}`
}


/** "2026-03-14" → "MÄRZ", for the record card's old rail. Null in, null out. */
const MONTHS = [
  'JANUAR', 'FEBRUAR', 'MÄRZ', 'APRIL', 'MAI', 'JUNI',
  'JULI', 'AUGUST', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DEZEMBER',
]

export function recordMonth(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : MONTHS[d.getMonth()]
}

/**
 * The single record worth raising to a headline.
 *
 * Any ride that set one already wears a chip on its own post; this picks the
 * ONE that becomes a card, by the size of the gain. Two cards making the same
 * claim at two weights is the restatement this feed keeps deleting, so there
 * is exactly one, or none.
 */
export function headlineRecord(rides: CrewRide[]): CrewRide | null {
  const withRecord = rides.filter((r) => r.record != null)
  if (withRecord.length === 0) return null
  return withRecord.reduce((best, r) =>
    (r.record!.gain_pct > best.record!.gain_pct ? r : best))
}
