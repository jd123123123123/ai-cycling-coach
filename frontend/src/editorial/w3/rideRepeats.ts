/**
 * WAS THIS RIDE A SET OF REPEATS, OR JUST A RIDE WITH HILLS IN IT?
 *
 * The ride page asked "Hast du gehalten?" of every ride with two climbs in it,
 * and judged each climb against a target that was the average of those same
 * climbs. On a free ride outdoors that is self-referential: the target is made
 * of the answer, so roughly half the efforts clear it by construction and the
 * section says nothing at all — in chapter 01, on a screen about a ride nobody
 * prescribed.
 *
 * A repeat SET has a shape an ordinary ride does not. It is the same hill, done
 * again, so the efforts are alike in LENGTH. That is the whole test.
 */

/** Two of anything is a coincidence. */
export const REPEAT_MIN = 3

/** Coefficient of variation on duration: tight means one hill repeated, loose
 *  means a loop that happened to have climbs on it. A quarter allows a set that
 *  drifted as the rider tired and rejects a Sunday ride. */
export const REPEAT_MAX_SPREAD = 0.25

export function looksLikeRepeatSet(durations: number[]): boolean {
  if (durations.length < REPEAT_MIN) return false
  const mean = durations.reduce((a, b) => a + b, 0) / durations.length
  if (mean <= 0) return false
  const sd = Math.sqrt(
    durations.reduce((a, d) => a + (d - mean) ** 2, 0) / durations.length,
  )
  return sd / mean <= REPEAT_MAX_SPREAD
}
