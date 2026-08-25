import { COVER_PLATES } from './w3tokens'

/**
 * DAS COVER — which issue the auth screen prints today.
 *
 * The sign-in screen used to be one photograph that never changed: a black
 * bike, on a black plinth, on a black ground, behind a gradient. Handsome, and
 * completely forgettable — the first thing anybody ever sees of this app said
 * "another dark fitness app".
 *
 * So it is a cover series instead. One bike, one ink, one issue number, and a
 * different one every day. That is not decoration dressed as a feature: this
 * app's whole thesis is that a bike is an object worth photographing, and the
 * cover is that thesis stated before a rider has typed anything.
 *
 * THE ISSUE IS THE DAY, not a random number. A rider who signs in twice in one
 * morning sees the same cover both times — a cover that reshuffled on every
 * mount would read as a broken slideshow rather than as today's issue. It also
 * means the number on the spine is true: issue 237 is the 237th day.
 *
 * ONE INK PER ISSUE. The bike renders are all shot on the same near-white
 * studio ground (`public/w3/bikes/`, the locked drive-side camera), so
 * greyscaling one and multiplying it into the field prints it in that field's
 * colour — the whole set becomes usable as duotones, and no plate ever needs
 * its own artwork.
 */

export interface CoverPlate {
  key: string
  /** Printed on the spine — the ink's name, not a hex. */
  name: string
  /** The ink: the field, the bike's duotone, and the button all take it. */
  field: string
  /** The only type colour allowed on the field. Contrast is pre-checked. */
  onField: string
}

export interface CoverIssue {
  /** Day of the year. Printed as `AUSGABE 237`. */
  no: number
  plate: CoverPlate
  /** Path under `public/` of the bike this issue is shot with. */
  bike: string
  /** What is pictured, credited on the spine the way a cover credits its cover star. */
  credit: string
}

/**
 * The bikes that can carry a cover. A curated subset of `public/w3/bikes/`,
 * not the whole folder: every one of these reads as a SHAPE at 300 px once it
 * is a duotone, which is the only thing that matters here. `rustbucket` and
 * the softer commuters are left out for that reason and no other.
 */
export const COVER_BIKES = [
  'pro-track',
  'steel-fixie',
  'pro-tt',
  'carbon-aero',
  'pro-worldtour',
  'steel-retro',
  'alloy-crit',
  'carbon-gravel',
] as const

/** `steel-fixie` → `STEEL FIXIE`. The file name IS the credit — there is no
 *  second list of pretty names to drift out of sync with the folder. */
export function bikeCredit(slug: string): string {
  return slug.replace(/-/g, ' ').toUpperCase()
}

/**
 * Day of the year, 1–366.
 *
 * Built from the date PARTS through `Date.UTC`, never by subtracting two local
 * timestamps: Europe/Berlin puts the clocks forward on the last Sunday in
 * March, so from April onward a millisecond subtraction is an hour short and
 * `Math.floor` quietly returns the previous day. 25 August 2026 came out as
 * issue 236. UTC has no such Sunday, and the local parts going in mean the day
 * still turns over at the rider's midnight.
 */
export function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getFullYear(), 0, 0)
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.floor((today - start) / 86_400_000)
}

/** Today's issue. Pure in `date`, so the cover is testable and stable. */
export function coverIssue(date: Date): CoverIssue {
  const no = dayOfYear(date)
  const plate = COVER_PLATES[no % COVER_PLATES.length] as CoverPlate
  const bike = COVER_BIKES[no % COVER_BIKES.length]
  return { no, plate, bike: `/w3/bikes/${bike}.webp`, credit: bikeCredit(bike) }
}
