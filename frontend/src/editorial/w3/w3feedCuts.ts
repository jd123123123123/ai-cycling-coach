import type { CrewRide } from '../../api/crewRides'

/**
 * The feed shell's pure parts — what a cut means, who counts as a story, and
 * what the dated eyebrow says.
 *
 * Split out of the page because each of these is a rule rather than a layout,
 * and a rule with a test on it is worth more than a rule inside a JSX tree.
 */

export type W3FeedCut = 'all' | 'crew' | 'mine'

/**
 * THE CUTS ARE THE ONES THE DATA CAN MAKE.
 *
 * The pen shows Crew / Alle / Challenges / Rekorde. There is no non-crew feed
 * in this app to widen "Alle" beyond the crew, and no per-member record flag
 * to filter "Rekorde" on — so those two would be chips that filter nothing,
 * which is the dead control this repository grows faster than it removes.
 *
 * ALLE is every ride the crew endpoint returned, CREW is everyone but you, and
 * MEINE is only yours. Three cuts, each one a question a rider actually asks
 * of a feed, each one answerable from the payload that is already here.
 */
export function cutRides(rides: CrewRide[], cut: W3FeedCut): CrewRide[] {
  if (cut === 'crew') return rides.filter((r) => !r.is_mine)
  if (cut === 'mine') return rides.filter((r) => r.is_mine)
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
